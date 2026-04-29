const puppeteer = require("puppeteer");
const https = require("https");
const fs = require("fs");
const path = require("path");
const envConfig = require("./env-config");

// 配置控制
const BASE_URL = "https://poe.ninja/poe2/builds";
const MAX_RANK = process.env.MAX_RANK || envConfig.crawler.maxRank || 7;
const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const API_CONCURRENCY = 3; // 🔧 API 并发数
const API_RETRY = 3;       // 🔧 API 重试次数

// 赛季映射
const LEAGUE_MAP = {
  'vaal': 'fate-of-the-vaal',
  'standard': 'poe2',
  'hardcore': 'poe2_hc'
};

// 确保 data/ 和 data/players/ 目录存在
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const PLAYER_DIR = path.join(OUTPUT_DIR, 'players');
if (!fs.existsSync(PLAYER_DIR)) fs.mkdirSync(PLAYER_DIR, { recursive: true });
console.log(`📁 玩家数据将保存到: ${PLAYER_DIR}`);

// ==========================================
// HTTP 请求工具函数
// ==========================================
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
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

// 获取 Build ID（从页面 HTML 中提取）
let cachedBuildId = null;
async function getLatestBuildId() {
  if (cachedBuildId) return cachedBuildId;

  console.log('🔑 正在获取最新 Build ID...');
  const res = await makeRequest('https://poe.ninja/poe2/builds/vaal');

  const regex = /([0-9]{4}-[0-9]{8}-[0-9]{5})/;
  const match = res.data ? res.data.match(regex) : null;

  if (match && match[1]) {
    cachedBuildId = match[1];
    console.log(`   ✅ Build ID: ${cachedBuildId}`);
    return cachedBuildId;
  }
  throw new Error('未找到 Build ID');
}

