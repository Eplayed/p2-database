require("dotenv").config();
// 🔴 修正 1: FC 必须使用 puppeteer-core
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

// --- 1. 字典加载逻辑 (增加容错) ---
let dictBase = {},
  dictUnique = {},
  dictGem = {},
  // 初始化防止为空导致后续报错
  dictStats = { keywords: {}, patterns: [] };

try {
  // 🔴 修正 2: 路径适配。假设 base-data 文件夹和此脚本在同一级目录打包
  // 如果是在 FC 根目录，使用 __dirname 拼接
  const baseDataDir = path.join(__dirname, "base-data/dist");

  if (fs.existsSync(path.join(baseDataDir, "dict_base.json"))) {
    dictBase = JSON.parse(
      fs.readFileSync(path.join(baseDataDir, "dict_base.json"), "utf8")
    );
  }
  if (fs.existsSync(path.join(baseDataDir, "dict_unique.json"))) {
    dictUnique = JSON.parse(
      fs.readFileSync(path.join(baseDataDir, "dict_unique.json"), "utf8")
    );
  }
  if (fs.existsSync(path.join(baseDataDir, "dict_gem.json"))) {
    dictGem = JSON.parse(
      fs.readFileSync(path.join(baseDataDir, "dict_gem.json"), "utf8")
    );
  }

  const statsPath = path.join(baseDataDir, "dict_stats.json");
  if (fs.existsSync(statsPath)) {
    const loadedStats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
    // 确保结构正确
    if (loadedStats.keywords && loadedStats.patterns) {
      dictStats = loadedStats;
    }
  }
  console.log("✅ 翻译字典加载流程完成");
} catch (e) {
  console.warn("⚠️ 字典加载出现问题 (可能影响翻译质量):", e.message);
}

// 配置
const BASE_URL = "https://poe.ninja/poe2/builds";
const isDev = process.env.NODE_ENV === "dev";
// 生产环境抓 20 个，开发环境抓 3 个
const MAX_RANK = isDev ? 3 : 20;

// 🔴 修正 3: 输出目录适配 FC
// FC 只有 /tmp 目录可写，本地调试则用 ./translated-data
const OUTPUT_DIR = process.env.FC_FUNCTION_NAME
  ? "/tmp/translated-data"
  : isDev
  ? path.join(__dirname, "../translated-data/dev")
  : path.join(__dirname, "../translated-data/release");

// 确保输出目录存在
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 浏览器配置 (适配 FC 官方层路径)
const CHROME_PATH = process.env.CHROME_PATH || (fs.existsSync("/opt/chrome/chrome") ? "/opt/chrome/chrome" : "");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// --- 辅助函数区域 ---

function generateSafeFileName(text, prefix = "") {
  if (!text) text = "unknown";
  // 简化版安全文件名
  const safeText = text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
  return prefix + safeText;
}

function generateUniqueFileName(account, name, timestamp) {
  return `${generateSafeFileName(account)}_${generateSafeFileName(name)}.json`;
}

// 🔴 修正 4: 增加空值检查，防止崩溃
function translateItemName(itemName, baseType, frameType) {
  if (!itemName) return "";

  if (frameType === 3) {
    const uniqueInfo = dictUnique[itemName];
    if (uniqueInfo) return uniqueInfo.cn;
    // 模糊匹配
    for (const [key, value] of Object.entries(dictUnique)) {
      if (key.toLowerCase().includes(itemName.toLowerCase())) return value.cn;
    }
    return itemName;
  } else {
    let cnBase = dictBase[baseType] || dictBase[itemName];

    // ... (保留你原有的推断逻辑) ...
    // 为节省篇幅，此处省略你原来的 itemTypeMap 逻辑，请保留原代码中的逻辑
    // 建议：如果字典里没找到，直接返回原始名称，避免过度猜测

    if (!cnBase) {
      // 简单模糊匹配兜底
      if (baseType && dictBase[baseType]) cnBase = dictBase[baseType];
    }

    if (cnBase) {
      const prefix = itemName.split(" ")[0];
      if (
        prefix &&
        cnBase &&
        !cnBase.includes(prefix) &&
        itemName !== baseType
      ) {
        return `${itemName} (${cnBase})`;
      }
      return cnBase;
    }
    return itemName;
  }
}

