const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
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
  console.log("✅ 翻译字典加载成功");
} catch (e) {
  console.error("❌ 翻译字典加载失败", e);
}

// 配置
const BASE_URL = "https://poe.ninja/poe2/builds";

const isDev = process.env.NODE_ENV === "dev";
// 根据环境设置抓取深度：dev=1个，production=10个
const MAX_RANK = isDev ? 1 : 10;
// 根据环境变量，dev

const OUTPUT_DIR = isDev
  ? path.join(__dirname, "../translated-data/dev")
  : path.join(__dirname, "../translated-data/release");

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 浏览器配置
const CHROME_PATH = fs.existsSync("/opt/chrome/chrome")
  ? "/opt/chrome/chrome"
  : ""; // 让 puppeteer 自动选择 Chrome

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
      // 构建最终翻译：物品前缀 + 基础类型
      const prefix = itemName.split(" ")[0]; // 取第一个词作为前缀
      if (prefix && cnBase && !cnBase.includes(prefix)) {
        // 如果有前缀且前缀不在翻译中，添加前缀
        return `${itemName} (${cnBase})`;
      }
      return cnBase || itemName;
    }

    // 如果都没找到，返回原始名称
    return itemName;
  }
}
// 🔧 词缀翻译核心函数
function translateMods(modList) {
  if (!modList || modList.length === 0) return "";

  const translatedLines = modList.map((line) => {
    // 1. 清理 Ninja 的特殊格式
    // 例如: "20% increased [EnergyShield|Energy Shield]" -> "20% increased Energy Shield"
    let text = line.replace(/\[.*?\|(.*?)\]/g, "$1");

    // 2. 关键词替换 (Keywords)
    // 遍历字典中的关键词，将英文单词替换为中文
    // 注意：这里只是替换名词，句子结构还没变
    for (const [en, cn] of Object.entries(dictStats.keywords)) {
      // 使用正则全局替换，注意转义特殊字符
      // 单词边界保护 \b 防止部分匹配 (例如 'Life' 匹配到 'Life Regeneration')
      // 但对于复合词，我们直接替换即可
      if (text.includes(en)) {
        text = text.split(en).join(cn);
      }
    }

    // 3. 句式模版替换 (Patterns)
    // 例如: "42% increased 能量护盾" -> "能量护盾提高 42%"
    for (const pattern of dictStats.patterns) {
      const regex = new RegExp(pattern.regex, "i"); // 'i' 忽略大小写
      if (regex.test(text)) {
        text = text.replace(regex, pattern.replace);
        break; // 匹配到一个模式通常就可以了，跳出循环
      }
    }

    // 4. 处理一些未能完全匹配但包含中文的句子，优化可读性
    // 比如 "When you kill a 稀有 monster..." -> 简单的补丁
    text = text.replace(/When you kill a/, "当你击败");
    text = text.replace(/monster/, "怪物");
    text = text.replace(/you gain its/, "你获得其");
    text = text.replace(/for (\d+) seconds/, "持续 $1 秒");

    return text;
  });

  return translatedLines.join("\n");
}

function translateGemName(gemName) {
  return dictGem[gemName] || gemName;
}

