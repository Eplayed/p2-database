const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const https = require("https");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// 加载翻译字典
let dictBase = {},
  dictUnique = {},
  dictGem = {},
  dictPassive = {};
dictStats = { keywords: {}, patterns: [] }; // 新增 dictStats
try {
  const baseDataDir = path.join(__dirname, "../base-data/dist");
  dictBase = JSON.parse(
    fs.readFileSync(path.join(baseDataDir, "dict_base.json"), "utf8")
  );
  dictUnique = JSON.parse(
    fs.readFileSync(path.join(baseDataDir, "dict_unique.json"), "utf8")
  );
  dictGem = JSON.parse(
    fs.readFileSync(path.join(baseDataDir, "dict_gem.json"), "utf8")
  );
  // 尝试加载词缀字典，如果不存在则使用默认空对象
  const statsPath = path.join(baseDataDir, "dict_stats.json");
  if (fs.existsSync(statsPath)) {
    dictStats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
  }
  const passivePath = path.join(baseDataDir, "dict_passive.json");
  if (fs.existsSync(passivePath)) {
    dictPassive = JSON.parse(fs.readFileSync(passivePath, "utf8"));
  } else {
    const rawPassivePath = path.join(__dirname, "../base-data/passives.json");
    if (fs.existsSync(rawPassivePath)) {
      const rawPassives = JSON.parse(fs.readFileSync(rawPassivePath, "utf8"));
      dictPassive = rawPassives.reduce((map, item) => {
        if (item.en) map[item.en] = { cn: item.cn, img: item.img };
        return map;
      }, {});
    }
  }
  console.log("✅ 翻译字典加载成功");
} catch (e) {
  console.error("❌ 翻译字典加载失败", e);
}

// 配置
const BASE_URL = "https://poe.ninja/poe2/builds";

const isDev = process.env.NODE_ENV === "dev";
const isCI = process.env.CI === "true";  // 检测是否在 CI 环境
// 根据环境设置抓取深度：dev=1个，production=3个（提速）
const MAX_RANK = isDev ? 1 : 3;

// 浏览器定期重启策略（每处理 N 个职业后重启）
const BROWSER_RESTART_INTERVAL = isCI ? 3 : 10;  // CI 环境更频繁重启

const OUTPUT_DIR = isDev
  ? path.join(__dirname, "../translated-data/dev")
  : path.join(__dirname, "../translated-data/release");

const QUEST_REWARD_CATALOG = [
  {
    originalText: "+10% to [Resistances|Cold Resistance]",
    act: "Act 1",
    actName: "第一章",
    source: "Clearfell - Beira of the Rotten Pack",
    sourceCn: "克利尔菲尔 - 腐化兽群的贝拉",
  },
  {
    originalText: "+30 to [Spirit|Spirit]",
    act: "Act 1",
    actName: "第一章",
    source: "Freythorn - The King in the Mists",
    sourceCn: "弗雷索恩 - 迷雾之王",
  },
  {
    originalText: "+20 to maximum Life",
    act: "Act 1",
    actName: "第一章",
    source: "Ogham Manor - Candlemass, the Living Rite",
    sourceCn: "奥甘庄园 - 活祭仪式烛火",
  },
  {
    originalText: "30% increased [Charm] Charges gained",
    act: "Act 2",
    actName: "第二章",
    source: "Valley of the Titans - Medallion",
    sourceCn: "泰坦之谷 - 勋章",
  },
  {
    originalText: "+1 [Charm] Slot",
    act: "Act 2",
    actName: "第二章",
    source: "Valley of the Titans - Medallion",
    sourceCn: "泰坦之谷 - 勋章",
  },
  {
    originalText: "+10% to [Resistances|Lightning Resistance]",
    act: "Act 2",
    actName: "第二章",
    source: "The Spires of Deshar - Sisters of Garukhan",
    sourceCn: "德沙尖塔 - 加鲁坎姐妹",
  },
  {
    originalText: "30% increased [AilmentThreshold|Elemental Ailment Threshold]",
    act: "Act 3",
    actName: "第三章",
    source: "The Venom Crypts - Venom Draught",
    sourceCn: "剧毒墓穴 - 毒液药剂",
  },
  {
    originalText: "+30 to [Spirit|Spirit]",
    act: "Act 3",
    actName: "第三章",
    source: "The Azak Bog - Ignagduk, the Bog Witch",
    sourceCn: "阿扎克沼泽 - 沼泽女巫伊格纳杜克",
  },
  {
    originalText: "+10% to [Resistances|Fire Resistance]",
    act: "Act 3",
    actName: "第三章",
    source: "Jiquani's Machinarium - Blackjaw, the Remnant",
    sourceCn: "吉卡尼的机械迷城 - 遗存者黑颚",
  },
  {
    originalText: "30% increased Life Recovery from [Flask|Flasks]",
    act: "Act 4",
    actName: "第四章",
    source: "Abandoned Prison - Goddess of Justice",
    sourceCn: "废弃监狱 - 正义女神",
  },
  {
    originalText: "5% increased maximum Mana",
    act: "Act 4",
    actName: "第四章",
    source: "Eye of Hinekora - Navali's Rest",
    sourceCn: "希内寇拉之眼 - 娜瓦莉安息处",
  },
  {
    originalText: "+5% to [Resistances|Fire Resistance]",
    act: "Act 4",
    actName: "第四章",
    source: "Halls of the Dead - Ngamahu's Test",
    sourceCn: "死者大厅 - 纳玛乎的试炼",
  },
  {
    originalText: "+5% to [Resistances|Cold Resistance]",
    act: "Act 4",
    actName: "第四章",
    source: "Halls of the Dead - Tasalio's Test",
    sourceCn: "死者大厅 - 塔萨里奥的试炼",
  },
  {
    originalText: "+5% to [Resistances|Lightning Resistance]",
    act: "Act 4",
    actName: "第四章",
    source: "Halls of the Dead - Tawhoa's Test",
    sourceCn: "死者大厅 - 塔霍亚的试炼",
  },
  {
    originalText: "+40 to [Spirit|Spirit]",
    act: "Interludes",
    actName: "间章",
    source: "Kriar Village - Lythara, the Wayward Spear",
    sourceCn: "克里亚尔村 - 迷途之矛莉萨拉",
  },
  {
    originalText: "5% increased maximum Life",
    act: "Interludes",
    actName: "间章",
    source: "The Khari Crossing - Molten Shrine",
    sourceCn: "卡里渡口 - 熔火神龛",
  },
  {
    originalText: "3% increased Movement Speed",
    act: "Interludes",
    actName: "间章",
    source: "Qimah - The Seven Pillars",
    sourceCn: "齐玛 - 七柱",
  },
];

