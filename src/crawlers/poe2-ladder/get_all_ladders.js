const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'https://poe.ninja/poe2/builds';
const OUTPUT_FILE = 'all_ladders.json';
const DATA_DIR = path.join(__dirname, 'ladder', 'data');

// 获取现有classes.json作为基础数据
function getExistingClasses() {
    const classesPath = path.join(DATA_DIR, 'classes.json');
    if (fs.existsSync(classesPath)) {
        return JSON.parse(fs.readFileSync(classesPath, 'utf8'));
    }
    return [];
}

// 获取职业的梯子数据
async function getLadderDataForClass(page, className) {
    console.log(`🔍 正在获取 ${className} 的梯子数据...`);
    
    try {
        const classUrl = `https://poe.ninja/poe2/builds/vaal?class=${encodeURIComponent(className)}`;
        await page.goto(classUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // 等待梯子表格加载
        await page.waitForTimeout(2000);
        
        const ladderData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            return rows.map((row, index) => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    const rankCell = cells[0].innerText.trim();
                    const nameCell = cells[1];
                    const levelCell = cells[2].innerText.trim();
                    
                    let playerName = '';
                    let accountName = '';
                    let characterLink = '';
                    
                    // 从玩家名字单元格中提取信息
                    const nameLink = nameCell.querySelector('a');
                    if (nameLink) {
                        playerName = nameLink.innerText.trim();
                        characterLink = nameLink.href;
                        
                        // 从链接中提取account名
                        const urlMatch = characterLink.match(/\/character\/([^\/]+)\/([^\/]+)/);
                        if (urlMatch) {
                            accountName = urlMatch[1];
                        }
                    }
                    
                    const rank = parseInt(rankCell) || index + 1;
                    const level = parseInt(levelCell) || 1;
                    
                    return {
                        rank: rank,
                        name: playerName,
                        level: level,
                        class: '', // 将在后续填充
                        account: accountName,
                        linkUrl: characterLink
                    };
                }
                return null;
            }).filter(item => item !== null);
        });
        
        // 填充class字段
        ladderData.forEach(player => {
            player.class = className;
        });
        
        console.log(`✅ 成功获取 ${className} 的 ${ladderData.length} 条记录`);
        return ladderData;
        
    } catch (error) {
        console.log(`❌ 获取 ${className} 数据失败:`, error.message);
        return [];
    }
}

// 获取现有职业数据文件
function getExistingLadderData() {
    const existingData = {};
    const files = fs.readdirSync(DATA_DIR);
    
    files.forEach(file => {
        if (file.endsWith('.json') && file !== 'classes.json') {
            const className = file.replace('.json', '');
            const filePath = path.join(DATA_DIR, file);
            try {
                existingData[className] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (error) {
                console.log(`⚠️  读取 ${file} 失败:`, error.message);
            }
        }
    });
    
    return existingData;
}

// 主函数
(async () => {
    console.log('🚀 开始获取所有职业的梯子数据...');
    
    // 1. 获取基础职业列表
    const classes = getExistingClasses();
    if (classes.length === 0) {
        console.error('❌ 没有找到职业列表，请先运行 auto_browser/index.js');
        return;
    }
    
    console.log(`📋 找到 ${classes.length} 个职业`);
    
    // 2. 检查现有数据
    const existingData = getExistingLadderData();
    console.log(`📁 找到 ${Object.keys(existingData).length} 个现有职业数据文件`);
    
    // 3. 启动浏览器
    console.log('🌐 启动浏览器...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        // 4. 获取每个职业的梯子数据
        const allLadders = {};
        
        for (const classInfo of classes) {
            const className = classInfo.name;
            
            // 检查是否已有数据且较新（可选）
            if (existingData[className] && existingData[className].length > 0) {
                console.log(`📄 使用现有数据: ${className} (${existingData[className].length} 条)`);
                allLadders[className] = existingData[className];
                continue;
            }
            
            // 获取新数据
            const ladderData = await getLadderDataForClass(page, className);
            allLadders[className] = ladderData;
            
            // 保存单独的职业数据文件
            const classFile = path.join(DATA_DIR, `${className}.json`);
            fs.writeFileSync(classFile, JSON.stringify(ladderData, null, 2));
            console.log(`💾 已保存 ${className} 数据到 ${className}.json`);
            
            // 避免请求过于频繁
            await page.waitForTimeout(1000);
        }
        
        // 5. 生成合并的all_ladders.json
        const allLaddersData = {
            updateTime: new Date().toISOString(),
            totalClasses: classes.length,
            totalPlayers: Object.values(allLadders).reduce((sum, data) => sum + data.length, 0),
            classes: classes.map(cls => ({
                name: cls.name,
                percent: cls.percent,
                icon: cls.icon,
                playerCount: allLadders[cls.name]?.length || 0
            })),
            ladders: allLadders
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allLaddersData, null, 2));
        console.log(`\n🎉 成功生成 ${OUTPUT_FILE}`);
        console.log(`📊 统计信息:`);
        console.log(`   - 职业数量: ${allLaddersData.totalClasses}`);
        console.log(`   - 玩家总数: ${allLaddersData.totalPlayers}`);
        
        // 打印每个职业的玩家数量
        Object.entries(allLadders).forEach(([className, data]) => {
            console.log(`   - ${className}: ${data.length} 名玩家`);
        });
        
    } catch (error) {
        console.error('❌ 脚本执行错误:', error);
        await page.screenshot({ path: 'debug_ladder_error.png' });
    } finally {
        await browser.close();
    }
})();