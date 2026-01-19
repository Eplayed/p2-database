const puppeteer = require('puppeteer');

(async () => {
    console.log('🔍 调试爬虫问题...');
    
    const browser = await puppeteer.launch({
        headless: false, // 显示浏览器窗口便于调试
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        // 测试 Pathfinder 页面
        console.log('\n1️⃣  测试 Pathfinder 玩家列表...');
        await page.goto('https://poe.ninja/poe2/builds/vaal?class=Pathfinder', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('tbody tr', { timeout: 10000 });
        
        const players = await page.evaluate((max) => {
            const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, max);
            console.log('找到的行数:', rows.length);
            return rows.map((row, i) => {
                const a = row.querySelector('td:nth-child(1) a');
                if (!a) {
                    console.log(`第${i+1}行没有找到链接`);
                    return null;
                }
                const imgs = Array.from(row.querySelectorAll('img'));
                let skillIcon = "";
                if (imgs.length > 0) skillIcon = imgs[imgs.length-1].src;
                
                return {
                    rank: i + 1,
                    name: a.innerText.trim(),
                    link: a.href,
                    level: parseInt(row.querySelector('td:nth-child(2)')?.innerText || 0),
                    mainSkillIcon: skillIcon
                };
            }).filter(p => p !== null);
        }, 3);

        console.log('Pathfinder 玩家数据:', players.length, players);

        // 测试 Shaman 详情页
        if (players.length > 0) {
            console.log('\n2️⃣  测试 Shaman 详情页...');
            await page.goto('https://poe.ninja/poe2/builds/vaal/character/Raven-9890/GuanNiaoRV?i=0&search=class%3DShaman', { waitUntil: 'networkidle0', timeout: 30000 });
            await new Promise(r => setTimeout(r, 5000)); // 等待5秒让React加载
            
            const debugInfo = await page.evaluate(() => {
                // 检查页面内容
                const title = document.title;
                const hasReact = !!window.React;
                const allDivs = document.querySelectorAll('div').length;
                const allScripts = document.querySelectorAll('script').length;
                
                // 查找角色名
                const pathParts = window.location.pathname.split('/');
                const charName = decodeURIComponent(pathParts[6] || '');
                console.log('角色名:', charName);
                
                // 查找包含角色名的元素
                const targetElements = Array.from(document.querySelectorAll('*')).filter(el => 
                    el.innerText && 
                    el.innerText.trim() === charName
                );
                console.log('找到目标元素数量:', targetElements.length);
                
                // 检查React属性
                let reactPropsFound = false;
                targetElements.forEach((el, i) => {
                    const keys = Object.keys(el).filter(k => k.includes('react'));
                    if (keys.length > 0) {
                        console.log(`元素${i}找到React属性:`, keys);
                        reactPropsFound = true;
                    }
                });
                
                return {
                    title,
                    hasReact,
                    allDivs,
                    allScripts,
                    charName,
                    targetElementsCount: targetElements.length,
                    reactPropsFound
                };
            });
            
            console.log('页面调试信息:', JSON.stringify(debugInfo, null, 2));
        }
        
    } catch (error) {
        console.error('调试失败:', error.message);
    } finally {
        await browser.close();
    }
})();