function translateKeystoneName(keystoneName) {
  return dictPassive[keystoneName]
    ? dictPassive[keystoneName].cn
    : keystoneName;
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

async function runTask() {
  console.log(`🚀 启动翻译爬虫 | 深度: ${MAX_RANK}`);
  console.log(`   输出目录: ${OUTPUT_DIR}`);
  console.log(`   Chrome: ${CHROME_PATH}`);

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300000, // 5分钟超时
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(USER_AGENT);

  // 请求拦截
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    if (
      [
        "media",
        "font",
        "texttrack",
        "object",
        "beacon",
        "csp_report",
        "imageset",
      ].includes(resourceType)
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    // 阶段 1: 抓取职业列表
    console.log("1️⃣  获取职业列表...");
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

      const players = await page.evaluate((limit) => {
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

      console.log(`   📋 解析 ${players.length} 名玩家...`);
      const detailedPlayers = [];

      for (let i = 0; i < players.length; i++) {
        const player = players[i];

        let capturedData = null;
        const responseListener = async (response) => {
          if (capturedData) return;
          const url = response.url();
          // 宽松匹配 API
          if (
            url.includes("/api/builds/") &&
            url.includes("/character") &&
            response.request().method() !== "OPTIONS"
          ) {
            try {
              const json = await response.json();
              if (json && (json.items || json.character)) capturedData = json;
            } catch (err) {}
          }
        };
        page.on("response", responseListener);

        try {
          await page.goto(player.link, {
            waitUntil: "domcontentloaded",
            timeout: 120000,
          });

          // 等待天赋树渲染 (PoE2 用 Canvas，PoE1 用 SVG)
          try {
            await page.waitForSelector('[data-tooltip-canvas="true"] canvas, svg', { timeout: 15000 });
            // 额外等待确保 Canvas 渲染完成
            await new Promise(r => setTimeout(r, 3000));
          } catch (e) {
            console.warn("等待天赋树超时，继续尝试...");
          }
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight)
          );
          await new Promise((r) => setTimeout(r, 2000)); // 等动画

          // 等待数据截获
          let attempts = 0;
          while (!capturedData && attempts < 10) {
            await new Promise((r) => setTimeout(r, 200));
            attempts++;
          }

          // 兜底：从页面提取
          if (!capturedData) {
            capturedData = await page.evaluate(() => {
              try {
                return JSON.parse(
                  document.getElementById("__NEXT_DATA__").innerText
                ).props?.pageProps?.character;
              } catch (e) {
                return null;
              }
            });
          }

          if (!capturedData) throw new Error("数据提取失败");

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
            equipment: (capturedData.items || []).map((item) => {
              const i = item.itemData || item;
              const originalName = i.name || i.baseType;
              const translatedName = translateItemName(
                i.name,
                i.baseType,
                i.frameType
              );
              // --- 🔴 新增：处理词缀 ---
              // 分别处理不同类型的词缀，保持颜色标记
              const translatedMods = {
                implicit: [],   // 基底词缀 - #8888ff
                explicit: [],   // 显式词缀 - #8888ff
                rune: [],       // 符文词缀 - #0d6efd
                enchant: [],    // 附魔词缀 - #af6025
                corrupted: false // 腐化状态 - #e22626
              };

              // 1. 基底词缀 (Implicit)
              if (i.implicitMods) {
                translatedMods.implicit = i.implicitMods.map(m => 
                  `<span style="color:#8888ff">${translateMods([m])}</span><br/>`
                );
              }

              // 2. 显式词缀 (Explicit)
              if (i.explicitMods) {
                translatedMods.explicit = i.explicitMods.map(m => 
                  `<span style="color:#8888ff">${translateMods([m])}</span><br/>`
                );
              }

              // 3. 符文词缀 (Runes)
              if (i.runeMods) {
                translatedMods.rune = i.runeMods.map(m => 
                  `<span style="color:#0d6efd">${translateMods([m])}</span><br/>`
                );
              }

              // 4. 附魔词缀 (Enchants)
              if (i.enchantMods) {
                translatedMods.enchant = i.enchantMods.map(m => 
                  `<span style="color:#af6025">${translateMods([m])}</span><br/>`
                );
              }

              // 5. 腐化状态
              if (i.corrupted) {
                translatedMods.corrupted = true;
              }

              // 组合所有词缀描述
              const descLines = [];
              if (translatedMods.implicit.length > 0) {
                descLines.push(...translatedMods.implicit);
              }
              if (translatedMods.explicit.length > 0) {
                descLines.push(...translatedMods.explicit);
              }
              if (translatedMods.rune.length > 0) {
                descLines.push(...translatedMods.rune);
              }
              if (translatedMods.enchant.length > 0) {
                descLines.push(...translatedMods.enchant);
              }
              if (translatedMods.corrupted) {
                descLines.push(`<span style="color:#e22626">已腐化</span>`);
              }

              const translatedDesc = descLines.join('\n');

              // --- 🔴 新增：处理镶嵌宝石 ---
              const socketedGems = (i.socketedItems || []).map((gem) => {
                const gemName = gem.name || gem.typeLine || "未知宝石";
                return {
                  name: translateGemName(gemName),
                  originalName: gemName,
                  icon: gem.icon,
                  isSupport: gem.support,
                };
              });

              return {
                slot: item.inventoryId,
                name: translatedName,
                originalName: originalName, // 保留原英文名
                baseType: i.baseType || "", // 保存baseType用于翻译调试
                icon: i.icon,
                rarity: i.frameType,
                desc: translatedDesc, // 使用翻译后的文本
                gems: socketedGems, // 添加镶嵌宝石
              };
            }),
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
          page.off("response", responseListener);
        }

        await new Promise((r) => setTimeout(r, 500));
      }
      allLadders[cls.name] = detailedPlayers;
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
  } catch (e) {
    console.error("❌ 任务崩溃:", e);
    throw e;
  } finally {
    await browser.close();
  }
}

// 本地测试入口
if (require.main === module) {
  runTask();
}

module.exports = { runTask };