// 通过 API 获取玩家详情
async function fetchPlayerDetail(account, charName, buildId) {
  const league = LEAGUE_MAP['vaal'] || 'fate-of-the-vaal';
  const apiUrl = `https://poe.ninja/poe2/api/builds/${buildId}/character?account=${encodeURIComponent(account)}&name=${encodeURIComponent(charName)}&overview=${encodeURIComponent(league)}`;

  for (let retry = 0; retry < API_RETRY; retry++) {
    try {
      const res = await makeRequest(apiUrl);
      if (res.statusCode === 200) {
        const data = JSON.parse(res.data);
        if (data && (data.items || data.skills)) {
          return data;
        }
      }
      // 非 200 或数据为空，等待后重试
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

// 并发控制
async function asyncPool(poolLimit, array, iteratorFn) {
  const results = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    results.push(p);
    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.allSettled(results);
}

// ==========================================
// 主逻辑
// ==========================================
(async () => {
  console.log(
    `🚀 [V6.0 API爬虫] 启动 | 环境: ${
      process.env.NODE_ENV || "dev"
    } | 目标深度: ${MAX_RANK} | API并发: ${API_CONCURRENCY}`
  );

  const startTime = Date.now();

  // ==========================================
  // 阶段 1: 用 Puppeteur 获取职业列表和玩家列表（快速，不会超时）
  // ==========================================
  console.log("\n1️⃣  正在扫描职业入口...");

  const browser = await puppeteer.launch({
    headless: envConfig.crawler.headless,
    protocolTimeout: 120000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  let classList = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    classList = await page.evaluate(() => {
      const results = [];
      const links = Array.from(document.querySelectorAll('a[href*="class="]'));
      links.forEach((link) => {
        const href = link.href;
        if (
          href.includes("/builds/vaal?") &&
          !href.includes("hc-") &&
          !href.includes("ssf-") &&
          !href.includes("ruthless-")
        ) {
          const h4 = link.querySelector("h4");
          const name = h4 ? h4.innerText.trim() : "";
          if (name && !results.find((r) => r.name === name)) {
            results.push({ name, link: href });
          }
        }
      });
      return results;
    });

    console.log(`   ✅ 发现 ${classList.length} 个职业入口`);
  } catch (e) {
    console.error("❌ 获取职业列表失败:", e.message);
  } finally {
    await browser.close();
  }

  if (classList.length === 0) {
    console.error("❌ 没有获取到职业列表，退出");
    process.exit(1);
  }

  // ==========================================
  // 阶段 2: 获取每个职业的玩家列表（也用 Puppeteer，但每个职业只打开一个页面）
  // ==========================================
  console.log("\n2️⃣  获取各职业玩家列表...");

  const browser2 = await puppeteer.launch({
    headless: envConfig.crawler.headless,
    protocolTimeout: 120000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const allPlayers = {}; // { className: [{rank, name, account, link}] }

  try {
    const page = await browser2.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    for (const cls of classList) {
      console.log(`   扫描: ${cls.name}`);
      try {
        await page.goto(cls.link, { waitUntil: "domcontentloaded", timeout: 30000 });
        try {
          await page.waitForSelector("tbody tr", { timeout: 10000 });
        } catch (e) {}

        const players = await page.evaluate((limit) => {
          const rows = Array.from(document.querySelectorAll("tbody tr")).slice(0, limit);
          return rows
            .map((row, i) => {
              const a = row.querySelector("td:nth-child(1) a");
              if (!a) return null;
              const link = a.href;
              // 从链接中提取 account 和 charName
              // 链接格式: https://poe.ninja/poe2/builds/vaal/character/{account}/{charName}
              const match = link.match(/character\/([^\/]+)\/([^\/?]+)/);
              let account = '';
              let charName = a.innerText.trim();
              if (match) {
                try { account = decodeURIComponent(match[1]); } catch (e) { account = match[1]; }
                try { charName = decodeURIComponent(match[2]); } catch (e) { charName = match[2]; }
              }
              return { rank: i + 1, name: charName, account: account, link: link };
            })
            .filter((p) => p !== null && p.account);
        }, MAX_RANK);

        allPlayers[cls.name] = players;
        console.log(`   ✅ ${cls.name}: ${players.length} 人`);
      } catch (e) {
        console.error(`   ❌ ${cls.name} 扫描失败: ${e.message}`);
        allPlayers[cls.name] = [];
      }
    }
  } finally {
    await browser2.close();
  }

  // 统计总玩家数
  let totalPlayerCount = 0;
  for (const players of Object.values(allPlayers)) {
    totalPlayerCount += players.length;
  }
  console.log(`\n   📊 共 ${totalPlayerCount} 位玩家待抓取`);

  // ==========================================
  // 阶段 3: 用 API 批量获取玩家详情（纯 HTTP，不用浏览器）
  // ==========================================
  console.log("\n3️⃣  通过 API 获取玩家详情...");

  // 获取 Build ID
  let buildId;
  try {
    buildId = await getLatestBuildId();
  } catch (e) {
    console.error("❌ 获取 Build ID 失败:", e.message);
    process.exit(1);
  }

  // 构建所有任务
  const tasks = [];
  for (const [cls, players] of Object.entries(allPlayers)) {
    for (const player of players) {
      tasks.push({ cls, player });
    }
  }

  console.log(`   共 ${tasks.length} 个任务，并发数: ${API_CONCURRENCY}`);

  let successCount = 0;
  let failCount = 0;
  let taskIndex = 0;

  await asyncPool(API_CONCURRENCY, tasks, async ({ cls, player }) => {
    taskIndex++;
    const progress = `[${taskIndex}/${tasks.length}]`;

    try {
      const rootData = await fetchPlayerDetail(player.account, player.name, buildId);

      if (!rootData) {
        console.log(`   ${progress} ⚠️ 无数据: ${player.name} (${cls})`);
        failCount++;
        return;
      }

      // 清洗数据
      let keystones = [];
      try {
        keystones = (rootData.keystones || []).map((ks) => {
          let iconPath = ks.icon || '';
          if (iconPath) {
            const match = iconPath.match(/\/passives\/([^?]+\.png|\/[^?]+\.webp)/i);
            if (match) {
              iconPath = `passives/${match[1]}`;
            } else if (iconPath.startsWith('http')) {
              const urlMatch = iconPath.match(/\/([^/]+\.(png|webp))$/i);
              if (urlMatch) iconPath = urlMatch[1];
            }
          }
          return { name: ks.name, icon: iconPath };
        });
      } catch (e) {}

      const cleaned = {
        info: {
          name: rootData.name,
          class: rootData.class || cls,
          level: rootData.level,
          league: rootData.league,
          account: rootData.account || player.account,
        },
        equipment: (rootData.items || []).map((item) => {
          const i = item.itemData || item;
          return {
            slot: item.inventoryId,
            name: i.name || i.baseType,
            icon: i.icon,
            rarity: i.frameType,
            desc: i.explicitMods?.join("\n") || "",
          };
        }),
        skills: (rootData.skills || []).map((s) => ({
          gems: (s.allGems || []).map((g) => ({
            name: g.name,
            icon: g.itemData?.icon,
            isSupport: g.itemData?.support,
          })),
        })),
        keystones: keystones,
      };

      // 保存到文件
      const sanitize = (str) => (str || '').replace(/#/g, '_');
      const playerFileName = `${sanitize(cleaned.info.account)}_${sanitize(cleaned.info.name)}.json`;
      const playerFilePath = path.join(PLAYER_DIR, playerFileName);
      fs.writeFileSync(playerFilePath, JSON.stringify(cleaned, null, 2));

      successCount++;
      if (successCount % 10 === 0) {
        console.log(`   ${progress} ✅ 已完成 ${successCount} 个 (失败 ${failCount})`);
      }
    } catch (err) {
      failCount++;
      console.error(`   ${progress} ❌ 失败 ${player.name}: ${err.message}`);
    }
  });

  console.log(`\n   📊 抓取完成: 成功 ${successCount}, 失败 ${failCount}`);

  // ==========================================
  // 阶段 4: 保存汇总结果
  // ==========================================
  const allLadders = {};
  for (const [cls, players] of Object.entries(allPlayers)) {
    allLadders[cls] = players;
  }

  const finalData = {
    updateTime: new Date().toLocaleString(),
    classes: classList,
    ladders: allLadders,
  };

  const outPath = path.join(
    OUTPUT_DIR,
    envConfig.getFileName("all_data_full")
  );
  fs.writeFileSync(outPath, JSON.stringify(finalData, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 全部抓取任务完成！耗时: ${elapsed}s`);
  console.log(`   汇总文件: ${outPath}`);
  console.log(`   玩家详情: ${PLAYER_DIR}/ (${successCount} 个文件)`);
})();
