/* 阿里云 FC 专用 - 自动化爬虫与上传 */
const puppeteer = require('puppeteer');
const OSS = require('ali-oss');

// --- ⚙️ 配置区域 (请修改) ---
const OSS_CONFIG = {
    region: 'oss-cn-hongkong',         // 你的 OSS 地域
    accessKeyId: '你的AccessKeyId',     // RAM 用户 Key
    accessKeySecret: '你的AccessKeySecret',
    bucket: '你的Bucket名字'            // 比如 poe2-static-data
};

// 辅助等待函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 核心逻辑 ---
async function runTask() {
    console.log('🚀 [FC] 任务启动...');
    
    // 初始化 OSS
    const client = new OSS(OSS_CONFIG);

    // 启动浏览器 (注意：服务器环境需要添加特定参数)
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            //使用阿里官方包
            //'--disable-dev-shm-usage', // 关键：防止内存溢出
            //'--single-process'         // 关键：适合 Serverless 环境
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let finalData = {};

    try {
        // ==========================================
        // 阶段 1：抓取职业列表 (Dashboard)
        // ==========================================
        console.log('1️⃣ 正在抓取职业列表...');
        await page.goto('https://poe.ninja/poe2/builds', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // 等待 FATE OF THE VAAL
        await page.waitForFunction(() => document.body.innerText.includes('FATE OF THE VAAL'), { timeout: 20000 });

        const classList = await page.evaluate(() => {
            const list = [];
            const links = Array.from(document.querySelectorAll('a[href*="class="]'));
            links.forEach(link => {
                const href = link.href;
                // 过滤瓦尔赛季
                if (href.includes('/builds/vaal?') && !href.includes('hc-') && !href.includes('ssf-') && !href.includes('ruthless-')) {
                    let name = "";
                    const h4 = link.querySelector('h4');
                    if (h4) name = h4.innerText.trim();
                    if (name) {
                        let icon = "";
                        const img = link.querySelector('img');
                        if (img) icon = img.src;
                        
                        list.push({ name, icon, link: href });
                    }
                }
            });
            // 去重
            const uniqueMap = new Map();
            list.forEach(item => uniqueMap.set(item.name, item));
            return Array.from(uniqueMap.values());
        });

        console.log(`   ✅ 获取到 ${classList.length} 个职业`);

        // ==========================================
        // 阶段 2：循环抓取天梯 (Ladder)
        // ==========================================
        console.log('2️⃣ 正在抓取各职业天梯...');
        const ladders = {};

        for (const cls of classList) {
            console.log(`   👉 抓取 ${cls.name}...`);
            await page.goto(cls.link, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            // 简单等待
            try { await page.waitForSelector('tbody tr', { timeout: 5000 }); } catch(e) {}
            
            // 抓取 Top 20
            const topList = await page.evaluate(() => {
                const rows = document.querySelectorAll('tbody tr');
                const players = [];
                for (let i = 0; i < 20 && i < rows.length; i++) {
                    const row = rows[i];
                    try {
                        const a = row.querySelector('td:nth-child(1) a');
                        if (a) {
                            const link = a.href;
                            const name = a.innerText.trim();
                            // 解析账号
                            let account = "";
                            const parts = link.split('/character/');
                            if (parts.length > 1) account = decodeURIComponent(parts[1].split('/')[0]);
                            
                            // 技能图标
                            let skillIcon = "";
                            const imgs = Array.from(row.querySelectorAll('img'));
                            if (imgs.length > 0) skillIcon = imgs[imgs.length-1].src;

                            players.push({ rank: i+1, name, account, link, mainSkillIcon: skillIcon });
                        }
                    } catch(e){}
                }
                return players;
            });
            
            ladders[cls.name] = topList;
            await delay(1000); // 稍微歇一下
        }

        // ==========================================
        // 阶段 3：上传 OSS
        // ==========================================
        finalData = {
            updateTime: new Date().toLocaleString(),
            classes: classList,
            ladders: ladders
        };

        console.log('3️⃣ 正在上传 OSS...');
        await client.put('json/all_ladders.json', Buffer.from(JSON.stringify(finalData)));
        console.log('🎉 任务完成！数据已更新。');

    } catch (e) {
        console.error('❌ 任务失败:', e);
        throw e;
    } finally {
        await browser.close();
    }
}

// FC 入口
exports.handler = async (event, context, callback) => {
    try {
        await runTask();
        callback(null, "success");
    } catch (e) {
        callback(e);
    }
};

// 本地测试取消注释下面这行
// runTask();