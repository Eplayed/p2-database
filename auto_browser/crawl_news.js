const puppeteer = require('puppeteer');
const OSS = require('ali-oss');
const fs = require('fs');
const path = require('path');
const envConfig = require('./env-config');
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

async function crawlNews() {
    console.log('📰 [新闻爬虫 V1.0] 启动...');

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
    // 1. 设置真实的 User-Agent
    await page.setUserAgent(USER_AGENT);

    // 2. 注入脚本，隐藏 navigator.webdriver 属性 (绕过简单的指纹检测)
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    try {
        console.log(`🌐 正在访问: ${TARGET_URL}`);

        // 访问页面，等待网络空闲或关键元素加载
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // 等待关键 DOM 结构加载出来
        const selector = '.fast-navigate.block';
        await page.waitForSelector(selector, { timeout: 10000 });
        console.log('✅ 页面加载完成，开始提取数据...');

        // --- 在浏览器上下文中执行抓取逻辑 ---
        const newsData = await page.evaluate(() => {
            const results = [];

            // 1. 定位整个导航块
            const container = document.querySelector('.fast-navigate.block .content-container');
            if (!container) return [];

            // 2. 遍历每一个分类
            const navBlocks = container.querySelectorAll('.nav');

            console.log(`找到 ${navBlocks.length} 个分类板块`);

            navBlocks.forEach((nav, index) => {
                // 获取分类标题 (例如 "0.4 新赛季...")
                const labelEl = nav.querySelector('.label');
                const categoryName = labelEl ? labelEl.innerText.trim() : `分类 ${index + 1}`;

                // 获取该分类下的所有链接
                const linkItems = [];
                const listEl = nav.querySelector('.list');

                if (listEl) {
                    const links = listEl.querySelectorAll('.item');

                    links.forEach(link => {
                        const title = link.innerText.trim();
                        const href = link.href; // 直接获取绝对路径

                        if (title && href) {
                            linkItems.push({
                                title: title,
                                url: href,
                                is_new: title.includes('新') // 简单标记，可后续处理
                            });
                        }
                    });
                }

                console.log(`分类 "${categoryName}": ${linkItems.length} 条链接`);

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
        console.log(`   ✅ 数据已保存: ${savePath}`);

        // --- 上传到 OSS ---
        if (!OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret || !OSS_CONFIG.bucket) {
            console.warn('⚠️ OSS 配置不完整，跳过上传');
            return finalJson;
        }

        console.log('☁️ 正在上传至阿里云 OSS...');
        const client = new OSS(OSS_CONFIG);
        const ossPath = `${envConfig.ossPath}${OUTPUT_FILE}`;
        const content = Buffer.from(JSON.stringify(finalJson, null, 2));

        const result = await client.put(ossPath, content);

        console.log('🎉 新闻列表任务完成！');
        console.log('OSS URL:', result.url);

        return finalJson;

    } catch (error) {
        console.error('❌ 爬虫任务出错:', error.message);
        throw error;
    } finally {
        await browser.close();
    }
}

// 主入口
if (require.main === module) {
    crawlNews().catch(console.error);
}

module.exports = { crawlNews };
