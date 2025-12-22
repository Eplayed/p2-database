const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// OSS集成
const OSS = require('ali-oss');

// 加载翻译字典
let dictBase = {}, dictUnique = {}, dictGem = {};

// FC 环境初始化
async function initializeTranslationDicts() {
    try {
        const baseDataDir = path.join(__dirname, 'base-data/dist');
        
        if (!fs.existsSync(baseDataDir)) {
            throw new Error('base-data/dist 目录不存在');
        }
        
        dictBase = JSON.parse(fs.readFileSync(path.join(baseDataDir, "dict_base.json"), "utf8"));
        dictUnique = JSON.parse(fs.readFileSync(path.join(baseDataDir, "dict_unique.json"), "utf8"));
        dictGem = JSON.parse(fs.readFileSync(path.join(baseDataDir, "dict_gem.json"), "utf8"));
        
        console.log('✅ 翻译字典加载成功');
        return true;
    } catch (e) {
        console.error('❌ 翻译字典加载失败:', e.message);
        return false;
    }
}

// 初始化OSS客户端
function initOSSClient() {
    try {
        const client = new OSS({
            region: process.env.OSS_REGION || 'oss-cn-hangzhou',
            accessKeyId: process.env.OSS_ACCESS_KEY_ID,
            accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
            bucket: process.env.OSS_BUCKET || 'poe2-data-bucket'
        });
        
        console.log('✅ OSS客户端初始化成功');
        return client;
    } catch (e) {
        console.error('❌ OSS客户端初始化失败:', e.message);
        return null;
    }
}

