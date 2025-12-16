const puppeteer = require('puppeteer');
const fs = require('fs');

const TARGET_URL = 'https://poe.ninja/poe2/builds'; // 这是首页，不是列表页
const OUTPUT_FILE = 'class_list.json';

(async () => {
    console.log('🚀 启动浏览器...');
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 伪装 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`🔗 正在访问: ${TARGET_URL}`);
    
    try {
        // 1. 加载页面
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        console.log('⏳ 等待内容渲染...');
        
        // 等待 "FATE OF THE VAAL" 这个标题出现，或者等待 Shaman 出现
        await page.waitForFunction(
            () => document.body.innerText.includes('FATE OF THE VAAL'),
            { timeout: 20000 }
        );

        console.log('✅ 页面已就绪，开始提取数据...');

        // 2. 注入抓取脚本 (浏览器上下文)
        const result = await page.evaluate(() => {
            let data = [];
            
            // 策略：找到所有包含 class= 的链接，然后过滤出属于 "vaal" 赛季的
            // 这种方式比找 DOM 层级更稳，因为层级会变，但链接参数不会变
            const allLinks = Array.from(document.querySelectorAll('a[href*="class="]'));

            allLinks.forEach(link => {
                const href = link.getAttribute('href');
                const text = link.innerText;

                // --- 核心过滤逻辑 ---
                // 1. 必须是 /poe2/builds/vaal (瓦尔赛季)
                // 2. 不能包含 hc- (硬核), ssf- (独狼), ruthless- (无情)
                // 3. 必须包含 class=
                if (href.includes('/builds/vaal?') && 
                   !href.includes('hc-') && 
                   !href.includes('ssf-') && 
                   !href.includes('ruthless-')) {
                    
                    // 提取职业名 (优先找 h4，因为截图里职业名是 h4)
                    let name = "";
                    let nameNode = link.querySelector('h4');
                    if (nameNode) {
                        name = nameNode.innerText.trim();
                    } else {
                        // 备选：从 URL 参数里取
                        const match = href.match(/class=([^&]+)/);
                        if (match) name = match[1];
                    }

                    // 提取百分比 (截图里是 span)
                    let percent = "0%";
                    // 暴力法：直接在 innerText 里找带 % 的行
                    const percentMatch = text.match(/(\d+\.?\d*)%/);
                    if (percentMatch) percent = percentMatch[0];

                    // 提取图标
                    let iconUrl = "";
                    let img = link.querySelector('img');
                    if (img) iconUrl = img.src;

                    // 构造完整链接
                    // Puppeteer 里的 link.href 会自动补全域名，如果是相对路径要小心
                    let fullLink = link.href;

                    if (name) {
                        data.push({
                            name: name,
                            percent: percent,
                            icon: iconUrl,
                            link: fullLink,
                            // 给后端用的参数
                            apiParams: {
                                league: 'fate-of-the-vaal', // API 需要的赛季名
                                class: name
                            }
                        });
                    }
                }
            });

            // 去重 (页面布局原因，有时候移动端和PC端元素会共存，导致抓双份)
            const uniqueMap = new Map();
            data.forEach(item => uniqueMap.set(item.name, item));
            return Array.from(uniqueMap.values());
        });

        if (result.length > 0) {
            console.log(`🎉 成功抓取！共找到 ${result.length} 个职业：`);
            // 打印前3个预览
            console.log(result.slice(0, 3));
            
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
            console.log(`\n💾 职业列表已保存到: ${OUTPUT_FILE}`);
        } else {
            console.error("❌ 抓取为空。正在截图分析...");
            await page.screenshot({ path: 'debug_dashboard_empty.png' });
        }

    } catch (e) {
        console.error('❌ 脚本错误:', e);
        await page.screenshot({ path: 'debug_error.png' });
    } finally {
        await browser.close();
    }
})();