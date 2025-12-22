const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

// 加载翻译字典
let dictBase = {},
  dictUnique = {},
  dictGem = {},
  dictStats = { keywords: {}, patterns: [] }; // 新增 dictStats;

// FC 环境初始化
async function initializeTranslationDicts() {
  try {
    const baseDataDir = path.join(__dirname, "base-data/dist");

    if (!fs.existsSync(baseDataDir)) {
      throw new Error("base-data/dist 目录不存在");
    }

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
    return true;
  } catch (e) {
    console.error("❌ 翻译字典加载失败:", e.message);
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
      if (
        key.toLowerCase().includes(itemName.toLowerCase()) ||
        itemName.toLowerCase().includes(key.toLowerCase())
      ) {
        return value.cn;
      }
    }

    return itemName;
  } else {
    let cnBase = dictBase[baseType] || dictBase[itemName];

    if (!cnBase) {
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

      for (const [englishType, chineseTypes] of Object.entries(itemTypeMap)) {
        if (itemName.toLowerCase().includes(englishType.toLowerCase())) {
          const baseExamples = Object.keys(dictBase).filter((key) =>
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
      const prefix = itemName.split(" ")[0];
      if (prefix && cnBase && !cnBase.includes(prefix)) {
        return `${itemName} (${cnBase})`;
      }
      return cnBase || itemName;
    }

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

// FC 主函数入口
exports.handler = async (event, context) => {
  console.log("🚀 阿里云FC翻译爬虫启动");

  // 初始化翻译字典
  const dictsInitialized = await initializeTranslationDicts();
  if (!dictsInitialized) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "翻译字典初始化失败" }),
    };
  }

  const config = {
    BASE_URL: "https://poe.ninja/poe2/builds",
    MAX_RANK: process.env.MAX_RANK ? parseInt(process.env.MAX_RANK) : 5,
    CHROME_PATH: process.env.CHROME_PATH || "",
    USER_AGENT:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    OUTPUT_DIR: "/tmp/translated-data", // FC 临时目录
  };

  let browser;
  try {
    // 启动浏览器 - FC环境需要特殊配置
    browser = await puppeteer.launch({
      headless: true,
      executablePath: config.CHROME_PATH || "/opt/chrome/chrome",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--single-process",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-default-apps",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });

    const result = await runTranslationTask(browser, config);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("❌ 任务执行失败:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

// 翻译任务核心逻辑
async function runTranslationTask(browser, config) {
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
    // 阶段 1: 获取职业列表
    console.log("1️⃣ 获取职业列表...");
    await page.goto(config.BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

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

    // 阶段 2: 抓取玩家数据
    console.log("\n2️⃣ 抓取并翻译玩家数据...");
    const allLadders = {};

    for (const cls of classList) {
      console.log(`\n2️⃣ 处理职业: ${cls.name}`);

      try {
        await page.goto(cls.link, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
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

    return {
      success: true,
      message: "翻译数据抓取完成",
      data: {
        classes: classList.length,
        totalPlayers: Object.values(allLadders).reduce(
          (sum, players) => sum + players.length,
          0
        ),
        translationStats: result.translationStats,
        outputPath: OUTPUT_DIR,
      },
    };
  } finally {
    await page.close();
  }
}

// 捕获玩家详细信息
async function capturePlayerDetail(page, player) {
  let capturedData = null;

  const responseListener = async (response) => {
    if (capturedData) return;
    const url = response.url();
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
      timeout: 60000,
    });

    try {
      await page.waitForSelector("svg.bg-transparent", { timeout: 8000 });
    } catch (e) {}

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 2000));

    let attempts = 0;
    while (!capturedData && attempts < 10) {
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }

    if (!capturedData) {
      capturedData = await page.evaluate(() => {
        try {
          return JSON.parse(document.getElementById("__NEXT_DATA__").innerText)
            .props?.pageProps?.character;
        } catch (e) {
          return null;
        }
      });
    }

    if (!capturedData) return null;

    // 数据翻译
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
        // 合并所有词缀类型
        let allMods = [];

        // 1. 附魔 (Enchants)
        if (i.enchantMods)
          allMods.push(...i.enchantMods.map((m) => `(附魔) ${m}`));
        // 2. 符文 (Runes)
        if (i.runeMods) allMods.push(...i.runeMods.map((m) => `(符文) ${m}`));
        // 3. 基底 (Implicit)
        if (i.implicitMods)
          allMods.push(...i.implicitMods.map((m) => `(基底) ${m}`));
        // 4. 显式 (Explicit)
        if (i.explicitMods) allMods.push(...i.explicitMods);
        // 5. 腐化状态
        if (i.corrupted) allMods.push("(已腐化)");
        // 调用翻译函数
        const translatedDesc = translateMods(allMods);
        return {
          slot: item.inventoryId,
          name: translatedName,
          originalName: originalName,
          baseType: i.baseType || "",
          icon: i.icon,
          rarity: i.frameType,
          desc: translatedDesc, // 使用翻译后的文本
        };
      }),
      skills: (capturedData.skills || []).map((s) => ({
        gems: (s.allGems || []).map((g) => {
          const originalName = g.name;
          const translatedName = translateGemName(g.name);

          return {
            name: translatedName,
            originalName: originalName,
            icon: g.itemData?.icon,
            isSupport: g.itemData?.support,
          };
        }),
      })),
      keystones: (capturedData.keystones || []).map((keystone) => ({
        name: keystone.name, // 暂不翻译keystones
        originalName: keystone.name,
        icon: keystone.icon,
      })),
    };

    return detailData;
  } catch (err) {
    console.error(`      ❌ 详情抓取失败: ${err.message}`);
    return null;
  } finally {
    page.off("response", responseListener);
  }
}

// 保存翻译数据
async function saveTranslatedData(outputDir, allLadders, classList) {
  console.log("\n3️⃣ 保存翻译数据...");

  const PLAYER_DATA_DIR = path.join(outputDir, "players");
  if (fs.existsSync(PLAYER_DATA_DIR)) {
    fs.rmSync(PLAYER_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PLAYER_DATA_DIR, { recursive: true });

  const lightLadders = {};

  for (const clsName in allLadders) {
    lightLadders[clsName] = allLadders[clsName].map((p) => {
      const accountVal = p.account || "unknown";
      const nameVal = p.name || "unknown";
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
        originalAccount: accountVal,
        mainSkillIcon: p.mainSkillIcon,
        detailPath: `players/${detailFileName}`,
        fileName: detailFileName,
      };
    });
  }

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
    path.join(outputDir, "all_ladders_translated.json"),
    JSON.stringify(lightData, null, 2)
  );

  return {
    translationStats: {
      baseItemsCount: Object.keys(dictBase).length,
      uniqueItemsCount: Object.keys(dictUnique).length,
      gemsCount: Object.keys(dictGem).length,
    },
  };
}