// 递归获取文件
function getAllFiles(dirPath, arrayOfFiles) {
    if (!fs.existsSync(dirPath)) return [];
    
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (file === '.DS_Store') return;
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

// 上传文件到OSS
async function uploadToOSS(ossClient, localPath, remotePath) {
    try {
        await ossClient.put(remotePath, localPath);
        console.log(`   ✅ 上传成功: ${remotePath}`);
        return true;
    } catch (e) {
        console.error(`   ❌ 上传失败: ${remotePath} - ${e.message}`);
        return false;
    }
}

// 安全文件名生成函数
function generateSafeFileName(text, prefix = "") {
    if (!text) text = "unknown";
    
    let normalized = text;
    let langPrefix = "";
    
    if (/[\uac00-\ud7af]/.test(text)) {
        langPrefix = "kr_";
    } else if (/[\u0600-\u06ff]/.test(text)) {
        langPrefix = "ar_";
    } else if (/[\u0e00-\u0e7f]/.test(text)) {
        langPrefix = "th_";
    } else if (/[\u0400-\u04ff]/.test(text)) {
        langPrefix = "ru_";
    } else if (/[\u4e00-\u9fff]/.test(text)) {
        langPrefix = "cn_";
    } else if (/[\u0590-\u05ff]/.test(text)) {
        langPrefix = "he_";
    } else if (/[\u0900-\u097f]/.test(text)) {
        langPrefix = "hi_";
    } else {
        langPrefix = "en_";
    }
    
    const simpleHash = text
        .split("")
        .map((c) => {
            const code = c.charCodeAt(0);
            if (code >= 65 && code <= 90) return c.toLowerCase();
            if (code >= 97 && code <= 122) return c;
            if (code >= 48 && code <= 57) return c;
            return "x";
        })
        .join("")
        .substring(0, 10);
    
    const fullSafe = (langPrefix + simpleHash)
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    
    return prefix + fullSafe;
}

function generateUniqueFileName(account, name, timestamp) {
    const safeAccount = generateSafeFileName(account);
    const safeName = generateSafeFileName(name);
    return `${safeAccount}_${safeName}.json`;
}

// 翻译函数
function translateItemName(itemName, baseType, frameType) {
    if (frameType === 3) {
        const uniqueInfo = dictUnique[itemName];
        if (uniqueInfo) {
            return uniqueInfo.cn;
        }
        
        for (const [key, value] of Object.entries(dictUnique)) {
            if (key.toLowerCase().includes(itemName.toLowerCase()) || 
                itemName.toLowerCase().includes(key.toLowerCase())) {
                return value.cn;
            }
        }
        
        return itemName;
    } else {
        let cnBase = dictBase[baseType] || dictBase[itemName];
        
        if (!cnBase) {
            const itemTypeMap = {
                'Belt': ['腰带', '腰带的'],
                'Amulet': ['护身符', '护符'],
                'Ring': ['戒指'],
                'Boots': ['靴子', '靴'],
                'Gloves': ['手套'],
                'Charm': ['护符', '符文'],
                'Helm': ['头盔', '帽'],
                'Chest': ['胸甲', '上衣'],
                'Shield': ['盾牌', '盾'],
                'Sword': ['剑'],
                'Axe': ['斧'],
                'Mace': ['锤', '权杖'],
                'Bow': ['弓'],
                'Staff': ['法杖', '杖'],
                'Wand': ['法杖', '魔杖'],
            };
            
            for (const [englishType, chineseTypes] of Object.entries(itemTypeMap)) {
                if (itemName.toLowerCase().includes(englishType.toLowerCase())) {
                    const baseExamples = Object.keys(dictBase).filter(key => 
                        key.toLowerCase().includes(englishType.toLowerCase())
                    );
                    if (baseExamples.length > 0) {
                        cnBase = dictBase[baseExamples[0]];
                        break;
                    }
                }
            }
            
            if (!cnBase) {
                const specialMap = {
                    'Harness': '腰带',
                    'Hoof': '靴子', 
                    'Coil': '戒指',
                    'Touch': '手套',
                    'Charm': '护符',
                    'Maelström': '漩涡护符'
                };
                
                for (const [specialKey, chineseTranslation] of Object.entries(specialMap)) {
                    if (itemName.toLowerCase().includes(specialKey.toLowerCase())) {
                        cnBase = chineseTranslation;
                        break;
                    }
                }
            }
        }
        
        if (!cnBase) {
            for (const [key, value] of Object.entries(dictBase)) {
                if (key.toLowerCase().includes(itemName.toLowerCase()) || 
                    itemName.toLowerCase().includes(key.toLowerCase()) ||
                    (baseType && (key.toLowerCase().includes(baseType.toLowerCase()) || 
                                  baseType.toLowerCase().includes(key.toLowerCase())))) {
                    cnBase = value;
                    break;
                }
            }
        }
        
        if (cnBase) {
            const prefix = itemName.split(' ')[0];
            if (prefix && cnBase && !cnBase.includes(prefix)) {
                return `${itemName} (${cnBase})`;
            }
            return cnBase || itemName;
        }
        
        return itemName;
    }
}

function translateGemName(gemName) {
    return dictGem[gemName] || gemName;
}

// FC 主函数入口
exports.handler = async (event, context) => {
    console.log('🚀 阿里云FC翻译爬虫启动 (OSS版本)');
    
    // 初始化翻译字典
    const dictsInitialized = await initializeTranslationDicts();
    if (!dictsInitialized) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: '翻译字典初始化失败' })
        };
    }
    
    // 初始化OSS客户端
    const ossClient = initOSSClient();
    
    const config = {
        BASE_URL: "https://poe.ninja/poe2/builds",
        MAX_RANK: process.env.MAX_RANK ? parseInt(process.env.MAX_RANK) : 5,
        CHROME_PATH: process.env.CHROME_PATH || '',
        USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        OUTPUT_DIR: '/tmp/translated-data',
        OSS_PATH: process.env.OSS_PATH || 'poe2-data/',
        UPLOAD_TO_OSS: process.env.UPLOAD_TO_OSS === 'true'
    };
    
    console.log(`📊 配置信息: 抓取深度=${config.MAX_RANK}, OSS上传=${config.UPLOAD_TO_OSS}`);
    
    let browser;
    try {
        // 启动浏览器
        browser = await puppeteer.launch({
            headless: true,
            executablePath: config.CHROME_PATH || '/opt/chrome/chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--single-process',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-default-apps',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ],
        });

        const result = await runTranslationTask(browser, config, ossClient);
        
        return {
            statusCode: 200,
            body: JSON.stringify(result)
        };
        
    } catch (error) {
        console.error('❌ 任务执行失败:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: error.message,
                stack: error.stack
            })
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

