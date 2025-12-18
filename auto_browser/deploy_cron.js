const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const OSS = require("ali-oss");
const envConfig = require("./env-config");

// --- ⚙️ 配置区域 ---
const OSS_CONFIG = {
  region: "oss-cn-hongkong",
  accessKeyId: "你的AccessKeyId",
  accessKeySecret: "你的AccessKeySecret",
  bucket: "你的Bucket名字",
};

const BASE_URL = "https://poe.ninja/poe2/builds";
const MAX_RANK = process.env.MAX_RANK || envConfig.crawler.maxRank || 20;
const OUTPUT_DIR = "./data";

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// 模拟真实浏览器 UA
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function runTask() {
  console.log(
    `🚀 [V7.0 修复版] 启动 | 环境: ${
      process.env.NODE_ENV || "dev"
    } | 深度: ${MAX_RANK}`
  );

  let client = null;
  try {
    client = new OSS(OSS_CONFIG);
  } catch (e) {}

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--single-process",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(USER_AGENT);

  // --- 🟢 优化 2: 开启请求拦截 (保留图片加载) ---
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    // 允许 image (为了Canvas绘图), 允许 script/xhr/fetch/document
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
    // ==========================================
    // 阶段 1: 抓取职业列表
    // ==========================================
    console.log("\n1️⃣  正在获取职业列表...");
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
      path.join(OUTPUT_DIR, envConfig.getFileName("classes")),
      JSON.stringify(classList, null, 2)
    );

    // ==========================================
    // 阶段 2: 遍历职业 -> 抓取详情
    // ==========================================
    const allLadders = {};

    for (const cls of classList) {
      console.log(`\n2️⃣  处理职业: ${cls.name}`);

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
        console.warn(`   ⚠️ [${cls.name}] 等待列表超时，跳过`);
        continue;
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

            return {
              rank: i + 1,
              name: a.innerText.trim(),
              link: a.href,
              level: parseInt(
                row.querySelector("td:nth-child(2)")?.innerText || 0
              ),
              mainSkillIcon: skillIcon,
            };
          })
          .filter((p) => p !== null);
      }, MAX_RANK);

      console.log(`   📋 列表就绪 (${players.length}人)，开始解析...`);

      const detailedPlayers = [];

      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        console.log(`      (${i + 1}/${players.length}) 解析: ${player.name}`);

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

          // 1. 确保 SVG 存在
          try {
            await page.waitForSelector("svg.bg-transparent", {
              timeout: 15000,
            }),
              // 等待一小会儿确保 CSS 变量生效
              new Promise((r) => setTimeout(r, 3000));
          } catch (e) {}

          // 2. 滚动到底部触发完整渲染
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight)
          );

          // --- 🔴 关键修复：强制等待 2 秒 ---
          // 让天赋树的点亮动画跑完，确保 CSS class 生效
          await new Promise((r) => setTimeout(r, 2000));

          // 3. 提取数据 (Wait for Data)
          let attempts = 0;
          while (!capturedData && attempts < 10) {
            await new Promise((r) => setTimeout(r, 200));
            attempts++;
          }

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

          // 4. 截图天赋 (Style Inlining + Regex Fallback)
          const treeImgBase64 = await page.evaluate(async () => {
            return new Promise((resolve) => {
              const svgEl = document.querySelector("svg.bg-transparent");
              if (!svgEl) return resolve(null);

              const serializer = new XMLSerializer();
              const clonedSvg = svgEl.cloneNode(true);
              const originalNodes = svgEl.querySelectorAll("*");
              const clonedNodes = clonedSvg.querySelectorAll("*");

              // A. 样式内联 (Style Inlining) - 将计算后的 RGB 颜色写死到标签
              originalNodes.forEach((orig, i) => {
                const clone = clonedNodes[i];
                if (!clone) return;
                const style = window.getComputedStyle(orig);
                const properties = [
                  "stroke",
                  "fill",
                  "stroke-width",
                  "opacity",
                  "display",
                  "visibility",
                  "stroke-dasharray",
                  "r",
                ];
                properties.forEach((prop) => {
                  const val = style.getPropertyValue(prop);
                  if (
                    val &&
                    val !== "none" &&
                    val !== "auto" &&
                    val !== "0px"
                  ) {
                    clone.style.setProperty(prop, val, "important");
                  }
                });
              });

              const width = 1000;
              const rect = svgEl.getBoundingClientRect();
              const height = rect.width
                ? width * (rect.height / rect.width)
                : 1000;
              const canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              ctx.fillStyle = "#0b0f19";
              ctx.fillRect(0, 0, width, height);

              // B. 序列化并做正则替换 (兜底：防止 getComputedStyle 拿到的是 var变量)
              let svgString = serializer.serializeToString(clonedSvg);
              // 暴力替换常见颜色变量，确保即使样式计算失败也能显示颜色
              svgString = svgString
                .replace(/var\(--color-coolgrey-900\)/g, "#111827")
                .replace(/var\(--color-coolgrey-800\)/g, "#1f2937")
                .replace(/var\(--color-emerald-500\)/g, "#10b981") // 高亮线
                .replace(/var\(--color-yellow-400\)/g, "#facc15") // 核心点
                .replace(/var\(--color-orange-500\)/g, "#f97316");

              const img = new Image();
              const blob = new Blob([svgString], {
                type: "image/svg+xml;charset=utf-8",
              });
              const url = URL.createObjectURL(blob);

              img.onload = () => {
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.6));
              };
              img.onerror = () => resolve(null);
              img.src = url;
            });
          });

          // 5. 数据清洗
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
              return {
                slot: item.inventoryId,
                name: i.name || i.baseType,
                icon: i.icon,
                rarity: i.frameType,
                desc: i.explicitMods?.join("\n") || "",
              };
            }),
            skills: (capturedData.skills || []).map((s) => ({
              gems: (s.allGems || []).map((g) => ({
                name: g.name,
                icon: g.itemData?.icon,
                isSupport: g.itemData?.support,
              })),
            })),
            keystones: capturedData.keystones || [],
            passiveTreeImage: treeImgBase64,
          };

          player.detail = detailData;
          detailedPlayers.push(player);

          const imgStatus = treeImgBase64
            ? `✅图片(${Math.round(treeImgBase64.length / 1024)}KB)`
            : "❌无图";
          console.log(
            `         ✅ 成功 (${detailData.equipment.length}装备, ${imgStatus})`
          );
        } catch (err) {
          console.error(`         ❌ 失败: ${err.message}`);
        } finally {
          page.off("response", responseListener);
        }

        await new Promise((r) => setTimeout(r, 500));
      }
      allLadders[cls.name] = detailedPlayers;

      if (!envConfig.isProd) {
        fs.writeFileSync(
          path.join(OUTPUT_DIR, envConfig.getFileName(`temp_${cls.name}`)),
          JSON.stringify(detailedPlayers, null, 2)
        );
      }
    }

    // ==========================================
    // 阶段 3: 保存
    // ==========================================
    console.log("\n3️⃣ 保存数据...");

    const fullData = {
      updateTime: new Date().toISOString(),
      classes: classList,
      ladders: allLadders,
    };
    fs.writeFileSync(
      path.join(OUTPUT_DIR, envConfig.getFileName("all_data_full")),
      JSON.stringify(fullData, null, 2)
    );

    const lightLadders = {};
    for (const cls in allLadders) {
      lightLadders[cls] = allLadders[cls].map((p) => ({
        rank: p.rank,
        name: p.name,
        level: p.level,
        account: p.account,
        mainSkillIcon: p.mainSkillIcon,
      }));
    }
    const lightData = {
      updateTime: fullData.updateTime,
      classes: classList,
      ladders: lightLadders,
    };
    fs.writeFileSync(
      path.join(OUTPUT_DIR, envConfig.getFileName("all_ladders")),
      JSON.stringify(lightData, null, 2)
    );

    console.log(`🎉 任务完成！`);
  } catch (e) {
    console.error("❌ 全局错误:", e);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  runTask();
}
