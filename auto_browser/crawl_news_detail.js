const puppeteer = require('puppeteer');
const OSS = require('ali-oss');
const fs = require('fs');
const path = require('path');
const envConfig = require('./env-config');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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
const OUTPUT_DIR = path.join(envConfig.dataDir, 'news_detail');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// --- 抓取单个详情页 ---
async function createBrowser() {
    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080'
    ];

    if (USE_PROXY) {
        launchArgs.push(`--proxy-server=${LOCAL_PROXY}`);
    }

    return puppeteer.launch({
        headless: process.env.CI ? "new" : false,
        args: launchArgs,
        defaultViewport: { width: 1920, height: 1080 }
    });
}

async function preparePage(page) {
    await page.setUserAgent(USER_AGENT);
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
}

// --- 抓取单个详情页 ---
async function crawlArticleDetail(articleUrl, uploadToOSS = true, sharedBrowser = null) {
    console.log(`🔍 正在抓取详情页: ${articleUrl}`);

    const ownsBrowser = !sharedBrowser;
    const browser = sharedBrowser || await createBrowser();

    const page = await browser.newPage();
    await preparePage(page);

    try {
        // 访问页面 (详情页有时候图片较多，稍微多等一会)
        await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 等待内容区域加载
        await page.waitForSelector('.post-content-txt.editor-content', { timeout: 15000 });

        // --- 核心：在浏览器内部清洗并提取数据 ---
        const articleData = await page.evaluate(() => {
            // A. 定位核心容器
            const contentBox = document.querySelector('.post-content-txt.editor-content');
            if (!contentBox) return null;

            // B. 移除侧边栏等非核心元素
            const sidebar = contentBox.querySelector('.post-sidebar');
            if (sidebar) sidebar.remove();

            // C. 数据清洗 (DOM 操作)

            // 1. 移除视频、音频、Iframe
            const videos = contentBox.querySelectorAll('video, audio, iframe, embed, .video-card');
            videos.forEach(el => el.remove());

            // 2. 链接转纯文本 (只保留文字，去除跳转功能)
            const links = contentBox.querySelectorAll('a');
            links.forEach(el => {
                const textNode = document.createTextNode(el.innerText);
                el.parentNode.replaceChild(textNode, el);
            });

            // 3. 图片优化 (适配小程序手机屏幕)
            const images = contentBox.querySelectorAll('img');
            images.forEach(img => {
                // 移除原有的固定宽高和内联样式，防止撑破布局
                img.removeAttribute('width');
                img.removeAttribute('height');
                img.removeAttribute('style');
                img.removeAttribute('class');

                // 处理懒加载 (有些网站用 data-src)
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                }

                // 强制添加移动端样式
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.style.display = 'block';
                img.style.margin = '10px auto';
                img.style.borderRadius = '8px';
            });

            // 4. 移除空的段落 (清理垃圾数据)
            const paragraphs = contentBox.querySelectorAll('p');
            paragraphs.forEach(p => {
                if (p.innerHTML.trim() === '' && p.querySelectorAll('img').length === 0) {
                    p.remove();
                }
            });

            // C. 提取结果
            const titleEl = document.querySelector('.post-content .title');
            const dateEl = document.querySelector('.post-content-txt .time');

            return {
                title: titleEl ? titleEl.innerText.trim() : '',
                content_html: contentBox.innerHTML,
                summary: contentBox.innerText.substring(0, 100).replace(/\s+/g, ' ') + '...'
            };
        });

        if (articleData) {
            console.log(`   ✅ 数据提取成功: ${articleData.title}`);

            // 提取文章 ID
            const articleId = articleUrl.match(/\/post\/(\d+)\.html/)?.[1] || Date.now().toString();
            const fileName = `${articleId}.json`;
            const savePath = path.join(OUTPUT_DIR, fileName);

            // 保存到本地
            const fileContent = JSON.stringify({
                id: articleId,
                url: articleUrl,
                fetched_at: new Date().toISOString(),
                ...articleData
            }, null, 2);
            fs.writeFileSync(savePath, fileContent);

            console.log(`   📁 本地已保存: ${savePath}`);

            // 如果需要上传到 OSS
            if (uploadToOSS && OSS_CONFIG.accessKeyId && OSS_CONFIG.accessKeySecret && OSS_CONFIG.bucket) {
                const client = new OSS(OSS_CONFIG);
                const ossPath = `${envConfig.ossPath}news_details/${fileName}`;
                const result = await client.put(ossPath, Buffer.from(fileContent));
                console.log(`   ☁️ OSS 已上传: ${result.url}`);
            }

            return {
                id: articleId,
                filePath: savePath,
                ...articleData
            };
        } else {
            console.error(`   ❌ 未找到内容容器: ${articleUrl}`);
            return null;
        }

    } catch (e) {
        console.error(`   ❌ 抓取失败: ${articleUrl}`, e.message);
        return null;
    } finally {
        await page.close().catch(() => {});
        if (ownsBrowser) await browser.close();
    }
}

// --- 批量抓取详情页 ---
async function crawlMultipleArticles(articleUrls, concurrency = 1, sharedBrowser = null) {
    console.log(`\n📰 [详情页爬虫] 开始抓取 ${articleUrls.length} 篇文章 (并发数: ${concurrency})`);

    const results = [];
    const chunks = [];

    // 分块处理
    for (let i = 0; i < articleUrls.length; i += concurrency) {
        chunks.push(articleUrls.slice(i, i + concurrency));
    }

    for (let i = 0; i < chunks.length; i++) {
        console.log(`\n📦 批次 ${i + 1}/${chunks.length}...`);
        const batch = chunks[i];

        const batchResults = await Promise.all(
            batch.map(url => crawlArticleDetail(url, false, sharedBrowser)) // false 表示不单独上传 OSS
        );

        results.push(...batchResults.filter(r => r !== null));

        // 批次之间延迟，避免请求过快
        if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.log(`\n✅ 详情页抓取完成: ${results.length}/${articleUrls.length}`);
    return results;
}

// --- 批量上传详情到 OSS ---
async function uploadDetailsToOSS(detailFiles) {
    if (!OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret || !OSS_CONFIG.bucket) {
        console.warn('⚠️ OSS 配置不完整，跳过上传');
        return;
    }

    console.log(`\n☁️ 正在批量上传 ${detailFiles.length} 个详情文件至 OSS...`);

    const client = new OSS(OSS_CONFIG);
    let successCount = 0;

    for (const filePath of detailFiles) {
        try {
            const fileName = path.basename(filePath);
            const ossPath = `${envConfig.ossPath}news_details/${fileName}`;
            const content = fs.readFileSync(filePath);

            await client.put(ossPath, Buffer.from(content));
            successCount++;
        } catch (e) {
            console.error(`   ❌ 上传失败: ${path.basename(filePath)}`);
        }
    }

    console.log(`📊 详情文件上传完成: ${successCount}/${detailFiles.length}`);
}

// 主入口
if (require.main === module) {
    // 测试单篇文章
    const TEST_URL = 'https://www.caimogu.cc/post/2291167.html';
    crawlArticleDetail(TEST_URL, true).catch(console.error);
}

module.exports = { crawlArticleDetail, crawlMultipleArticles, uploadDetailsToOSS, createBrowser, preparePage };
