const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 配置
const BASE_URL = 'https://poe.ninja/poe2/builds';
const LEAGUE = 'vaal'; // 赛季
const MAX_RANK_PER_CLASS = 3; // 测试时建议设小一点(比如3-5)，正式跑再设20，否则太慢
const OUTPUT_DIR = './data'; // 数据保存目录

// 确保目录存在
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

(async () => {
    console.log('🚀 [V5.0 全站抓取] 启动...');
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 注入反爬虫补丁
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        // ==========================================
        // 阶段 1: 抓取职业列表 (Dashboard)
        // ==========================================
        console.log('\n1️⃣  正在获取职业列表...');
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.body.innerText.includes('FATE OF THE VAAL'), { timeout: 30000 });

        const classList = await page.evaluate(() => {
            const list = [];
            const links = Array.from(document.querySelectorAll('a[href*="class="]'));
            links.forEach(link => {
                const href = link.href;
                if (href.includes('/builds/vaal?') && !href.includes('hc-') && !href.includes('ssf-') && !href.includes('ruthless-')) {
                    const h4 = link.querySelector('h4');
                    const name = h4 ? h4.innerText.trim() : "";
                    const img = link.querySelector('img');
                    const icon = img ? img.src : "";
                    if (name) list.push({ name, icon, link: href });
                }
            });
            const uniqueMap = new Map();
            list.forEach(item => uniqueMap.set(item.name, item));
            return Array.from(uniqueMap.values());
        });

        console.log(`   ✅ 发现 ${classList.length} 个职业`);
        fs.writeFileSync(`${OUTPUT_DIR}/classes.json`, JSON.stringify(classList, null, 2));

        // ==========================================
        // 阶段 2 & 3: 循环抓取天梯 + 详情
        // ==========================================
        const allLadders = {};

        for (const cls of classList) {
            console.log(`\n2️⃣  正在处理职业: ${cls.name}...`);
            
            // 2.1 进入天梯页
            await page.goto(cls.link, { waitUntil: 'domcontentloaded' });
            try { await page.waitForSelector('tbody tr', { timeout: 10000 }); } catch(e) {}
            
            // 2.2 提取 Top N 玩家链接
            const players = await page.evaluate((max) => {
                const rows = Array.from(document.querySelectorAll('tbody tr')).slice(0, max);
                return rows.map((row, i) => {
                    const a = row.querySelector('td:nth-child(1) a');
                    if (!a) return null;
                    // 获取技能图标
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
            }, MAX_RANK_PER_CLASS);

            if (players.length === 0) {
                console.warn(`   ⚠️  ${cls.name} 没有找到玩家数据`);
                allLadders[cls.name] = [];
                continue;
            }

            console.log(`   📋 列表获取完毕 (${players.length}人)，开始逐个抓取详情...`);
            
            // 2.3 逐个进入详情页抓取 BD 数据
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                console.log(`      (${i+1}/${players.length}) 正在抓取: ${player.name}`);

                try {
                    console.log(`      📄 正在访问: ${player.link}`);
                    await page.goto(player.link, { waitUntil: 'networkidle0', timeout: 60000 }); // 等待完全加载以便 SVG 渲染
                    
                    // 等待页面内容加载
                    try {
                        await page.waitForSelector('body', { timeout: 10000 });
                        await new Promise(r => setTimeout(r, 2000)); // 额外等待2秒让React渲染完成
                    } catch(e) {
                        console.warn('      ⚠️  页面加载超时');
                    }

                    // --- 注入详情抓取脚本 ---
                    const detailData = await page.evaluate(async () => {
                        try {
                            // 1. 查找 React 根数据 (改进版)
                            function getReactRootData() {
                                // 方法1: 尝试从URL路径获取角色名
                                const pathParts = window.location.pathname.split('/');
                                const charName = decodeURIComponent(pathParts[6] || '');
                                
                                // 方法2: 查找包含角色名的元素
                                const allElements = Array.from(document.querySelectorAll('*'));
                                const targetElement = allElements.find(el => 
                                    el.innerText && 
                                    el.innerText.trim() === charName && 
                                    el.tagName !== 'SCRIPT' && 
                                    el.tagName !== 'STYLE'
                                );
                                
                                if (!targetElement) {
                                    console.log('未找到目标元素');
                                    return null;
                                }

                                // 方法3: 尝试多种React属性键
                                const reactKeys = Object.keys(targetElement).filter(k => 
                                    k.includes('react') || k.includes('__react')
                                );
                                
                                for (const key of reactKeys) {
                                    let fiber = targetElement[key];
                                    let attempts = 0;
                                    while (fiber && attempts < 30) {
                                        const props = fiber.memoizedProps || fiber.props;
                                        if (props && (props.character || props.account)) {
                                            if (props.items && props.skills) return props;
                                            if (props.character && props.character.items) return props.character;
                                        }
                                        fiber = fiber.return || fiber._reactInternalFiber;
                                        attempts++;
                                    }
                                }
                                return null;
                            }

                            // 2. 生成天赋树图片 (简化版，防止出错)
                            function generateTreeImage() {
                                return new Promise(resolve => {
                                    try {
                                        const svgEl = document.querySelector('svg.bg-transparent, svg');
                                        if (!svgEl) return resolve(null);

                                        const serializer = new XMLSerializer();
                                        const svgString = serializer.serializeToString(svgEl);
                                        if (!svgString || svgString.length < 100) return resolve(null);

                                        const rect = svgEl.getBoundingClientRect();
                                        if (rect.width === 0 || rect.height === 0) return resolve(null);

                                        const width = Math.min(rect.width, 1200);
                                        const height = Math.min(rect.height, 1200);
                                        const canvas = document.createElement('canvas');
                                        canvas.width = width;
                                        canvas.height = height;
                                        const ctx = canvas.getContext('2d');
                                        ctx.fillStyle = "#0b0f19";
                                        ctx.fillRect(0, 0, width, height);

                                        const img = new Image();
                                        const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
                                        const url = URL.createObjectURL(blob);

                                        img.onload = () => {
                                            ctx.drawImage(img, 0, 0, width, height);
                                            const b64 = canvas.toDataURL('image/jpeg', 0.6);
                                            URL.revokeObjectURL(url);
                                            resolve(b64);
                                        };
                                        img.onerror = () => {
                                            URL.revokeObjectURL(url);
                                            resolve(null);
                                        };
                                        img.src = url;
                                    } catch (e) {
                                        console.log('图片生成错误:', e.message);
                                        resolve(null);
                                    }
                                });
                            }

                            const rootData = getReactRootData();
                            const treeImg = await generateTreeImage();

                            if (!rootData) {
                                console.log('未获取到根数据');
                                return null;
                            }

                            // 数据清洗 (更健壮的版本)
                            const equipment = Array.isArray(rootData.items) ? rootData.items.map(item => {
                                const iData = item.itemData || item;
                                return {
                                    slot: item.inventoryId || 'unknown',
                                    name: iData.name || iData.baseType || 'unknown',
                                    icon: iData.icon || '',
                                    rarity: iData.frameType || 0,
                                    desc: Array.isArray(iData.explicitMods) ? iData.explicitMods.join('\n') : '',
                                    gems: Array.isArray(iData.socketedItems) ? iData.socketedItems.map(g => ({ 
                                        name: g.name || g.typeLine || 'unknown', 
                                        icon: g.icon || '', 
                                        isSupport: g.support || false 
                                    })) : []
                                };
                            }) : [];

                            const skills = Array.isArray(rootData.skills) ? rootData.skills.map(sk => ({
                                gems: Array.isArray(sk.allGems) ? sk.allGems.map(g => ({ 
                                    name: g.name || 'unknown', 
                                    icon: g.itemData?.icon || '', 
                                    isSupport: g.itemData?.support || false 
                                })) : []
                            })) : [];

                            return {
                                info: { 
                                    class: rootData.class || '', 
                                    level: rootData.level || 1, 
                                    name: rootData.name || '', 
                                    account: rootData.account || '' 
                                },
                                equipment: equipment,
                                skills: skills,
                                keystones: rootData.keystones || [],
                                passiveTreeImage: treeImg
                            };
                        } catch (e) {
                            console.log('页面评估错误:', e.message);
                            return null;
                        }
                    });

                    if (detailData) {
                        // 把抓到的详情数据，直接挂载到 player 对象上
                        player.detail = detailData;
                        console.log(`      ✅ 成功获取详情: ${player.name} (${detailData.equipment?.length || 0}件装备)`);
                    } else {
                        console.warn(`      ⚠️  数据提取失败: ${player.name} - 页面可能还未完全加载`);
                    }

                } catch (err) {
                    console.error(`      ❌ 访问失败: ${player.name} - ${err.message}`);
                }
                
                // 休息 2 秒，防封
                await new Promise(r => setTimeout(r, 2000));
            }

            allLadders[cls.name] = players;
            
            // 实时保存进度 (防止跑一半挂了)
            fs.writeFileSync(`${OUTPUT_DIR}/ladders_temp.json`, JSON.stringify(allLadders, null, 2));
        }

        // ==========================================
        // 阶段 4: 保存最终大文件
        // ==========================================
        const finalData = {
            updateTime: new Date().toLocaleString(),
            classes: classList,
            ladders: allLadders
        };

        fs.writeFileSync(`${OUTPUT_DIR}/all_data_full.json`, JSON.stringify(finalData, null, 2));
        console.log(`\n🎉🎉🎉 全部完成！数据已保存到 ${OUTPUT_DIR}/all_data_full.json`);

        // --- 这里可以加 OSS 上传逻辑 ---
        // const client = new OSS(OSS_CONFIG);
        // await client.put('json/full_data.json', './data/all_data_full.json');

    } catch (e) {
        console.error('❌ 全局错误:', e);
    } finally {
        await browser.close();
    }
})();