// 翻译任务核心逻辑 (与index.js相同，添加OSS上传)
async function runTranslationTask(browser, config, ossClient) {
    const OUTPUT_DIR = config.OUTPUT_DIR;
    
    // 确保输出目录存在
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(config.USER_AGENT);
    
    // 请求拦截优化性能
    await page.setRequestInterception(true);
    page.on("request", (req) => {
        const resourceType = req.resourceType();
        if (['media', 'font', 'texttrack', 'object', 'beacon', 'csp_report', 'imageset'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });
    
    try {
        // 阶段 1: 获取职业列表
        console.log("1️⃣ 获取职业列表...");
        await page.goto(config.BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        
        const classList = await page.evaluate(() => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a[href*="class="]'));
            links.forEach((link) => {
                const href = link.href;
                if (href.includes("/builds/vaal?") && !href.includes("hc-") && !href.includes("ssf-") && !href.includes("ruthless-")) {
                    const h4 = link.querySelector("h4");
                    const name = h4 ? h4.innerText.trim() : "";
                    if (name && !results.find((r) => r.name === name)) {
                        results.push({ name, link: href });
                    }
                }
            });
            return results;
        });
        
        console.log(`   ✅ 发现 ${classList.length} 个职业`);
        fs.writeFileSync(path.join(OUTPUT_DIR, "classes.json"), JSON.stringify(classList, null, 2));
        
        // 阶段 2: 抓取玩家数据
        console.log("\n2️⃣ 抓取并翻译玩家数据...");
        const allLadders = {};
        
        for (const cls of classList) {
            console.log(`\n2️⃣ 处理职业: ${cls.name}`);
            
            try {
                await page.goto(cls.link, { waitUntil: "domcontentloaded", timeout: 60000 });
                await page.waitForFunction(() => {
                    const rows = document.querySelectorAll("tbody tr");
                    return rows.length > 0 && rows[0].querySelector("a");
                }, { timeout: 15000 });
            } catch (e) {
                console.warn(`   ⚠️ [${cls.name}] 等待列表超时，尝试强行抓取`);
            }
            
            const players = await page.evaluate((limit) => {
                const rows = Array.from(document.querySelectorAll("tbody tr"));
                const validRows = rows.filter((r) => r.querySelector("td:nth-child(1) a"));
                return validRows
                    .slice(0, limit)
                    .map((row, i) => {
                        const a = row.querySelector("td:nth-child(1) a");
                        if (!a) return null;
                        const imgs = Array.from(row.querySelectorAll("img"));
                        let skillIcon = "";
                        if (imgs.length > 0) skillIcon = imgs[imgs.length - 1].src;

                        let account = "";
                        try {
                            const parts = a.href.split("/character/");
                            if (parts.length > 1)
                                account = decodeURIComponent(parts[1].split("/")[0]);
                        } catch (e) {}

                        return {
                            rank: i + 1,
                            name: a.innerText.trim(),
                            link: a.href,
                            account: account,
                            level: parseInt(row.querySelector("td:nth-child(2)")?.innerText || 0),
                            mainSkillIcon: skillIcon,
                        };
                    })
                    .filter((p) => p !== null);
            }, config.MAX_RANK);
            
            console.log(`   📋 解析 ${players.length} 名玩家...`);
            
            const detailedPlayers = [];
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                const detailData = await capturePlayerDetail(page, player);
                if (detailData) {
                    player.detail = detailData;
                    detailedPlayers.push(player);
                    console.log(`      ✅ 成功 ${player.name}`);
                } else {
                    console.error(`      ❌ 失败: ${player.name}`);
                }
                await new Promise((r) => setTimeout(r, 300));
            }
            
            allLadders[cls.name] = detailedPlayers;
        }
        
        // 阶段 3: 保存数据
        const result = await saveTranslatedData(OUTPUT_DIR, allLadders, classList);
        
        // 阶段 4: 上传到OSS (可选)
        let uploadResult = null;
        if (config.UPLOAD_TO_OSS && ossClient) {
            console.log("\n4️⃣ 上传数据到OSS...");
            uploadResult = await uploadToOSSStorage(ossClient, OUTPUT_DIR, config.OSS_PATH);
        }
        
        return {
            success: true,
            message: '翻译数据抓取完成',
            data: {
                classes: classList.length,
                totalPlayers: Object.values(allLadders).reduce((sum, players) => sum + players.length, 0),
                translationStats: result.translationStats,
                outputPath: OUTPUT_DIR,
                uploadResult: uploadResult
            }
        };
        
    } finally {
        await page.close();
    }
}

// 捕获玩家详细信息 (与index.js相同)
async function capturePlayerDetail(page, player) {
    // ... 与index.js相同的代码 ...
    // 为了节省空间，这里引用原文件的capturePlayerDetail函数
    // 实际使用时需要复制完整函数
    return null; // 占位符
}

// 保存翻译数据 (与index.js相同)
async function saveTranslatedData(outputDir, allLadders, classList) {
    // ... 与index.js相同的代码 ...
    // 为了节省空间，这里引用原文件的saveTranslatedData函数
    // 实际使用时需要复制完整函数
    return { translationStats: {} }; // 占位符
}

// 上传到OSS存储
async function uploadToOSSStorage(ossClient, localDir, remotePath) {
    if (!ossClient) {
        console.log('❌ OSS客户端未初始化，跳过上传');
        return null;
    }
    
    console.log(`📤 上传数据到OSS: ${remotePath}`);
    
    try {
        const allFiles = getAllFiles(localDir);
        const filesToUpload = allFiles.filter(f => !f.includes('all_data_full')); // 过滤大文件
        
        console.log(`   待上传: ${filesToUpload.length} 个文件`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (const localPath of filesToUpload) {
            // 计算远程路径
            const relativePath = path.relative(localDir, localPath).split(path.sep).join('/');
            const remoteFilePath = `${remotePath}${relativePath}`;
            
            const success = await uploadToOSS(ossClient, localPath, remoteFilePath);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        }
        
        console.log(`📊 OSS上传完成: ${successCount}/${filesToUpload.length} 成功`);
        
        return {
            success: successCount,
            total: filesToUpload.length,
            failed: failCount,
            path: remotePath
        };
        
    } catch (e) {
        console.error('❌ OSS上传失败:', e.message);
        return {
            success: 0,
            total: 0,
            failed: 0,
            error: e.message
        };
    }
}