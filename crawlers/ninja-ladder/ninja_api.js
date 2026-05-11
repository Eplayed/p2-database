/**
 * poe.ninja HTTP API 封装
 * 纯 HTTP 调用，不需要 Puppeteer
 */

const https = require('https');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const API_RETRY = 3;
const REQUEST_DELAY = 800; // ms

let lastRequestTime = 0;

/**
 * 基础 HTTP GET 请求
 */
function makeRequest(url) {
  return new Promise(async (resolve, reject) => {
    // 限速
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < REQUEST_DELAY) {
      await new Promise(r => setTimeout(r, REQUEST_DELAY - elapsed));
    }
    lastRequestTime = Date.now();

    const options = {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://poe.ninja/',
        'Accept': 'text/html,application/json',
      },
      rejectUnauthorized: false,
      timeout: 30000,
    };

    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return makeRequest(res.headers.location).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 获取最新的 Build ID
 * Build ID 格式: 2024-20240108-00005
 */
let cachedBuildId = null;
async function getBuildId() {
  if (cachedBuildId) return cachedBuildId;

  const res = await makeRequest('https://poe.ninja/poe2/builds/vaal');
  if (res.statusCode !== 200) {
    throw new Error(`获取 Build ID 失败: HTTP ${res.statusCode}`);
  }

  const regex = /([0-9]{4}-[0-9]{8}-[0-9]{5})/;
  const match = res.data.match(regex);
  if (match && match[1]) {
    cachedBuildId = match[1];
    return cachedBuildId;
  }

  throw new Error('未找到 Build ID');
}

/**
 * 获取职业列表
 * 从 poe.ninja 页面 HTML 中提取职业链接
 */
async function fetchClassList(buildId) {
  const res = await makeRequest('https://poe.ninja/poe2/builds/vaal');
  if (res.statusCode !== 200) {
    throw new Error(`获取职业列表失败: HTTP ${res.statusCode}`);
  }

  // 从 HTML 中提取职业名称
  // 匹配 href="/poe2/builds/vaal?class=ClassName" 中的 class 参数
  const classPattern = /\/poe2\/builds\/vaal\?class=([A-Za-z+%]+)/g;
  const classes = new Set();
  let match;
  while ((match = classPattern.exec(res.data)) !== null) {
    const className = decodeURIComponent(match[1]).replace(/\+/g, ' ');
    // 排除 HC/SSF 变体
    if (!className.includes('hc-') && !className.includes('ssf-')) {
      classes.add(className);
    }
  }

  // 如果从 URL 参数提取失败，尝试从页面文本提取
  if (classes.size === 0) {
    // 备选: 从 __NEXT_DATA__ 或其他结构提取
    const nextDataMatch = res.data.match(/__NEXT_DATA__.*?({.*?})<\/script>/s);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // 尝试从 props 中提取
        const buildData = nextData?.props?.pageProps;
        if (buildData?.classes) {
          return buildData.classes.map(c => ({ name: c.name, link: `https://poe.ninja/poe2/builds/vaal?class=${encodeURIComponent(c.name)}` }));
        }
      } catch (e) {}
    }

    // 硬编码已知职业列表作为兜底
    const knownClasses = [
      'Blood Mage', 'Infernalist', 'Deadeye', 'Pathfinder',
      'Chronomancer', 'Stormweaver', 'Titan', 'Warbringer',
      'Witchhunter', 'Gemling Legionnaire', 'Acolyte of Chayula',
      'Invoker', 'Lich', 'Druid', 'Beastmaster',
    ];
    return knownClasses.map(name => ({
      name,
      link: `https://poe.ninja/poe2/builds/vaal?class=${encodeURIComponent(name)}`,
    }));
  }

  return Array.from(classes).map(name => ({
    name,
    link: `https://poe.ninja/poe2/builds/vaal?class=${encodeURIComponent(name)}`,
  }));
}

/**
 * 获取某个职业的 Top N 玩家列表
 * 使用 poe.ninja 的 overview API
 */
async function fetchPlayerList(buildId, className, limit) {
  const league = 'fate-of-the-vaal';
  const url = `https://poe.ninja/poe2/api/builds/${buildId}/overview?overview=${encodeURIComponent(league)}&class=${encodeURIComponent(className)}&sort=depth`;

  for (let retry = 0; retry < API_RETRY; retry++) {
    try {
      const res = await makeRequest(url);
      if (res.statusCode === 200) {
        const data = JSON.parse(res.data);
        
        // poe.ninja overview API 返回格式
        const accounts = data.accounts || [];
        const names = data.names || [];
        const classes = data.classes || [];
        const levels = data.levels || [];
        const depths = data.depths || [];

        const players = [];
        const count = Math.min(limit, accounts.length);
        
        for (let i = 0; i < count; i++) {
          players.push({
            rank: i + 1,
            account: accounts[i] || '',
            name: names[i] || '',
            class: className,
            level: levels[i] || 0,
            depth: depths[i] || 0,
          });
        }

        return players;
      }
    } catch (e) {
      if (retry < API_RETRY - 1) {
        await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
      }
    }
  }

  return [];
}

/**
 * 获取单个玩家的详细数据
 */
async function fetchPlayerDetail(buildId, account, charName) {
  const league = 'fate-of-the-vaal';
  const url = `https://poe.ninja/poe2/api/builds/${buildId}/character?account=${encodeURIComponent(account)}&name=${encodeURIComponent(charName)}&overview=${encodeURIComponent(league)}`;

  for (let retry = 0; retry < API_RETRY; retry++) {
    try {
      const res = await makeRequest(url);
      if (res.statusCode === 200) {
        const data = JSON.parse(res.data);
        if (data && (data.items || data.skills)) {
          return data;
        }
      }
      if (retry < API_RETRY - 1) {
        await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
      }
    } catch (e) {
      if (retry < API_RETRY - 1) {
        await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
      }
    }
  }

  return null;
}

module.exports = { getBuildId, fetchClassList, fetchPlayerList, fetchPlayerDetail };
