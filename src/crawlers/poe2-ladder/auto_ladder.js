const puppeteer = require('puppeteer');
const fs = require('fs');
const envConfig = require('../../../config/env-config');

// 配置
const INPUT_FILE = envConfig.getFileName('class_list'); // 上一步生成的文件
const OUTPUT_FILE = envConfig.getFileName('all_ladders'); // 最终结果
const MAX_RANK = 20; // 每个职业抓前多少名

// 辅助函数：延迟等待
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    // 1. 读取职业列表
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ 找不到 ${INPUT_FILE}，请先运行 auto_dashboard.js`);
        return;
    }
    const classList = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    console.log(`📂 读取到 ${classList.length} 个职业，准备开始抓取...`);

    // 2. 启动浏览器
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 伪装
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 结果容器
    let allLadders = {};

    // 3. 循环抓取每一个职业
    // 使用 for...of 循环以支持 await
    for (const cls of classList) {
        const className = cls.name;
        const targetUrl = cls.link;

        console.log(`\n👉 [${className}] 正在访问: ${targetUrl}`);

        try {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // 等待表格出现
            try {
                await page.waitForSelector('tbody tr', { timeout: 15000 });
            } catch (e) {
                console.warn(`   ⚠️  [${className}] 表格加载超时，可能该职业没人玩？跳过。`);
                continue;
            }

            // --- 关键动作：模拟滚动 ---
            // Ninja 也是懒加载，虽然前20名通常在第一屏，但滚一下更保险
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });
            await delay(1000); // 等待滚动加载

            // --- 注入抓取脚本 ---
            const ladder = await page.evaluate((maxRank) => {
                let players = [];
                let rows = document.querySelectorAll('tbody tr');

                // 遍历每一行
                for (let i = 0; i < rows.length && i < maxRank; i++) {
                    const row = rows[i];
                    try {
                        // 1. 名字和链接
                        let linkNode = row.querySelector('td:nth-child(1) a');
                        if (!linkNode) continue;

                        let charName = linkNode.innerText.trim();
                        let charUrl = linkNode.href;

                        // 2. 解析账号名 (从URL反解)
                        // .../character/Account/Name
                        let account = "";
                        let parts = charUrl.split('/character/');
                        if (parts.length > 1) {
                            account = decodeURIComponent(parts[1].split('/')[0]);
                        }

                        // 3. 等级
                        let levelNode = row.querySelector('td:nth-child(2)');
                        let level = levelNode ? parseInt(levelNode.innerText) : 0;

                        // 4. 技能图标 (查找行内所有的技能图片)
                        // Ninja 的技能图片通常带有 title 属性
                        let skillImgs = Array.from(row.querySelectorAll('img'));
                        let mainSkillIcon = "";
                        
                        // 简单的启发式规则：找最后那个看起来像技能的图标
                        // 排除职业头像(通常是第一个)
                        // 反向查找，通常主技能在后面
                        for (let j = skillImgs.length - 1; j >= 0; j--) {
                            let src = skillImgs[j].src;
                            // 排除职业图标和装备图标(如果有的话)
                            if (src.includes('/classes/')) continue; 
                            mainSkillIcon = src;
                            break; // 找到一个就当做主技能
                        }

                        players.push({
                            rank: i + 1,
                            name: charName,
                            account: account,
                            level: level,
                            link: charUrl, // 给前端跳转用
                            mainSkillIcon: mainSkillIcon
                        });

                    } catch (e) {
                        // 忽略单行错误
                    }
                }
                return players;
            }, MAX_RANK);

            console.log(`   ✅ 抓取到 ${ladder.length} 名玩家`);
            allLadders[className] = ladder;

        } catch (err) {
            console.error(`   ❌ [${className}] 抓取失败:`, err.message);
        }

        // 休息一下，防止被封 IP
        await delay(2000); 
    }

    // 4. 保存结果
    const finalData = {
        updateTime: new Date().toLocaleString(),
        classes: classList, // 把之前的职业列表也放进去，方便前端用
        ladders: allLadders
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
    console.log(`\n🎉 全部完成！数据已保存至: ${OUTPUT_FILE}`);
    
    await browser.close();
})();