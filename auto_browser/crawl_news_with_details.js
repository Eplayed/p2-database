const puppeteer = require('puppeteer');
const OSS = require('ali-oss');
const fs = require('fs');
const path = require('path');
const envConfig = require('./env-config');
const { crawlMultipleArticles, uploadDetailsToOSS } = require('./crawl_news_detail');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// --- 配置区域 ---
const TARGET_URL = 'https://www.caimogu.cc/circle/449.html'; // 采蘑菇 PoE2 专区
const OUTPUT_FILE = 'news_caimogu.json';

// OSS 配置 (使用环境变量 + env-config)
const OSS_CONFIG = {
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET
};

// 代理配置
const USE_PROXY = process.env.USE_PROXY === "true";
const LOCAL_PROXY = "http://127.0.0.1:7890";

// 确保 data 目录存在
const OUTPUT_DIR = envConfig.dataDir;
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// --- 核心逻辑 ---

async function crawlNewsWithDetails() {
    console.log('📰 [新闻爬虫 V2.0 - 含详情] 启动...');

    // 构建启动参数
    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080'
    ];

    if (USE_PROXY) {
        console.log(`   🌐 使用本地代理: ${LOCAL_PROXY}`);
        launchArgs.push(`--proxy-server=${LOCAL_PROXY}`);
    }

    // 启动浏览器 (配置反爬参数)
    const browser = await puppeteer.launch({
        headless: process.env.CI ? "new" : false,
        args: launchArgs,
        defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();

    // --- 反爬虫核心技巧 ---
    await page.setUserAgent(USER_AGENT);
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    try {
        console.log(`🌐 正在访问: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        const selector = '.fast-navigate.block';
        await page.waitForSelector(selector, { timeout: 10000 });
        console.log('✅ 页面加载完成，开始提取数据...');

        // --- 提取文章列表 ---
        const newsData = await page.evaluate(() => {
            const results = [];
            const container = document.querySelector('.fast-navigate.block .content-container');
            if (!container) return [];

            const navBlocks = container.querySelectorAll('.nav');
            console.log(`找到 ${navBlocks.length} 个分类板块`);

            navBlocks.forEach((nav, index) => {
                const labelEl = nav.querySelector('.label');
                const categoryName = labelEl ? labelEl.innerText.trim() : `分类 ${index + 1}`;

                const linkItems = [];
                const listEl = nav.querySelector('.list');

                if (listEl) {
                    const links = listEl.querySelectorAll('.item');
                    links.forEach(link => {
                        const title = link.innerText.trim();
                        const href = link.href;

                        if (title && href) {
                            linkItems.push({
                                title: title,
                                url: href,
                                is_new: title.includes('新')
                            });
                        }
                    });
                }

                if (linkItems.length > 0) {
                    results.push({
                        category: categoryName,
                        articles: linkItems
                    });
                }
            });

            return results;
        });

        console.log(`📊 抓取成功，共获取 ${newsData.length} 个分类板块`);

        // --- 构造最终 JSON ---
        const finalJson = {
            updated_at: new Date().toISOString(),
            source: 'caimogu',
            source_url: TARGET_URL,
            data: newsData
        };

        // 保存到本地
        const savePath = path.join(OUTPUT_DIR, OUTPUT_FILE);
        fs.writeFileSync(savePath, JSON.stringify(finalJson, null, 2));
        console.log(`   ✅ 列表数据已保存: ${savePath}`);

        // --- 收集所有文章 URL ---
        const allUrls = [];
        newsData.forEach(category => {
            category.articles.forEach(article => {
                allUrls.push(article.url);
            });
        });

        console.log(`\n📋 共收集到 ${allUrls.length} 篇文章链接`);

        // --- 调用详情页爬虫（不单独上传，只保存到本地）---
        let detailResults = [];
        if (allUrls.length > 0) {
            const concurrency = process.env.CI ? 2 : 1; // CI 环境使用并发
            await page.close().catch(() => {});
            detailResults = await crawlMultipleArticles(allUrls, concurrency, browser);
        }

        // --- 收集详情文件路径 ---
        const detailFiles = detailResults.map(result => result.filePath).filter(Boolean);

        // --- 批量上传所有文件到 OSS ---
        if (OSS_CONFIG.accessKeyId && OSS_CONFIG.accessKeySecret && OSS_CONFIG.bucket) {
            console.log('\n☁️ 正在上传所有文件至阿里云 OSS...');

            const client = new OSS(OSS_CONFIG);

            // 1. 上传列表文件
            const ossPath = `${envConfig.ossPath}${OUTPUT_FILE}`;
            const content = Buffer.from(JSON.stringify(finalJson, null, 2));
            await client.put(ossPath, content);
            console.log(`   ✅ 列表已上传: ${ossPath}`);

            // 2. 批量上传详情文件
            await uploadDetailsToOSS(detailFiles);

            console.log('🎉 所有文件上传完成！');
            console.log('OSS 列表 URL:', `http://${OSS_CONFIG.bucket}.${OSS_CONFIG.region}.aliyuncs.com/${ossPath}`);
        } else {
            console.warn('⚠️ OSS 配置不完整，跳过上传');
        }

        return finalJson;

    } catch (error) {
        console.error('❌ 爬虫任务出错:', error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

// 主入口
if (require.main === module) {
    crawlNewsWithDetails().catch(console.error);
}

module.exports = { crawlNewsWithDetails };
