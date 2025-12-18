const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 模拟真实浏览器
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function scrapeAndSave(targetUrl) {
    let browser = null;
    try {
        console.log(`🚀 [启动] 正在访问: ${targetUrl}`);

        browser = await puppeteer.launch({
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(USER_AGENT);

        // --- 策略 1: 监听网络请求 (保险 A) ---
        let networkData = null;
        page.on('response', async (response) => {
            const url = response.url();
            // 匹配 Ninja API 响应
            if (url.includes('/api/builds/') && url.includes('/character') && response.request().method() === 'GET') {
                try {
                    const json = await response.json();
                    if (json && (json.items || json.character)) {
                        // console.log('⚡️ 网络层截获数据成功');
                        networkData = json;
                    }
                } catch (e) {}
            }
        });

        // 1. 访问页面
        try {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.warn(`⚠️ 页面加载超时，尝试继续执行...`);
        }

        // 2. 等待数据就位 (给网络请求一点时间)
        // 同时等待 SVG 出现以便截图
        console.log('⏳ 等待数据加载和天赋树渲染...');
        try {
            await Promise.all([
                page.waitForSelector('svg.bg-transparent', { timeout: 15000 }),
                // 等待一小会儿确保 CSS 变量生效
                new Promise(r => setTimeout(r, 3000)) 
            ]);
        } catch (e) {
            console.warn('⚠️ 等待超时，尝试强行抓取...');
        }

        // --- 策略 2: 提取页面内嵌数据 (保险 B - 最稳) ---
        // Ninja 是 Next.js 网站，数据一定在 __NEXT_DATA__ 标签里
        const pageData = await page.evaluate(() => {
            try {
                const script = document.getElementById('__NEXT_DATA__');
                if (script) {
                    const json = JSON.parse(script.innerText);
                    return json.props?.pageProps?.character || null;
                }
            } catch (e) { return null; }
            return null;
        });

        // 决定使用哪份数据 (优先网络请求，其次内嵌数据)
        const rootData = networkData || pageData;

        if (!rootData) {
            throw new Error("❌ 无法提取角色数据 (网络拦截和页面提取均失败)");
        }

        console.log(`✅ 数据提取成功: ${rootData.name} (Lv.${rootData.level} ${rootData.class})`);

        // 3. 生成天赋树图片 (你的高亮版逻辑)
        const treeImageBase64 = await page.evaluate(async () => {
            return new Promise(resolve => {
                const svgEl = document.querySelector('svg.bg-transparent');
                if (!svgEl) return resolve(null);

                const clonedSvg = svgEl.cloneNode(true);
                const originalNodes = svgEl.querySelectorAll('*');
                const clonedNodes = clonedSvg.querySelectorAll('*');

                // 样式内联 (Style Inlining) - 保留高亮的关键
                originalNodes.forEach((orig, i) => {
                    const clone = clonedNodes[i];
                    if (!clone) return;

                    const computed = window.getComputedStyle(orig);
                    const properties = ['stroke', 'fill', 'stroke-width', 'opacity', 'display', 'visibility', 'stroke-dasharray', 'r'];

                    properties.forEach(prop => {
                        const val = computed.getPropertyValue(prop);
                        if (val && val !== 'none' && val !== 'auto' && val !== '0px') {
                            clone.style.setProperty(prop, val, 'important');
                        }
                    });
                });

                const viewBox = svgEl.viewBox.baseVal;
                const targetWidth = 1200; 
                const targetHeight = viewBox.width ? targetWidth * (viewBox.height / viewBox.width) : 1000;

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                // 黑色背景
                ctx.fillStyle = "#0b0f19"; 
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const serializer = new XMLSerializer();
                const svgString = serializer.serializeToString(clonedSvg);
                const img = new Image();
                const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
                const url = URL.createObjectURL(svgBlob);

                img.onload = () => {
                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                    // 导出 JPEG 0.7
                    const base64 = canvas.toDataURL('image/jpeg', 0.7);
                    resolve(base64);
                };
                img.onerror = () => resolve(null);
                img.src = url;
            });
        });

        // 4. 数据清洗与组装
        const equipment = (rootData.items || []).map(item => {
            const iData = item.itemData || item;
            let mods = [];
            if (iData.explicitMods) mods.push(...iData.explicitMods);
            if (iData.implicitMods) mods.push(...iData.implicitMods.map(m => `(基底) ${m}`));
            
            return {
                slot: item.inventoryId || 'Item',
                name: iData.name || iData.baseType,
                icon: iData.icon,
                rarity: iData.frameType,
                desc: mods.join('\n'),
                gems: (iData.socketedItems || []).map(g => ({
                    name: g.name || g.typeLine,
                    icon: g.icon,
                    isSupport: g.support
                }))
            };
        });

        const skills = (rootData.skills || []).map(sk => ({
            mainSkillName: sk.allGems && sk.allGems.length > 0 ? sk.allGems[0].name : "Unknown",
            gems: (sk.allGems || []).map(g => ({
                name: g.name,
                icon: g.itemData?.icon,
                isSupport: g.itemData?.support
            }))
        }));

        const finalResult = {
            info: {
                name: rootData.name,
                class: rootData.class,
                level: rootData.level,
                league: rootData.league,
                account: rootData.account,
                webUrl: targetUrl
            },
            equipment: equipment,
            skills: skills,
            keystones: rootData.keystones || [],
            passiveTreeImage: treeImageBase64
        };

        // 5. 保存文件
        const fileName = `${finalResult.info.name || 'player'}.json`;
        const filePath = path.join(process.cwd(), fileName);
        
        fs.writeFileSync(filePath, JSON.stringify(finalResult, null, 2));

        console.log(`\n🎉 成功！`);
        console.log(`🖼️ 天赋图: ${treeImageBase64 ? '已生成 (含高亮)' : '❌ 生成失败'}`);
        console.log(`💾 文件已保存: ${filePath}`);

    } catch (e) {
        console.error("❌ 发生错误:", e);
    } finally {
        if (browser) await browser.close();
    }
}

// 获取命令行参数
const url = process.argv[2];
if (!url) {
    console.log("请提供 URL，例如:");
    console.log("node save_player.js 'https://poe.ninja/...'");
} else {
    scrapeAndSave(url);
}