const ITEM_TERM_TRANSLATIONS = {
  Charm: "咒符",
  Charms: "咒符",
  Flask: "药剂",
  Flasks: "药剂",
  Rune: "符文",
  Staff: "长杖",
  "Wand or Staff": "魔杖或长杖",
  Wand: "魔杖",
  Armour: "护甲",
  Weapon: "武器",
  Quality: "品质",
  "Stack Size": "堆叠数量",
  "Limited to": "限制",
  Level: "等级",
  Charges: "充能",
  Charge: "充能",
  Guard: "护卫",
  Stunned: "被晕眩",
  Stun: "晕眩",
  Shock: "感电",
  Magnitude: "幅度",
  Archon: "执政官",
  Bonded: "羁绊",
  Lightning: "闪电",
  Fire: "火焰",
  Cold: "冰霜",
  Spell: "法术",
  Skills: "技能",
};

const RUNE_NAME_TRANSLATIONS = {
  "Greater Storm Rune": "高阶风暴符文",
  "Storm Rune": "风暴符文",
  "Hedgewitch Assandra's Rune of Wisdom": "荒篱女巫阿桑德拉的智慧符文",
};

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 检测 Chrome 路径（GitHub Actions 使用 npx puppeteer 自带 Chrome）
let CHROME_PATH = "";
if (fs.existsSync("/opt/chrome/chrome")) {
  CHROME_PATH = "/opt/chrome/chrome";
} else if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 🔧 创建浏览器实例（优化版本）
async function createBrowser(retryCount = 0) {
  const maxRetries = 3;
  
  const launchOptions = {
    headless: true,
    protocolTimeout: 300000, // 5分钟协议超时
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",           // 解决 CI 内存问题
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-first-run",
      "--safebrowsing-disable-auto-update",
      "--ignore-certificate-errors",
      "--ignore-ssl-errors",
      "--ignore-certificate-errors-spki-list",
      // 内存优化
      "--disable-memory-info",
      "--disable-oom-killer",
      // 连接优化
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  };
  
  // 只有明确指定路径时才使用
  if (CHROME_PATH) {
    launchOptions.executablePath = CHROME_PATH;
  }
  
  try {
    console.log(`   🔧 启动浏览器... (重试 ${retryCount}/${maxRetries})`);
    return await puppeteer.launch(launchOptions);
  } catch (err) {
    console.error(`   ❌ 浏览器启动失败: ${err.message}`);
    if (retryCount < maxRetries) {
      await new Promise(r => setTimeout(r, 3000 * (retryCount + 1)));
      return createBrowser(retryCount + 1);
    }
    throw new Error(`浏览器启动失败，已重试 ${maxRetries} 次`);
  }
}

// 🔧 创建页面实例（优化版本）
async function createPage(browser) {
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 720 });  // 降低分辨率节省内存
  await page.setUserAgent(USER_AGENT);
  
  // 请求拦截（减少不必要的请求）
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    const skipTypes = [
      "media", "font", "texttrack", "object", "beacon", 
      "csp_report", "imageset", "websocket", "manifest"
    ];
    if (skipTypes.includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  
  // 错误处理
  page.on("error", (err) => {
    console.warn(`   ⚠️ 页面错误: ${err.message}`);
  });
  
  page.on("close", () => {
    console.log("   📌 页面已关闭");
  });
  
  return page;
}

// 🔧 安全文件名生成函数 - 支持多语言
function generateSafeFileName(text, prefix = "") {
  if (!text) text = "unknown";

  // 简化策略：直接将非安全字符替换为下划线，并添加前缀标识语言类型
  let normalized = text;
  let langPrefix = "";

  // 检测主要语言类型
  if (/[\uac00-\ud7af]/.test(text)) {
    langPrefix = "kr_"; // 韩文
  } else if (/[\u0600-\u06ff]/.test(text)) {
    langPrefix = "ar_"; // 阿拉伯文
  } else if (/[\u0e00-\u0e7f]/.test(text)) {
    langPrefix = "th_"; // 泰文
  } else if (/[\u0400-\u04ff]/.test(text)) {
    langPrefix = "ru_"; // 西里尔文（俄罗斯语）
  } else if (/[\u4e00-\u9fff]/.test(text)) {
    langPrefix = "cn_"; // 中文
  } else if (/[\u0590-\u05ff]/.test(text)) {
    langPrefix = "he_"; // 希伯来文
  } else if (/[\u0900-\u097f]/.test(text)) {
    langPrefix = "hi_"; // 印地文
  } else {
    langPrefix = "en_"; // 英文/其他
  }

  // 创建安全字符串：使用hash + 原始字符的简化版本
  const simpleHash = text
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return c.toLowerCase(); // A-Z
      if (code >= 97 && code <= 122) return c; // a-z
      if (code >= 48 && code <= 57) return c; // 0-9
      return "x"; // 其他字符用x代替
    })
    .join("")
    .substring(0, 10);

  const fullSafe = (langPrefix + simpleHash)
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return prefix + fullSafe;
}

