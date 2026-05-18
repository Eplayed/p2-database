require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const puppeteer = require("puppeteer"); // 本地调试用完整版
const fs = require("fs");
const path = require("path");
const uploadAll = require("./upload_to_oss");
const envConfig = require("./env-config");

// --- 0. 配置 ---
const TARGET_URL = "https://poe.ninja/poe2/economy/vaal/currency";
const OUTPUT_FILE = "economy.json";
const OUTPUT_DIR = envConfig.dataDir || "./data";

// 🔴 修改：根据环境变量判断是否使用代理
// 在 GitHub Actions 中我们不设置 USE_PROXY，在本地 .env 里可以设置 USE_PROXY=true
const USE_PROXY = process.env.USE_PROXY === "true";
const LOCAL_PROXY = "http://127.0.0.1:7890";

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// --- 1. ID 映射表 (简写 -> 全名) ---
// 这是修复新版 API 的关键！
const ID_MAP = {
  mirror: "Mirror of Kalandra",
  divine: "Divine Orb",
  exalted: "Exalted Orb",
  regal: "Regal Orb",
  chaos: "Chaos Orb",
  alch: "Orb of Alchemy",
  alteration: "Orb of Alteration",
  annul: "Orb of Annulment",
  chance: "Orb of Chance",
  transmute: "Orb of Transmutation",
  aug: "Orb of Augmentation",
  vaal: "Vaal Orb",
  gcp: "Gemcutter's Prism",
  bauble: "Glassblower's Bauble",
  whetstone: "Blacksmith's Whetstone",
  scrap: "Armourer's Scrap",
  "scroll-wis": "Scroll of Wisdom",
  jewellers: "Perfect Jeweller's Orb", // PoE2 特有
  fusing: "Orb of Fusing", // 如果有的话
  scour: "Orb of Scouring",
  regret: "Orb of Regret",
  chis: "Cartographer's Chisel",
  artificer: "Artificer's Orb",
};

// --- 2. 加载汉化字典 ---
let dictionary = {};
try {
  const dictPath = path.join(__dirname, "base-data/dist/dict_base.json");
  if (fs.existsSync(dictPath)) {
    dictionary = JSON.parse(fs.readFileSync(dictPath, "utf8"));
  }
} catch (e) {}

// 手动补充翻译 (针对 PoE2 新通货)