function translateMods(modList) {
  if (!modList || modList.length === 0) return "";

  return modList
    .map((line) => {
      let text = line.replace(/\[.*?\|(.*?)\]/g, "$1");

      // 关键词替换
      if (dictStats && dictStats.keywords) {
        for (const [en, cn] of Object.entries(dictStats.keywords)) {
          if (text.includes(en)) text = text.split(en).join(cn);
        }
      }

      // 正则替换
      if (dictStats && dictStats.patterns) {
        for (const pattern of dictStats.patterns) {
          try {
            const regex = new RegExp(pattern.regex, "i");
            if (regex.test(text)) {
              text = text.replace(regex, pattern.replace);
              break;
            }
          } catch (e) {}
        }
      }

      // 简单补丁
      text = text.replace(/When you kill a/, "当你击败");
      text = text.replace(/monster/, "怪物");
      return text;
    })
    .join("\n");
}

function translateGemName(gemName) {
  if (!gemName) return "";
  return dictGem[gemName] || gemName;
}

function translateKeystoneName(keystoneName) {
  if (!keystoneName) return "";
  return dictPassive && dictPassive[keystoneName]
    ? dictPassive[keystoneName].cn
    : keystoneName;
}

// --- 主任务函数 ---
async function runTask() {
  console.log(`🚀 [FC爬虫] 启动 | 深度: ${MAX_RANK} | 输出: ${OUTPUT_DIR}`);

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: CHROME_PATH || undefined, // FC 环境必须指定
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
    // 🔴 关键：指定缓存目录到 /tmp，否则可能因为无权限写入而报错
    userDataDir: '/tmp/puppeteer_user_data' 
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(USER_AGENT);

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    // 🔴 修正 5: 必须允许 'image'，否则 Canvas 无法生成天赋图
    const type = req.resourceType();
    if (
      [
        "media",
        "font",
        "texttrack",
        "object",
        "beacon",
        "csp_report",
        "imageset",
      ].includes(type)
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    // ... (抓取职业列表逻辑保持不变) ...
    console.log("1️⃣  获取职业列表...");
    await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    try {
      await page.waitForFunction(
        () => document.body.innerText.includes("FATE OF THE VAAL"),
        { timeout: 30000 }
      );
    } catch (e) {}

    const classList = await page.evaluate(() => {
      const list = [];
      document.querySelectorAll('a[href*="class="]').forEach((link) => {
        if (
          link.href.includes("/builds/vaal?") &&
          !link.href.includes("hc-") &&
          !link.href.includes("ssf-")
        ) {
          const name = link.querySelector("h4")?.innerText.trim();
          if (name && !list.find((i) => i.name === name))
            list.push({ name, link: link.href });
        }
      });
      return list;
    });

    console.log(`   ✅ 发现 ${classList.length} 个职业`);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "classes.json"),
      JSON.stringify(classList, null, 2)
    );

    // ... (遍历职业和玩家的逻辑) ...
    const allLadders = {};

    for (const cls of classList) {
      console.log(`\n2️⃣  处理职业: ${cls.name}`);
      try {
        await page.goto(cls.link, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await page.waitForFunction(
          () => document.querySelectorAll("tbody tr").length > 0,
          { timeout: 15000 }
        );
      } catch (e) {
        continue;
      }

      const players = await page.evaluate((limit) => {
        return Array.from(document.querySelectorAll("tbody tr"))
          .slice(0, limit)
          .map((row) => {
            const a = row.querySelector("td:nth-child(1) a");
            if (!a) return null;
            const imgs = Array.from(row.querySelectorAll("img"));
            let icon = imgs.length > 0 ? imgs[imgs.length - 1].src : "";

            let acc = "";
            try {
              acc = decodeURIComponent(
                a.href.split("/character/")[1].split("/")[0]
              );
            } catch (e) {}

            return {
              rank: 0, // 可以在循环外赋值
              name: a.innerText.trim(),
              link: a.href,
              account: acc,
              level: parseInt(
                row.querySelector("td:nth-child(2)")?.innerText || 0
              ),
              mainSkillIcon: icon,
            };
          })
          .filter((p) => p);
      }, MAX_RANK);

      const detailedPlayers = [];

      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        player.rank = i + 1;

        let capturedData = null;
        // ... (监听网络请求逻辑保持不变) ...
        const responseListener = async (res) => {
          if (
            res.url().includes("/api/builds/") &&
            res.url().includes("/character") &&
            !capturedData
          ) {
            try {
              const j = await res.json();
              if (j.items) capturedData = j;
            } catch (e) {}
          }
        };
        page.on("response", responseListener);

        try {
          await page.goto(player.link, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });

          // 等待 SVG
          try {
            await page.waitForSelector("svg.bg-transparent", { timeout: 8000 });
          } catch (e) {}
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight)
          );
          await new Promise((r) => setTimeout(r, 2000));

          if (!capturedData) {
            // 兜底 __NEXT_DATA__
            capturedData = await page.evaluate(() => {
              try {
                return JSON.parse(
                  document.getElementById("__NEXT_DATA__").innerText
                ).props.pageProps.character;
              } catch (e) {
                return null;
              }
            });
          }

          if (capturedData) {
            // 生成图片
            const treeImgBase64 = await page.evaluate(async () => {
              return new Promise((resolve) => {
                // 1. 精准定位 SVG (根据你的截图 class 是 bg-transparent)
                const svgEl = document.querySelector("svg.bg-transparent");
                if (!svgEl) return resolve(null);

                const serializer = new XMLSerializer();
                const clonedSvg = svgEl.cloneNode(true);
                const originalNodes = svgEl.querySelectorAll("*");
                const clonedNodes = clonedSvg.querySelectorAll("*");

                // 2. A计划：样式内联 (Style Inlining)
                originalNodes.forEach((orig, i) => {
                  const clone = clonedNodes[i];
                  if (!clone) return;
                  const style = window.getComputedStyle(orig);
                  // 确保保留关键属性
                  [
                    "stroke",
                    "fill",
                    "stroke-width",
                    "opacity",
                    "r",
                    "cx",
                    "cy",
                    "display",
                  ].forEach((p) => {
                    const v = style.getPropertyValue(p);
                    if (v && v !== "auto" && v !== "none")
                      clone.style.setProperty(p, v, "important");
                  });
                });

                // 3. 计算尺寸
                // 你的截图 viewBox="-12046... 24834 25310" -> width=24834, height=25310
                // 我们需要限制 Canvas 大小，否则会内存溢出
                const viewBox = svgEl.viewBox.baseVal;
                // 限制最大宽度为 1200，高度按比例缩放
                const targetWidth = 1200;
                // 防止 viewBox 为 0 导致除以 0 错误
                const targetHeight =
                  viewBox.width > 0 && viewBox.height > 0
                    ? targetWidth * (viewBox.height / viewBox.width)
                    : 1200;

                const canvas = document.createElement("canvas");
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext("2d");

                // 填充深色背景 (Ninja 背景色)
                ctx.fillStyle = "#0b0f19";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // 4. B计划：序列化并暴力替换颜色变量 (这是修复问题的关键！！！)
                let svgString = serializer.serializeToString(clonedSvg);

                // 强制将 CSS 变量替换为 Hex 颜色
                // 根据 poe.ninja 的 CSS 变量表进行替换
                svgString = svgString
                  .replace(/var\(--color-coolgrey-900\)/g, "#111827") // 背景圆圈
                  .replace(/var\(--color-coolgrey-800\)/g, "#1f2937") // 未点亮线路
                  .replace(/var\(--color-emerald-500\)/g, "#10b981") // 高亮/点亮线路 (绿色)
                  .replace(/var\(--color-yellow-400\)/g, "#facc15") // 核心天赋 (黄色)
                  .replace(/var\(--color-orange-500\)/g, "#f97316") // 关键天赋 (橙色)
                  .replace(/var\(--color-coolgrey-400\)/g, "#9ca3af")
                  .replace(/var\(--color-red-500\)/g, "#ef4444");

                const img = new Image();
                // 指定字符集防止乱码
                const blob = new Blob([svgString], {
                  type: "image/svg+xml;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);

                img.onload = () => {
                  // 绘制并压缩
                  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                  const b64 = canvas.toDataURL("image/jpeg", 0.6); // 0.6 质量足够且体积小
                  // URL.revokeObjectURL(url); // Puppeteer 环境下有时会导致过早释放，注释掉更稳
                  resolve(b64);
                };

                img.onerror = (e) => {
                  // console.log('SVG转图片失败');
                  resolve(null);
                };

                img.src = url;
              });
            });

            // 🔴 修正 6: 数据清洗时调用翻译
            const detailData = {
              info: {
                name: capturedData.name,
                class: capturedData.class,
                level: capturedData.level,
                account: capturedData.account,
                league: capturedData.league,
              },
              equipment: (capturedData.items || []).map((item) => {
                const iData = item.itemData || item;
                const tName = translateItemName(
                  iData.name,
                  iData.baseType,
                  iData.frameType
                );

                // 收集词缀用于翻译
                let mods = [];
                if (iData.explicitMods) mods.push(...iData.explicitMods);
                if (iData.implicitMods)
                  mods.push(...iData.implicitMods.map((m) => `(基底) ${m}`));

                return {
                  slot: item.inventoryId,
                  name: tName,
                  originalName: iData.name || iData.baseType,
                  icon: iData.icon,
                  rarity: iData.frameType,
                  desc: translateMods(mods), // 翻译词缀
                };
              }),
              skills: (capturedData.skills || []).map((s) => ({
                gems: (s.allGems || []).map((g) => ({
                  name: translateGemName(g.name),
                  icon: g.itemData?.icon,
                  isSupport: g.itemData?.support,
                })),
              })),
              keystones: (capturedData.keystones || []).map((k) => ({
                name: translateKeystoneName(k.name),
                icon: k.icon,
              })),
              passiveTreeImage: treeImgBase64,
            };

            player.detail = detailData;
            detailedPlayers.push(player);
            console.log(`      ✅ [已翻译] ${player.name}`);
          }
        } catch (err) {
          console.error(`      ❌ 失败: ${player.name}`);
        } finally {
          page.off("response", responseListener);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      allLadders[cls.name] = detailedPlayers;
    }

    // 阶段 3: 保存
    const PLAYER_DATA_DIR = path.join(OUTPUT_DIR, "players");
    fs.mkdirSync(PLAYER_DATA_DIR, { recursive: true });

    const lightLadders = {};
    for (const clsName in allLadders) {
      lightLadders[clsName] = allLadders[clsName].map((p) => {
        const fileName = generateUniqueFileName(p.account, p.name);
        if (p.detail) {
          fs.writeFileSync(
            path.join(PLAYER_DATA_DIR, fileName),
            JSON.stringify(p.detail)
          );
        }
        return {
          rank: p.rank,
          name: p.name,
          level: p.level,
          account: p.account,
          mainSkillIcon: p.mainSkillIcon,
          detailPath: `players/${fileName}`,
        };
      });
    }

    fs.writeFileSync(
      path.join(OUTPUT_DIR, "all_ladders.json"),
      JSON.stringify({
        updateTime: new Date().toISOString(),
        classes: classList,
        ladders: lightLadders,
      })
    );

    console.log("✅ 爬取并翻译完成，返回目录");
    return OUTPUT_DIR; // 返回给 index.js 用于上传
  } catch (e) {
    console.error("❌ 任务崩溃:", e);
    throw e;
  } finally {
    await browser.close();
  }
}

module.exports = { runTask };
