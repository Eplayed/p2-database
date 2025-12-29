/* 阿里云 Web 函数 - v14.0 完美融合版 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
// const { HttpsProxyAgent } = require('https-proxy-agent'); // 部署时注释掉

// --- 1. 加载字典 ---
let dictBase = {}, dictUnique = {}, dictGem = {}, dictPassive = {};
try {
    const rootDir = __dirname;
    const distDir = path.join(__dirname, 'dist');
    const loadJSON = (filename) => {
        let p = path.join(rootDir, filename);
        if (!fs.existsSync(p)) p = path.join(distDir, filename);
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
        return {};
    };
    dictBase = loadJSON('dict_base.json');
    dictUnique = loadJSON('dict_unique.json');
    dictGem = loadJSON('dict_gem.json');
    // dictPassive = loadJSON('dict_passive.json'); // 如果有就加载
    console.log('✅ 字典加载成功');
} catch (e) { console.error('❌ 字典加载失败', e); }

// --- 2. 赛季映射 ---
const LEAGUE_MAP = {
    'vaal': 'fate-of-the-vaal',
    'standard': 'poe2',
    'hardcore': 'poe2_hc'
};

// --- 3. 请求函数 ---
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        // --- 🔴 本地调试代理 ---
        // const proxyUrl = 'http://127.0.0.1:7890'; 
        // const agent = new HttpsProxyAgent(proxyUrl);

        const options = {
            // agent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://poe.ninja/',
                'Accept': 'text/html,application/json'
            },
            rejectUnauthorized: false
        };
        
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return makeRequest(res.headers.location).then(resolve).catch(reject);
                }
                resolve({ statusCode: res.statusCode, data: data });
            });
        }).on('error', (e) => reject(e));
    });
}

// --- 4. 获取 Build ID ---
let cachedBuildId = null;
let lastFetchTime = 0;

async function getLatestBuildId() {
    const now = Date.now();
    if (cachedBuildId && (now - lastFetchTime < 10 * 60 * 1000)) return cachedBuildId;

    console.log('[爬虫] 正在获取最新 Build ID...');
    const res = await makeRequest('https://poe.ninja/poe2/builds/vaal');
    
    let regex = /([0-9]{4}-[0-9]{8}-[0-9]{5})/;
    let match = res.data ? res.data.match(regex) : null;

    if (match && match[1]) {
        cachedBuildId = match[1];
        lastFetchTime = now;
        return cachedBuildId;
    }
    throw new Error('未找到 Build ID');
}

// --- 5. HTTP 服务器 ---
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');

    if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }
    if (req.method !== 'POST') {
        res.end(JSON.stringify({ code: -1, msg: "请使用 POST 方法" }));
        return;
    }

    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk);
    req.on('end', async () => {
        try {
            const body = JSON.parse(bodyStr || '{}');
            const userUrl = body.url;
            if (!userUrl) throw new Error("缺少 url 参数");

            const regex = /character\/([^\/]+)\/([^\/?]+)/;
            const match = userUrl.match(regex);
            if (!match) throw new Error("链接格式错误");

            // --- 核心修复：先解码，处理韩文/俄文 ---
            let account = match[1];
            let charName = match[2];
            try {
                account = decodeURIComponent(account);
                charName = decodeURIComponent(charName);
            } catch (e) {}

            // 提取赛季
            let urlLeague = 'poe2';
            const leagueMatch = userUrl.match(/builds\/([^\/]+)\//);
            if (leagueMatch) urlLeague = leagueMatch[1].toLowerCase();
            const apiLeague = LEAGUE_MAP[urlLeague] || urlLeague;

            // 获取 ID
            let buildId = '0542-20251215-15260'; 
            try { buildId = await getLatestBuildId(); } catch (e) {}

            const apiUrl = `https://poe.ninja/poe2/api/builds/${buildId}/character?account=${encodeURIComponent(account)}&name=${encodeURIComponent(charName)}&overview=${encodeURIComponent(apiLeague)}`;
            
            console.log(`[请求API] ${apiUrl}`);
            
            const apiRes = await makeRequest(apiUrl);
            let ninjaData = null;
            try { ninjaData = JSON.parse(apiRes.data); } catch (e) {}

            if (!ninjaData || !ninjaData.items) {
                let displayLeague = 'standard';
                if (leagueMatch) displayLeague = leagueMatch[1];
                const webUrl = `https://poe.ninja/poe2/builds/${displayLeague}/character/${encodeURIComponent(account)}/${encodeURIComponent(charName)}`;
                res.end(JSON.stringify({ 
                    code: -1, 
                    msg: `未找到角色数据。\n建议复制链接去浏览器查看：\n${webUrl}` 
                }));
                return;
            }

            // ================= 数据清洗区域 =================

            // 1. 装备 (Equipment)
            const cleanEquipment = (ninjaData.items || []).map(item => {
                const iData = item.itemData || item; 
                let displayName = iData.baseType || iData.name;
                let staticDesc = "";
                let rarity = iData.frameType; 

                if (rarity === 3) {
                    const uInfo = dictUnique[iData.name];
                    if (uInfo) {
                        displayName = uInfo.cn;
                        staticDesc = uInfo.desc;
                    } else {
                        displayName = iData.name;
                    }
                } else {
                    const baseEn = iData.baseType;
                    const cnBase = dictBase[baseEn];
                    if (cnBase) {
                        displayName = (iData.name && iData.name !== baseEn) ? `${iData.name} (${cnBase})` : cnBase;
                    }
                }

                const gems = (iData.socketedItems || []).map(gem => {
                    const gName = gem.typeLine || gem.baseType;
                    return {
                        name: dictGem[gName] || gName, 
                        icon: gem.icon,
                        isSupport: gem.support
                    };
                });

                return {
                    slot: item.inventoryId || iData.inventoryId,
                    name: displayName,
                    icon: iData.icon,
                    rarity: rarity,
                    desc: staticDesc,
                    gems: gems
                };
            });

            // 2. 技能组 (Skills) - 【找回来了！】
            const cleanSkills = (ninjaData.skills || []).map(skillGroup => {
                const gems = (skillGroup.allGems || []).map(gem => {
                    const rawName = gem.name || (gem.itemData ? gem.itemData.typeLine : "");
                    const isSupport = gem.itemData ? gem.itemData.support : false;
                    return {
                        name: dictGem[rawName] || rawName,
                        enName: rawName,
                        icon: gem.itemData ? gem.itemData.icon : "",
                        isSupport: isSupport,
                        level: gem.level
                    };
                });
                
                const mainGem = gems.find(g => !g.isSupport) || gems[0];
                return {
                    mainSkillName: mainGem ? mainGem.name : "未知技能",
                    gems: gems
                };
            });

            // 3. 天赋大点 (Keystones) - 【找回来了！】
            const cleanKeystones = (ninjaData.keystones || []).map(ks => {
                return {
                    name: dictPassive[ks.name] ? dictPassive[ks.name].cn : ks.name,
                    icon: ks.icon
                };
            });

            // 4. 网页链接
            let displayLeague = 'standard';
            if (leagueMatch) displayLeague = leagueMatch[1];
            const webUrl = `https://poe.ninja/poe2/builds/${displayLeague}/character/${encodeURIComponent(account)}/${encodeURIComponent(charName)}`;

            // ================= 返回最终 JSON =================
            res.end(JSON.stringify({
                code: 0,
                data: {
                    info: { 
                        class: ninjaData.class, 
                        level: ninjaData.level, 
                        name: ninjaData.name, 
                        league: apiLeague,
                        buildId: buildId,
                        webUrl: webUrl
                    },
                    equipment: cleanEquipment, // 装备
                    skills: cleanSkills,       // 技能 (这次有了!)
                    keystones: cleanKeystones  // 天赋 (这次也有了!)
                }
            }));

        } catch (e) {
            console.error('处理出错:', e);
            res.end(JSON.stringify({ code: -2, msg: "系统错误: " + e.message }));
        }
    });
});

server.listen(9000, '0.0.0.0', () => {
    console.log('Server started on port 9000');
});