const MANUAL_DICT = {
  "mirror": "卡兰德的魔镜",
  "hinekoras-lock": "希内克拉的锁",
  "fracturing-orb": "破裂石",
  "divine": "神圣石",
  "perfect-chaos-orb": "完美混沌石",
  "vaal-cultivation-orb": "瓦尔培养石",
  "perfect-exalted-orb": "完美崇高石",
  "ancient-infuser": "远古灌注器",
  "annul": "剥离石",
  "architects-orb": "建筑师之石",
  "perfect-jewellers-orb": "完美工匠石",
  "vaal-infuser": "瓦尔灌注器",
  "alch": "点金石",
  "exalted": "崇高石",
  "chaos": "混沌石",
  "artificers": "技师石",
  "artificers-shard": "技师石碎片",
  "aug": "增幅石",
  "bauble": "玻璃弹珠",
  "chance": "机会石",
  "chance-shard": "机会石碎片",
  "core-destabiliser": "核心去稳器",
  "crystallised-corruption": "结晶腐化",
  "etcher": "蚀刻石",
  "greater-regal-orb": "高阶富豪石",
  "lesser-jewellers-orb": "低阶工匠石",
  "perfect-regal-orb": "完美富豪石",
  "regal": "富豪石",
  "scrap": "护甲片",
  "vaal-siphoner": "瓦尔虹吸器",
  "gcp": "宝石匠的棱镜",
  "greater-chaos-orb": "高阶混沌石",
  "greater-exalted-orb": "高阶崇高石",
  "greater-jewellers-orb": "高阶工匠石",
  "greater-orb-of-augmentation": "高阶增幅石",
  "greater-orb-of-transmutation": "高阶蜕变石",
  "orb-of-extraction": "萃取石",
  "perfect-orb-of-augmentation": "完美增幅石",
  "perfect-orb-of-transmutation": "完美蜕变石",
  "regal-shard": "富豪石碎片",
  "transmutation-shard": "蜕变石碎片",
  "transmute": "蜕变石",
  "vaal": "瓦尔宝珠",
  "whetstone": "磨刀石",
  "wisdom": "鉴定卷轴"
};
// 辅助：将 kebab-case 转为 Title Case (hinekoras-lock -> Hinekoras Lock)
function formatIdToName(id) {
  if (!id) return "";
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function translateCurrency(rawId) {
  // 1. 尝试直接匹配 ID
  if (MANUAL_DICT[rawId]) return MANUAL_DICT[rawId];

  // 2. 格式化后再匹配 (perfect-chaos-orb -> Perfect Chaos Orb)
  const formattedName = formatIdToName(rawId);

  // 3. 查手动字典
  if (MANUAL_DICT[formattedName]) return MANUAL_DICT[formattedName];

  // 4. 查基础字典
  if (dictionary[formattedName]) return dictionary[formattedName];

  // 5. 兜底返回格式化后的英文名
  return formattedName;
}

// 辅助：首字母大写 (用于处理 ID_MAP 里没有的漏网之鱼)
function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function runEconomyTask() {
  console.log("💰 [汇率爬虫 V5.0] 启动...");
  // 🔴 修改：构建启动参数
  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage", // 防止内存不足
  ];

  if (USE_PROXY) {
    console.log(`   🌐 使用本地代理: ${LOCAL_PROXY}`);
    launchArgs.push(`--proxy-server=${LOCAL_PROXY}`);
  }
  const browser = await puppeteer.launch({
    // 🔴 修改：CI 环境必须是 headless，本地可以是 false
    headless: process.env.CI ? "new" : false,
    args: launchArgs,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(USER_AGENT);

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["image", "media", "font"].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  try {
    let capturedData = null;

    page.on("response", async (res) => {
      const url = res.url();
      // 匹配新版 API
      if (url.includes("/economy/exchange/current/overview")) {
        try {
          const json = await res.json();
          const list =
            json.lines || json.entries || (Array.isArray(json) ? json : []);
          if (list.length > 0) {
            console.log(`   ⚡️ 捕获到 API 数据: ${list.length} 条`);
            capturedData = list;
          }
        } catch (e) {}
      }
    });

    console.log(`   🔗 访问: ${TARGET_URL}`);
    try {
      await page.goto(TARGET_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } catch (e) {}

    let attempts = 0;
    while (!capturedData && attempts < 15) {
      await new Promise((r) => setTimeout(r, 1000));
      attempts++;
      process.stdout.write(".");
    }
    console.log("");

    if (!capturedData) throw new Error("未抓取到汇率数据");

    // --- 4. 数据清洗 (适配新结构) ---
    const rates = capturedData.map((item) => {
      const rawId = item.id || item.currencyTypeName; // e.g. "alch"
      // 1. 还原全名: "alch" -> "Orb of Alchemy"
      // const enName = ID_MAP[rawId] || capitalize(rawId);

      // 2. 获取价格和涨跌
      const price = item.primaryValue || item.chaosEquivalent || 0;
      const change = item.sparkline ? item.sparkline.totalChange : 0;

      return {
        id: rawId,
        name: translateCurrency(rawId),
        enName: formatIdToName(rawId),
        price: parseFloat(price.toFixed(1)),
        change: parseFloat(change.toFixed(1)),
        // 构造一个 icon 字段给前端用
        iconName: rawId.replace(/-/g, "_"), // perfect-chaos-orb -> perfect_chaos_orb
      };
    });

    // 排序
    rates.sort((a, b) => {
      if (a.enName === "Mirror of Kalandra") return -1;
      if (b.enName === "Mirror of Kalandra") return 1;
      if (a.enName === "Divine Orb") return -1;
      if (b.enName === "Divine Orb") return 1;
      return b.price - a.price;
    });

    const finalData = {
      updateTime: new Date().toISOString(),
      league: "Fate of the Vaal",
      rates: rates,
    };

    const savePath = path.join(OUTPUT_DIR, OUTPUT_FILE);
    fs.writeFileSync(savePath, JSON.stringify(finalData));
    console.log(`   ✅ 数据已保存: ${savePath}`);

    // 触发上传 (如果作为独立脚本运行)
    if (require.main === module) {
      await uploadAll();
    }

    return finalData;
  } catch (e) {
    console.error("\n❌ 汇率抓取失败:", e.message);
    throw e;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runEconomyTask();
}

module.exports = { runEconomyTask };
