const puppeteer = require('puppeteer-core'); // FC 环境使用 core
const fs = require('fs');
const path = require('path');
const envConfig = require('./env-config');
const uploadAll = require('./upload_to_oss'); // 引入上传模块

// 配置
const BASE_URL = 'https://poe.ninja/poe2/builds';
const MAX_RANK = envConfig.crawler.maxRank;
// 适配 FC 的临时目录 /tmp/data，本地则用 ./data
const OUTPUT_DIR = envConfig.dataDir; 

// 确保目录存在 (递归创建)
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 浏览器路径：FC 官方层固定路径 /opt/chrome/chrome
// 本地调试如果没装 Chrome，这里需要指向你本地的 Chrome 路径，或者在本地跑的时候改回 puppeteer
const CHROME_PATH = fs.existsSync('/opt/chrome/chrome') 
    ? '/opt/chrome/chrome' 
    : ''; // 本地调试若报错，请填写本地 Chrome 路径

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function runTask() {
    console.log(`🚀 [Deploy Cron] 启动 | 环境: ${envConfig.isProd ? 'Prod' : 'Dev'} | 深度: ${MAX_RANK}`);
    console.log(`   数据目录: ${OUTPUT_DIR}`);

    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: CHROME_PATH || undefined, // FC 必须指定
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--single-process'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(USER_AGENT);

    // --- 请求拦截配置 ---
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        // ⚠️ 关键：绝对不能屏蔽 'image'，否则 Canvas 无法生成天赋图
        if (['media', 'font', 'texttrack', 'object', 'beacon', 'csp_report', 'imageset'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        // ==========================================
        // 阶段 1: 抓取职业列表
        // ==========================================
        console.log('1️⃣  获取职业列表...');
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        try {
            await page.waitForFunction(() => document.body.innerText.includes('FATE OF THE VAAL'), { timeout: 30000 });
        } catch(e) {}

        const classList = await page.evaluate(() => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a[href*="class="]'));
            links.forEach(link => {
                const href = link.href;
                if (href.includes('/builds/vaal?') && !href.includes('hc-') && !href.includes('ssf-') && !href.includes('ruthless-')) {
                    const h4 = link.querySelector('h4');
                    const name = h4 ? h4.innerText.trim() : "";
                    if (name && !results.find(r => r.name === name)) {
                        results.push({ name, link: href });
                    }
                }
            });
            return results;
        });

        console.log(`   ✅ 发现 ${classList.length} 个职业`);
        fs.writeFileSync(path.join(OUTPUT_DIR, envConfig.getFileName('classes')), JSON.stringify(classList, null, 2));

        // ==========================================
        // 阶段 2: 遍历职业 -> 抓取详情
        // ==========================================
        const allLadders = {};

        for (const cls of classList) {
            console.log(`\n2️⃣  处理职业: ${cls.name}`);
            
            try {
                await page.goto(cls.link, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForFunction(() => {
                    const rows = document.querySelectorAll('tbody tr');
                    return rows.length > 0 && rows[0].querySelector('a');
                }, { timeout: 15000 });
            } catch(e) {
                console.warn(`   ⚠️ [${cls.name}] 等待列表超时，尝试强行抓取`);
            }
            
            const players = await page.evaluate((limit) => {
                const rows = Array.from(document.querySelectorAll('tbody tr'));
                const validRows = rows.filter(r => r.querySelector('td:nth-child(1) a'));
                return validRows.slice(0, limit).map((row, i) => {
                    const a = row.querySelector('td:nth-child(1) a');
                    if (!a) return null;
                    const imgs = Array.from(row.querySelectorAll('img'));
                    let skillIcon = "";
                    if (imgs.length > 0) skillIcon = imgs[imgs.length-1].src;
                    
                    // 解析账号名
                    let account = "";
                    try {
                        const parts = a.href.split('/character/');
                        if (parts.length > 1) account = decodeURIComponent(parts[1].split('/')[0]);
                    } catch(e){}

                    return {
                        rank: i + 1,
                        name: a.innerText.trim(),
                        link: a.href,
                        account: account, 
                        level: parseInt(row.querySelector('td:nth-child(2)')?.innerText || 0),
                        mainSkillIcon: skillIcon
                    };
                }).filter(p => p !== null);
            }, MAX_RANK);

            console.log(`   📋 解析 ${players.length} 名玩家...`);
            const detailedPlayers = [];

            for (let i = 0; i < players.length; i++) {
                const player = players[i];

                let capturedData = null;
                const responseListener = async (response) => {
                    if (capturedData) return;
                    const url = response.url();
                    // 宽松匹配 API
                    if (url.includes('/api/builds/') && url.includes('/character') && response.request().method() !== 'OPTIONS') {
                        try {
                            const json = await response.json();
                            if (json && (json.items || json.character)) capturedData = json;
                        } catch (err) {}
                    }
                };
                page.on('response', responseListener);

                try {
                    await page.goto(player.link, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    
                    // 等待 SVG 渲染 + 滚动到底部
                    try { await page.waitForSelector('svg.bg-transparent', { timeout: 8000 }); } catch(e){}
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await new Promise(r => setTimeout(r, 2000)); // 等动画

                    // 等待数据截获
                    let attempts = 0;
                    while (!capturedData && attempts < 10) { 
                        await new Promise(r => setTimeout(r, 200));
                        attempts++;
                    }

                    // 兜底：从页面提取
                    if (!capturedData) {
                        capturedData = await page.evaluate(() => {
                            try { return JSON.parse(document.getElementById('__NEXT_DATA__').innerText).props?.pageProps?.character; } catch(e) { return null; }
                        });
                    }

                    if (!capturedData) throw new Error("数据提取失败");

                    // 截图天赋 (SVG -> Canvas -> Base64)
                    const treeImgBase64 = await page.evaluate(async () => {
                        return new Promise(resolve => {
                            const svgEl = document.querySelector('svg.bg-transparent, svg');
                            if (!svgEl) return resolve(null);
                            
                            // 样式内联
                            const serializer = new XMLSerializer();
                            const clonedSvg = svgEl.cloneNode(true);
                            const originalNodes = svgEl.querySelectorAll('*');
                            const clonedNodes = clonedSvg.querySelectorAll('*');
                            originalNodes.forEach((orig, i) => {
                                const clone = clonedNodes[i];
                                if (!clone) return;
                                const style = window.getComputedStyle(orig);
                                ['stroke', 'fill', 'stroke-width', 'opacity', 'r'].forEach(p => {
                                    const v = style.getPropertyValue(p);
                                    if (v && v !== 'auto') clone.style.setProperty(p, v, 'important');
                                });
                            });

                            const width = 1000;
                            const rect = svgEl.getBoundingClientRect();
                            const height = rect.width ? width * (rect.height / rect.width) : 1000;
                            const canvas = document.createElement('canvas');
                            canvas.width = width; canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = "#0b0f19"; ctx.fillRect(0, 0, width, height);

                            const img = new Image();
                            const blob = new Blob([serializer.serializeToString(clonedSvg)], {type: 'image/svg+xml;charset=utf-8'});
                            const url = URL.createObjectURL(blob);

                            img.onload = () => {
                                ctx.drawImage(img, 0, 0, width, height);
                                resolve(canvas.toDataURL('image/jpeg', 0.6));
                            };
                            img.onerror = () => resolve(null);
                            img.src = url;
                        });
                    });

                    // 数据清洗
                    const detailData = {
                        info: { name: capturedData.name, class: capturedData.class, level: capturedData.level, account: capturedData.account, league: capturedData.league },
                        equipment: (capturedData.items || []).map(item => {
                            const i = item.itemData || item;
                            return { 
                                slot: item.inventoryId, 
                                name: i.name || i.baseType, 
                                icon: i.icon, 
                                rarity: i.frameType, 
                                desc: i.explicitMods?.join('\n') || '' 
                            };
                        }),
                        skills: (capturedData.skills || []).map(s => ({
                            gems: (s.allGems || []).map(g => ({ name: g.name, icon: g.itemData?.icon, isSupport: g.itemData?.support }))
                        })),
                        keystones: capturedData.keystones || [],
                        passiveTreeImage: treeImgBase64
                    };

                    player.detail = detailData;
                    if (!player.account && capturedData.account) player.account = capturedData.account;
                    
                    detailedPlayers.push(player);
                    console.log(`      ✅ 成功 ${player.name}`);

                } catch (err) {
                    console.error(`      ❌ 失败: ${err.message}`);
                } finally {
                    page.off('response', responseListener);
                }
                
                await new Promise(r => setTimeout(r, 500)); 
            }
            allLadders[cls.name] = detailedPlayers;
        }

        // ==========================================
        // 阶段 3: 拆分保存 & 触发上传
        // ==========================================
        console.log('\n3️⃣ 拆分文件...');
        const PLAYER_DATA_DIR = path.join(OUTPUT_DIR, 'players');
        if (!fs.existsSync(PLAYER_DATA_DIR)) fs.mkdirSync(PLAYER_DATA_DIR, { recursive: true });

        const lightLadders = {};

        for (const clsName in allLadders) {
            lightLadders[clsName] = allLadders[clsName].map((p) => {
                const accountVal = p.account || 'unknown';
                const nameVal = p.name || 'unknown';
                const safeAccount = String(accountVal).replace(/[^a-zA-Z0-9_-]/g, '_');
                const safeName = String(nameVal).replace(/[^a-zA-Z0-9_-]/g, '_');
                const detailFileName = `${safeAccount}_${safeName}.json`;
                
                if (p.detail) {
                    fs.writeFileSync(path.join(PLAYER_DATA_DIR, detailFileName), JSON.stringify(p.detail));
                }

                return {
                    rank: p.rank,
                    name: p.name,
                    level: p.level,
                    account: p.account,
                    mainSkillIcon: p.mainSkillIcon,
                    detailPath: `players/${detailFileName}`
                };
            });
        }

        // 保存索引
        const lightData = { updateTime: new Date().toISOString(), classes: classList, ladders: lightLadders };
        fs.writeFileSync(path.join(OUTPUT_DIR, envConfig.getFileName("all_ladders")), JSON.stringify(lightData, null, 2));

        // 调用上传模块
        await uploadAll();

    } catch (e) {
        console.error('❌ 任务崩溃:', e);
        throw e;
    } finally {
        await browser.close();
    }
}

// FC 入口
exports.handler = async (event, context, callback) => {
    try {
        await runTask();
        callback(null, 'Task Finished');
    } catch (e) {
        callback(e);
    }
};

// 本地测试
if (require.main === module) {
    runTask();
}