// 🔧 生成唯一文件名（避免重复）
function generateUniqueFileName(account, name, timestamp) {
  const safeAccount = generateSafeFileName(account);
  const safeName = generateSafeFileName(name);

  return `${safeAccount}_${safeName}.json`;
}

// 翻译函数
function translateItemName(itemName, baseType, frameType) {
  if (frameType === 3) {
    // 传奇物品
    const uniqueInfo = dictUnique[itemName];
    let uniqueCn = null;
    
    if (uniqueInfo) {
      uniqueCn = uniqueInfo.cn;
    } else {
      // 如果找不到精确匹配，尝试模糊匹配
      for (const [key, value] of Object.entries(dictUnique)) {
        if (
          key.toLowerCase().includes(itemName.toLowerCase()) ||
          itemName.toLowerCase().includes(key.toLowerCase())
        ) {
          uniqueCn = value.cn;
          break;
        }
      }
    }

    // 翻译基底类型
    let baseCn = null;
    if (baseType) {
      baseCn = dictBase[baseType];
      if (!baseCn) {
        // 尝试模糊匹配基底类型
        for (const [key, value] of Object.entries(dictBase)) {
          if (
            key.toLowerCase().includes(baseType.toLowerCase()) ||
            baseType.toLowerCase().includes(key.toLowerCase())
          ) {
            baseCn = value;
            break;
          }
        }
      }
    }

    // 构建最终翻译：传奇名 + 正确的基底类型
    if (uniqueCn && baseCn) {
      // 检查是否已经包含基底类型信息（避免重复）
      if (!uniqueCn.includes(baseCn) && !baseCn.includes(uniqueCn.split(' ')[0])) {
        return `${uniqueCn}（${baseCn}）`;
      }
      return uniqueCn;
    }
    
    return uniqueCn || itemName;
  } else {
    // 普通物品翻译

    // 1. 尝试精确匹配
    let cnBase = dictBase[baseType] || dictBase[itemName];

    if (!cnBase) {
      // 2. 通过关键词推断物品类型
      const itemTypeMap = {
        Belt: ["腰带", "腰带的"],
        Amulet: ["护身符", "护符"],
        Ring: ["戒指"],
        Boots: ["靴子", "靴"],
        Gloves: ["手套"],
        Charm: ["护符", "符文"],
        Helm: ["头盔", "帽"],
        Chest: ["胸甲", "上衣"],
        Shield: ["盾牌", "盾"],
        Sword: ["剑"],
        Axe: ["斧"],
        Mace: ["锤", "权杖"],
        Bow: ["弓"],
        Staff: ["法杖", "杖"],
        Wand: ["法杖", "魔杖"],
      };

      // 检查itemName中的关键词
      for (const [englishType, chineseTypes] of Object.entries(itemTypeMap)) {
        if (itemName.toLowerCase().includes(englishType.toLowerCase())) {
          // 找到对应的中文翻译
          const baseExamples = Object.keys(dictBase).filter((key) =>
            key.toLowerCase().includes(englishType.toLowerCase())
          );
          if (baseExamples.length > 0) {
            cnBase = dictBase[baseExamples[0]];
            break;
          }
        }
      }

      // 如果还是没找到，尝试特定的物品名称映射
      if (!cnBase) {
        const specialMap = {
          Harness: "腰带",
          Hoof: "靴子",
          Coil: "戒指",
          Touch: "手套",
          Charm: "护符",
          Maelström: "漩涡护符",
        };

        for (const [specialKey, chineseTranslation] of Object.entries(
          specialMap
        )) {
          if (itemName.toLowerCase().includes(specialKey.toLowerCase())) {
            cnBase = chineseTranslation;
            break;
          }
        }
      }
    }

    // 3. 如果还没找到，尝试模糊匹配
    if (!cnBase) {
      for (const [key, value] of Object.entries(dictBase)) {
        if (
          key.toLowerCase().includes(itemName.toLowerCase()) ||
          itemName.toLowerCase().includes(key.toLowerCase()) ||
          (baseType &&
            (key.toLowerCase().includes(baseType.toLowerCase()) ||
              baseType.toLowerCase().includes(key.toLowerCase())))
        ) {
          cnBase = value;
          break;
        }
      }
    }

    if (cnBase) {
      if (itemName && itemName !== cnBase) {
        return `${cnBase}（${itemName}）`;
      }
      return cnBase || itemName;
    }

    // 如果都没找到，返回原始名称
    return itemName;
  }
}
function cleanNinjaText(line) {
  if (!line) return "";
  return String(line)
    .replace(/\[(?:[^\]|]+\|)?([^\]]+)\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function applyTermTranslations(text) {
  let result = text;
  const terms = Object.keys(ITEM_TERM_TRANSLATIONS).sort((a, b) => b.length - a.length);
  terms.forEach((en) => {
    const cn = ITEM_TERM_TRANSLATIONS[en];
    result = result.replace(new RegExp(`\\b${escapeRegExp(en)}\\b`, "g"), cn);
  });
  result = result
    .replace(/闪电\s+法术/g, "闪电法术")
    .replace(/火焰\s+法术/g, "火焰法术")
    .replace(/冰霜\s+法术/g, "冰霜法术")
    .replace(/混沌\s+法术/g, "混沌法术");
  return result;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translateSingleMod(line) {
  let text = cleanNinjaText(line);
  if (!text) return "";

  const exact = {
    Charm: "咒符",
    Flask: "药剂",
    "[Rune|Rune]": "符文",
    Rune: "符文",
    Quality: "品质",
    "Stack Size": "堆叠数量",
    "Limited to": "限制",
  };
  if (exact[text]) return exact[text];

  const customPatterns = [
    { regex: /^Lasts ([\d.]+) Seconds$/i, replace: "持续 $1 秒" },
    { regex: /^Consumes ([\d.]+) of ([\d.]+) Charges on use$/i, replace: "使用时消耗 $1 / $2 充能" },
    { regex: /^Currently has ([\d.]+) Charges$/i, replace: "当前有 $1 充能" },
    { regex: /^Used when you become Stunned$/i, replace: "你被晕眩时自动使用" },
    { regex: /^Cannot be Stunned$/i, replace: "不会被晕眩" },
    { regex: /^Also grants ([\d.]+) Guard$/i, replace: "同时获得 $1 护卫" },
    { regex: /^([\d.]+)% reduced Charges per use$/i, replace: "每次使用消耗的充能降低 $1%" },
    { regex: /^([\d.]+)% increased Charm Charges gained$/i, replace: "咒符获得的充能提高 $1%" },
    { regex: /^\+([\d.]+) Charm Slot$/i, replace: "+$1 咒符栏位" },
    { regex: /^([\d.]+)% increased Life Recovery from Flasks$/i, replace: "药剂的生命回复提高 $1%" },
    { regex: /^([\d.]+)% increased maximum Mana$/i, replace: "最大魔力提高 $1%" },
    { regex: /^([\d.]+)% increased maximum Life$/i, replace: "最大生命提高 $1%" },
    { regex: /^([\d.]+)% increased Movement Speed$/i, replace: "移动速度提高 $1%" },
    { regex: /^\+([\d.]+)% to (Fire|Cold|Lightning|Chaos) Resistance$/i, replace: "+$1% $2抗性" },
    { regex: /^\+([\d.]+) to maximum Life$/i, replace: "+$1 最大生命" },
    { regex: /^\+([\d.]+) to Spirit$/i, replace: "+$1 精魂" },
    { regex: /^([\d.]+)% increased Elemental Ailment Threshold$/i, replace: "元素异常状态阈值提高 $1%" },
    { regex: /^Gain ([\d.]+)% of Damage as Extra (Fire|Cold|Lightning|Chaos|Physical) Damage$/i, replace: "获得相当于伤害 $1% 的额外$2伤害" },
    { regex: /^\+([\d.]+) to Level of all (.+) Skills$/i, replace: "+$1 所有$2技能等级" },
    { regex: /^([\d.]+)% increased Critical Hit Chance for Spells$/i, replace: "法术暴击率提高 $1%" },
    { regex: /^([\d.]+)% increased Cast Speed$/i, replace: "施法速度提高 $1%" },
    { regex: /^([\d.]+)% increased (Fire|Cold|Lightning|Chaos|Physical|Spell) Damage$/i, replace: "$2伤害提高 $1%" },
    { regex: /^Wand or Staff: (.+)$/i, replace: "魔杖或长杖：$1" },
    { regex: /^Bonded: Archon recovery period expires ([\d.]+)% faster$/i, replace: "羁绊：执政官恢复期结束速度加快 $1%" },
    { regex: /^Bonded: ([\d.]+)% increased Magnitude of Shock you inflict$/i, replace: "羁绊：你施加的感电幅度提高 $1%" },
  ];

  for (const pattern of customPatterns) {
    if (pattern.regex.test(text)) {
      return applyTermTranslations(text.replace(pattern.regex, pattern.replace));
    }
  }

  for (const pattern of dictStats.patterns) {
    const regex = new RegExp(pattern.regex, "i");
    if (regex.test(text)) {
      return applyTermTranslations(text.replace(regex, pattern.replace));
    }
  }

  for (const [en, cn] of Object.entries(dictStats.keywords)) {
    if (text.includes(en)) {
      text = text.split(en).join(cn);
    }
  }

  text = text.replace(/When you kill a/, "当你击败");
  text = text.replace(/monster/, "怪物");
  text = text.replace(/you gain its/, "你获得其");
  text = text.replace(/for (\d+) seconds/, "持续 $1 秒");
  text = text.replace(/闪电\s+法术/g, "闪电法术");
  text = text.replace(/火焰\s+法术/g, "火焰法术");
  text = text.replace(/冰霜\s+法术/g, "冰霜法术");
  text = text.replace(/混沌\s+法术/g, "混沌法术");

  return applyTermTranslations(text);
}

// 🔧 词缀翻译核心函数
function translateMods(modList) {
  if (!modList || modList.length === 0) return "";
  return modList.map(translateSingleMod).join("\n");
}

function translateGemName(gemName) {
  if (!gemName) return gemName;
  if (dictGem[gemName]) return dictGem[gemName];
  if (RUNE_NAME_TRANSLATIONS[gemName]) return RUNE_NAME_TRANSLATIONS[gemName];
  return applyTermTranslations(gemName);
}

function translateKeystoneName(keystoneName) {
  return dictPassive[keystoneName]
    ? dictPassive[keystoneName].cn
    : keystoneName;
}

function translateProperty(property) {
  if (!property || !property.name) return '';
  let text = property.name;
  const values = property.values || [];
  values.forEach((value, index) => {
    const replacement = Array.isArray(value) ? value[0] : value;
    text = text.replace(`{${index}}`, replacement);
  });
  return translateMods([text]);
}

function buildItemDesc(itemData) {
  const groups = [
    { key: 'properties', color: '#c8c8c8', type: 'property' },
    { key: 'implicitMods', color: '#8888ff' },
    { key: 'explicitMods', color: '#8888ff' },
    { key: 'runeMods', color: '#0d6efd' },
    { key: 'desecratedMods', color: '#b066ff' },
    { key: 'bondedMods', color: '#0d6efd' },
    { key: 'craftedMods', color: '#af6025' },
    { key: 'enchantMods', color: '#af6025' },
    { key: 'utilityMods', color: '#71c17b' },
  ];

  const lines = [];
  groups.forEach(group => {
    const values = itemData[group.key] || [];
    values.forEach(value => {
      const text = group.type === 'property' ? translateProperty(value) : translateMods([value]);
      if (text) lines.push(`<span style="color:${group.color}">${text}</span><br/>`);
    });
  });

  if (itemData.corrupted) {
    lines.push(`<span style="color:#e22626">已腐化</span>`);
  }
  if (itemData.fractured) {
    lines.push(`<span style="color:#e22626">已破裂</span>`);
  }
  if (itemData.desecrated) {
    lines.push(`<span style="color:#b066ff">已亵渎</span>`);
  }

  return lines.join('\n');
}

function getDisplayItemName(itemData) {
  const originalName = itemData.name || itemData.typeLine || itemData.baseType || 'Unknown Item';
  const translatedName = translateItemName(
    itemData.name || itemData.typeLine || itemData.baseType,
    itemData.baseType,
    itemData.frameType
  );
  return {
    originalName,
    translatedName,
  };
}

function normalizeSocketedItems(itemData) {
  return (itemData.socketedItems || []).map((gem) => {
    const gemName = gem.name || gem.typeLine || gem.baseType || "未知宝石";
    return {
      name: translateGemName(gemName),
      originalName: gemName,
      icon: gem.icon,
      isSupport: !!gem.support,
    };
  });
}

function normalizeCharacterItem(item) {
  const i = item.itemData || item;
  const names = getDisplayItemName(i);

  return {
    slot: item.inventoryId || i.inventoryId || item.itemSlot || '',
    itemSlot: item.itemSlot,
    name: names.translatedName,
    originalName: names.originalName,
    baseType: i.baseType || "",
    typeLine: i.typeLine || "",
    icon: i.icon,
    rarity: i.frameType,
    itemLevel: i.ilvl || 0,
    desc: buildItemDesc(i),
    gems: normalizeSocketedItems(i),
  };
}

function normalizeQuestStats(stats) {
  const usedByText = {};
  return (stats || []).map(stat => {
    const currentIndex = usedByText[stat] || 0;
    const candidates = QUEST_REWARD_CATALOG.filter(item => item.originalText === stat);
    const meta = candidates[currentIndex] || candidates[0] || {};
    const metaIndex = meta.originalText ? QUEST_REWARD_CATALOG.indexOf(meta) : 999;
    usedByText[stat] = currentIndex + 1;
    return {
      act: meta.act || "Other",
      actName: meta.actName || "其他",
      source: meta.source || "",
      sourceCn: meta.sourceCn || "",
      order: metaIndex,
      text: translateMods([stat]),
      originalText: stat,
    };
  });
}

function normalizeDefensiveStats(stats) {
  return stats || {};
}

function normalizePassiveCounts(counts) {
  return counts || {};
}

// 生成 community.json（热门BD推荐）
async function generateCommunityJSON(allLadders, classList) {
  console.log("\n📝 生成 community.json...");

  const communityBuilds = [];
  const classNameMap = {};
  classList.forEach(cls => {
    classNameMap[cls.name] = cls.name;
  });

  // PoE2 职业中文映射
  const classCNMap = {
    'Blood Mage': '血法师',
    'Infernalist': '狱咒师',
    'Deadeye': '死亡射手',
    'Champion': '冠军',
    'Slayer': '杀手',
    'Inquisitor': '审判者',
    'Witch': '女巫',
    'Templar': '圣殿骑士',
    'Marauder': '野蛮人',
    'Shadow': '暗影',
    'Ranger': '游侠',
    'Scion': '贵族',
    'Druid': '德鲁伊',
    'Oracle': '神谕者',
    'Pathfinder': '漫游者',
    'Shaman': '萨满',
    'Warrior': '战士',
    'Chronomancer': '时空法师',
    'Gemling': '宝石骑士',
    'Summoner': '召唤师'
  };

  // 从天梯数据中提取热门BD
  for (const clsName in allLadders) {
    const players = allLadders[clsName];
    const topPlayer = players[0]; // 取每个职业第一名

    if (!topPlayer || !topPlayer.detail) continue;

    const detail = topPlayer.detail;
    const mainSkill = detail.skills?.[0]?.links?.[0];
    const mainSkillName = mainSkill?.originalName || mainSkill?.name || '';
    const supportSkills = detail.skills?.[0]?.links?.slice(1, 5).map(s => s.name || s.originalName || '') || [];

    // 获取职业中文名
    const classCN = classCNMap[clsName] || clsName;

    // 提取标签
    const tags = [mainSkillName];
    if (supportSkills.length > 0) tags.push('辅助');
    tags.push('天梯BD');

    // 构建BD对象
    const build = {
      id: `PoE2_${clsName.replace(/\s+/g, '_')}_Top${topPlayer.rank}`,
      meta: {
        title: `${classCN}${mainSkillName}流派`,
        author: topPlayer.account || '天梯玩家',
        class: clsName,
        name: classCN,
        tags: tags
      },
      intro: {
        desc: `${classCN}职业天梯排名第${topPlayer.rank}玩家的BD配置，主打${mainSkillName}。`,
        pros: [
          `${mainSkillName}输出强力`,
          `天梯验证强度可靠`,
          `适合追求强度的玩家`
        ],
        cons: [
          `造价可能较高`,
          `需要一定操作技巧`
        ]
      },
      skills: detail.skills || [],
      keystones: detail.keystones || [],
      equipment: {
        mainSkill: mainSkillName,
        supports: supportSkills,
        notes: '数据来源于poe.ninja天梯'
      },
      // 保留原始数据引用
      source: {
        rank: topPlayer.rank,
        account: topPlayer.account,
        level: topPlayer.level,
        ladderLink: topPlayer.link || ''
      }
    };

    communityBuilds.push(build);
  }

  // 如果没有足够数据，保留一条示例
  if (communityBuilds.length === 0) {
    communityBuilds.push({
      id: 'PoE2_Example',
      meta: {
        title: '示例BD',
        author: '系统',
        class: 'Druid',
        name: '德鲁伊',
        tags: ['旋风击', '天梯BD']
      },
      intro: {
        desc: '暂无数据，请等待下次更新',
        pros: ['等待数据抓取'],
        cons: ['暂无']
      },
      skills: [],
      keystones: [],
      equipment: { mainSkill: '-', supports: [], notes: '' },
      source: { rank: 0, account: '', level: 0, ladderLink: '' }
    });
  }

  return communityBuilds;
}

// 保存 community.json 到 miniprogram_data 目录
function saveCommunityJSON(communityData, outputDir) {
  const miniprogramDir = path.join(outputDir, 'miniprogram_data');
  if (!fs.existsSync(miniprogramDir)) {
    fs.mkdirSync(miniprogramDir, { recursive: true });
  }

  const communityPath = path.join(miniprogramDir, 'community.json');
  fs.writeFileSync(communityPath, JSON.stringify(communityData, null, 2));
  console.log(`   ✅ community.json 已保存 (${communityData.length} 条BD)`);
  return communityPath;
}

// 🔧 安全的页面关闭函数
async function safeClosePage(page) {
  if (!page || page.isClosed()) return;
  try {
    await page.close();
  } catch (e) {
    // 忽略关闭错误
  }
}

// ========== 新 API 辅助函数 ==========

async function getBuildId(leagueUrl = 'vaal') {
  return new Promise((resolve, reject) => {
    const url = 'https://poe.ninja/poe2/api/data/index-state';
    https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://poe.ninja/poe2/builds',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const sv = json.snapshotVersions?.find(s => s.url === leagueUrl);
          if (sv) {
            console.log(`   📌 Build ID: ${sv.version} (${sv.snapshotName})`);
            resolve({ buildId: sv.version, overview: sv.snapshotName });
          } else {
            reject(new Error(`lease ${leagueUrl} not found in index-state`));
          }
        } catch (e) {
          reject(new Error(`Index-state parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchCharacterData(buildId, account, name, overview) {
  return new Promise((resolve, reject) => {
    const params = `account=${encodeURIComponent(account)}&name=${encodeURIComponent(name)}&overview=${overview}&timeMachine=`;
    const url = `https://poe.ninja/poe2/api/builds/${buildId}/character?${params}`;
    https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': `https://poe.ninja/poe2/builds/vaal/character/${encodeURIComponent(account)}/${encodeURIComponent(name)}`,
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Character API parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function runTask() {
  console.log(`🚀 启动翻译爬虫 | 深度: ${MAX_RANK}`);
  console.log(`   输出目录: ${OUTPUT_DIR}`);
  console.log(`   CI 环境: ${isCI}`);
  console.log(`   浏览器重启间隔: 每 ${BROWSER_RESTART_INTERVAL} 个职业`);

  let browser = null;
  let page = null;
  let classProcessedCount = 0;  // 记录已处理的职业数
  let buildId, overview;  // poe.ninja build ID
  
  // 全局错误处理标志
  let shouldStop = false;

  try {
    // 阶段 0: 获取 Build ID（纯 HTTP，不需要浏览器）
    console.log("\n0️⃣  获取 Build ID...");
    ({ buildId, overview } = await getBuildId('vaal'));

    // 阶段 1: 创建浏览器并获取职业列表
    browser = await createBrowser();
    page = await createPage(browser);
    
    console.log("\n1️⃣  获取职业列表...");
    await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    try {
      await page.waitForFunction(
        () => document.body.innerText.includes("FATE OF THE VAAL"),
        { timeout: 30000 }
      );
    } catch (e) {}

    const classList = await page.evaluate(() => {
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

    console.log(`   ✅ 发现 ${classList.length} 个职业`);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "classes.json"),
      JSON.stringify(classList, null, 2)
    );

    // 阶段 2: 遍历职业 -> 抓取详情并翻译
    console.log("\n2️⃣  抓取并翻译玩家数据...");
    const allLadders = {};

    for (const cls of classList) {
      console.log(`\n2️⃣  处理职业: ${cls.name}`);

      try {
        await page.goto(cls.link, {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        });
        await page.waitForFunction(
          () => {
            const rows = document.querySelectorAll("tbody tr");
            return rows.length > 0 && rows[0].querySelector("a");
          },
          { timeout: 15000 }
        );
      } catch (e) {
        console.warn(`   ⚠️ [${cls.name}] 等待列表超时，尝试强行抓取`);
      }

      let players = [];
      try {
        players = await page.evaluate((limit) => {
        const rows = Array.from(document.querySelectorAll("tbody tr"));
        const validRows = rows.filter((r) =>
          r.querySelector("td:nth-child(1) a")
        );
        return validRows
          .slice(0, limit)
          .map((row, i) => {
            const a = row.querySelector("td:nth-child(1) a");
            if (!a) return null;
            const imgs = Array.from(row.querySelectorAll("img"));
            let skillIcon = "";
            if (imgs.length > 0) skillIcon = imgs[imgs.length - 1].src;

            // 解析账号名
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
              level: parseInt(
                row.querySelector("td:nth-child(2)")?.innerText || 0
              ),
              mainSkillIcon: skillIcon,
            };
          })
          .filter((p) => p !== null);
      }, MAX_RANK);
      } catch (e) {
        console.warn(`   ⚠️ [${cls.name}] 提取玩家列表失败: ${e.message}`);
        continue;
      }

      console.log(`   📋 解析 ${players.length} 名玩家...`);
      const detailedPlayers = [];

      for (let i = 0; i < players.length; i++) {
        const player = players[i];

        let capturedData = null;

        try {
          // v3.1 新方案：直接调用 HTTP API 获取角色数据（比 Puppeteer 快 10 倍+）
          capturedData = await fetchCharacterData(buildId, player.account, player.name, overview);
          if (!capturedData) throw new Error("Character API 返回空数据");

          // 导航到角色页面（仅用于天赋树截图，数据已通过 API 获取）
          try {
            await page.goto(player.link, {
              waitUntil: "domcontentloaded",
              timeout: 60000,
            });
            await page.waitForSelector('[data-tooltip-canvas="true"] canvas, svg', { timeout: 15000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));
          } catch (e) {
            console.warn("   ⚠️ 天赋树页面加载超时，跳过截图");
          }

          // 截图天赋 - 方案1: 用 Puppeteer page.screenshot 截取天赋树区域 (兼容 WebGL)
          // 🔧 修复：必须使用绝对坐标（相对坐标 + 滚动位置）
          let treeImgBase64 = null;

          // 获取天赋树区域坐标（使用绝对坐标）
          const treeRect = await page.evaluate(() => {
            const tooltipCanvas = document.querySelector('[data-tooltip-canvas="true"]');
            if (!tooltipCanvas) return null;

            const rect = tooltipCanvas.getBoundingClientRect();
            if (!rect || rect.width < 100 || rect.height < 100) return null;

            const canvasEl = tooltipCanvas.querySelector('canvas');
            let canvasType = 'unknown';
            if (canvasEl) {
              if (canvasEl.getContext('webgl2') || canvasEl.getContext('webgl')) canvasType = 'webgl';
              else if (canvasEl.getContext('2d')) canvasType = '2d';
            }

            // 使用绝对坐标：相对位置 + 滚动偏移
            return {
              x: Math.round(rect.x + window.scrollX),
              y: Math.round(rect.y + window.scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              canvasType,
              // 调试信息
              relX: Math.round(rect.x),
              relY: Math.round(rect.y),
              scrollX: window.scrollX,
              scrollY: window.scrollY
            };
          });

          if (treeRect && treeRect.width > 0) {
            try {
              // 确保页面滚动到正确位置
              await page.evaluate(() => window.scrollTo(0, 0));
              await new Promise(r => setTimeout(r, 500));

              const imgBuffer = await page.screenshot({
                type: 'jpeg',
                quality: 80,
                clip: {
                  x: treeRect.x,
                  y: treeRect.y,
                  width: Math.min(treeRect.width, 1200),
                  height: Math.min(treeRect.height, 1200)
                },
              });
              treeImgBase64 = `data:image/jpeg;base64,${Buffer.from(imgBuffer).toString('base64')}`;
              console.log(`天赋树截图成功: ${treeImgBase64.length} 字符 (${treeRect.canvasType})`);
            } catch (e) {
              console.warn('page.screenshot 失败:', e.message);
            }
          } else {
            console.warn('未找到天赋树区域，跳过截图');
          }

          // 数据清洗 + 翻译
          const detailData = {
            info: {
              name: capturedData.name,
              class: capturedData.class,
              level: capturedData.level,
              account: capturedData.account,
              league: capturedData.league,
            },
            defensiveStats: normalizeDefensiveStats(capturedData.defensiveStats),
            questStats: normalizeQuestStats(capturedData.questStats),
            passiveCounts: normalizePassiveCounts(capturedData.passiveCounts),
            pathOfBuildingExport: capturedData.pathOfBuildingExport || '',
            flasks: (capturedData.flasks || []).map(normalizeCharacterItem),
            jewels: (capturedData.jewels || []).map(normalizeCharacterItem),
            equipment: (capturedData.items || []).map(normalizeCharacterItem),
            skills: (capturedData.skills || []).map((s) => ({
              gems: (s.allGems || []).map((g) => {
                const originalName = g.name;
                const translatedName = translateGemName(g.name);

                return {
                  name: translatedName,
                  originalName: originalName, // 保留原英文名
                  icon: g.itemData.icon,
                  isSupport: g.itemData.support,
                };
              }),
            })),
            // 🔧 修复 keystones 获取逻辑：优先从 API 获取，如果为空则从页面 DOM 提取
            // 🔧 修复 icon 路径：提取相对路径，避免小程序拼接出双重 URL
            keystones: (() => {
              const apiKeystones = capturedData.keystones || [];
              if (apiKeystones.length > 0) {
                return apiKeystones.map((keystone) => {
                  // 提取相对路径
                  let iconPath = keystone.icon || '';
                  if (iconPath) {
                    const match = iconPath.match(/\/passives\/([^?]+\.png|\/[^?]+\.webp)/i);
                    if (match) {
                      iconPath = `passives/${match[1]}`;
                    } else if (iconPath.startsWith('http')) {
                      // 如果是完整 URL，尝试提取末尾路径
                      const urlMatch = iconPath.match(/\/([^/]+\.(png|webp))$/i);
                      if (urlMatch) {
                        iconPath = urlMatch[1];
                      }
                    }
                  }
                  return {
                    name: translateKeystoneName(keystone.name),
                    originalName: keystone.name,
                    icon: iconPath,
                  };
                });
              }

              // 兜底：从页面提取 keystones 图标
              try {
                const domKeystones = page.evaluate(() => {
                  // 查找天赋树区域内的所有图片
                  const tooltipCanvas = document.querySelector('[data-tooltip-canvas="true"]');
                  if (!tooltipCanvas) return [];

                  const imgs = tooltipCanvas.querySelectorAll('img');
                  const keystones = [];

                  imgs.forEach(img => {
                    const src = img.src || '';
                    // 匹配 keystone 图标 URL
                    if (src.includes('/keystone') || src.includes('/Keystone')) {
                      // 提取相对路径
                      const match = src.match(/\/passives\/([^?]+\.png|\/[^?]+\.webp)/i);
                      if (match) {
                        const iconPath = `passives/${match[1]}`;
                        // 从 tooltip 或 alt 获取名称
                        const altText = img.alt || img.getAttribute('data-tooltip') || '';
                        const name = altText.replace(/<[^>]*>/g, '').trim() || iconPath;
                        keystones.push({ name, icon: iconPath });
                      }
                    }
                  });

                  return keystones;
                });
                return domKeystones || [];
              } catch (e) {
                console.warn('DOM 提取 keystones 失败:', e.message);
                return [];
              }
            })(),
            passiveTreeImage: treeImgBase64,
          };

          player.detail = detailData;
          if (!player.account && capturedData.account)
            player.account = capturedData.account;

          detailedPlayers.push(player);
          console.log(`      ✅ 成功 ${player.name}`);
        } catch (err) {
          console.error(`      ❌ 失败: ${err.message}`);
        } finally {
          // v3.1: 不再需要移除 responseListener（未使用 Puppeteer API 拦截）
        }

        await new Promise((r) => setTimeout(r, 500));
      }
      allLadders[cls.name] = detailedPlayers;
      
      // 🔧 定期重启浏览器（防止内存泄漏和协议错误）
      classProcessedCount++;
      if (classProcessedCount >= BROWSER_RESTART_INTERVAL && classProcessedCount < classList.length) {
        console.log(`   🔄 定期重启浏览器 (已处理 ${classProcessedCount} 个职业)...`);
        await safeClosePage(page);
        try {
          await browser.close();
        } catch (e) {}
        
        // 等待 GC
        await new Promise(r => setTimeout(r, 2000));
        
        // 重新创建浏览器和页面
        browser = await createBrowser();
        page = await createPage(browser);
        
        // 重新访问基础页面（保持会话）
        try {
          await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
        } catch (e) {
          console.warn(`   ⚠️ 重新访问基础页面失败: ${e.message}`);
        }
      }
    }

    // 阶段 3: 保存翻译后的数据
    console.log("\n3️⃣ 保存翻译数据...");
    const PLAYER_DATA_DIR = path.join(OUTPUT_DIR, "players");
    // 如果有翻译数据，则删除旧的翻译数据
    if (fs.existsSync(PLAYER_DATA_DIR)) {
      fs.rmSync(PLAYER_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(PLAYER_DATA_DIR, { recursive: true });

    const lightLadders = {};

    for (const clsName in allLadders) {
      lightLadders[clsName] = allLadders[clsName].map((p) => {
        const accountVal = p.account || "unknown";
        const nameVal = p.name || "unknown";

        // 🔧 修复非拉丁字符文件名问题
        // 使用改进的文件名生成策略
        const timestamp = Date.now();
        const detailFileName = generateUniqueFileName(
          accountVal,
          nameVal,
          timestamp
        );

        if (p.detail) {
          // 优化: 将 passiveTreeImage (base64, ~100KB) 拆成独立 .jpg 文件
          // JSON 中替换为 passiveTreeImageUrl 引用，减少 JSON 体积 80%+
          if (p.detail.passiveTreeImage && p.detail.passiveTreeImage.startsWith('data:image/')) {
            const base64Data = p.detail.passiveTreeImage.split(',')[1];
            if (base64Data) {
              const imgBuffer = Buffer.from(base64Data, 'base64');
              const imgFileName = detailFileName.replace('.json', '_tree.jpg');
              fs.writeFileSync(path.join(PLAYER_DATA_DIR, imgFileName), imgBuffer);
              // 存 OSS 路径（相对路径，前端拼接 OSS 域名）
              p.detail.passiveTreeImageUrl = `players/${imgFileName}`;
              delete p.detail.passiveTreeImage;
            }
          }
          fs.writeFileSync(
            path.join(PLAYER_DATA_DIR, detailFileName),
            JSON.stringify(p.detail, null, 2)
          );
        }

        return {
          rank: p.rank,
          name: p.name,
          level: p.level,
          account: p.account,
          originalAccount: accountVal, // 保留原始account用于展示
          mainSkillIcon: p.mainSkillIcon,
          detailPath: `players/${detailFileName}`,
          fileName: detailFileName, // 添加文件名字段便于查找
        };
      });
    }

    // 保存主索引文件
    const lightData = {
      updateTime: new Date().toISOString(),
      classes: classList,
      ladders: lightLadders,
      translationInfo: {
        baseItemsCount: Object.keys(dictBase).length,
        uniqueItemsCount: Object.keys(dictUnique).length,
        gemsCount: Object.keys(dictGem).length,
        translatedAt: new Date().toISOString(),
      },
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "all_ladders_translated.json"),
      JSON.stringify(lightData, null, 2)
    );

    // 生成并保存 community.json（热门BD推荐）
    const communityData = await generateCommunityJSON(allLadders, classList);
    saveCommunityJSON(communityData, OUTPUT_DIR);

    console.log("\n✅ 翻译数据抓取完成！");
    console.log(`📁 输出目录: ${OUTPUT_DIR}`);
    console.log(
      `📊 翻译统计: ${Object.keys(dictBase).length} 基础物品, ${
        Object.keys(dictUnique).length
      } 传奇物品, ${Object.keys(dictGem).length} 技能宝石`
    );
    console.log(`🔄 共处理 ${classProcessedCount} 个职业，重启浏览器 ${Math.floor(classProcessedCount / BROWSER_RESTART_INTERVAL)} 次`);
  } catch (e) {
    console.error("❌ 任务崩溃:", e.message);
    // 保存已抓取的数据（如果有任何数据）
    if (typeof allLadders !== 'undefined' && Object.keys(allLadders).length > 0) {
      console.log("💾 保存已抓取的数据...");
      // ... 保存逻辑
    }
    throw e;
  } finally {
    // 🔧 安全关闭页面和浏览器
    await safeClosePage(page);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn("浏览器关闭时出错:", e.message);
      }
    }
  }
}

// 本地测试入口
if (require.main === module) {
  runTask();
}

module.exports = { runTask };
