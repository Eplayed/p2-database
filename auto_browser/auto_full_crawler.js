const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const envConfig = require("./env-config");

// 配置控制
const BASE_URL = "https://poe.ninja/poe2/builds";
// 优先级：命令行参数 > env-config > 硬编码
const MAX_RANK = process.env.MAX_RANK || envConfig.crawler.maxRank || 20;
const OUTPUT_DIR = "./data";

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

(async () => {
  console.log(
    `🚀 [V5.5 全站爬虫] 启动 | 环境: ${
      process.env.NODE_ENV || "dev"
    } | 目标深度: ${MAX_RANK}`
  );

  const browser = await puppeteer.launch({
    headless: envConfig.crawler.headless,
    protocolTimeout: 240000, // 增加 protocolTimeout 到 240 秒
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--single-process",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  try {
    // ==========================================
    // 阶段 1: 抓取职业列表
    // ==========================================
    console.log("\n1️⃣  正在扫描职业入口...");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    // 这里的筛选逻辑加固，确保能抓到 Pathfinder 等所有职业
    const classList = await page.evaluate(() => {
      const results = [];
      // 找寻所有包含 class= 参数的 a 标签
      const links = Array.from(document.querySelectorAll('a[href*="class="]'));
      links.forEach((link) => {
        const href = link.href;
        // 排除 SSF, HC 等，只保留标准赛季
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

    // ==========================================
    // 阶段 2: 遍历职业 -> 抓取详情
    // ==========================================
    const allLadders = {};

    for (const cls of classList) {
      console.log(`\n2️⃣  处理职业: ${cls.name}`);

      await page.goto(cls.link, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForSelector("tbody tr", { timeout: 10000 });
      } catch (e) {}

      // 提取玩家基础信息
      const players = await page.evaluate((limit) => {
        const rows = Array.from(document.querySelectorAll("tbody tr")).slice(
          0,
          limit
        );
        return rows
          .map((row, i) => {
            const a = row.querySelector("td:nth-child(1) a");
            if (!a) return null;
            return { rank: i + 1, name: a.innerText.trim(), link: a.href };
          })
          .filter((p) => p !== null);
      }, MAX_RANK);

      console.log(`   📋 列表就绪 (${players.length}人)，开始执行深度解析...`);

      const detailedPlayers = [];

      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        console.log(
          `      (${i + 1}/${players.length}) 正在解析: ${player.name}`
        );

        try {
          // 拦截网络请求拿原始数据
          let networkJson = null;
          const onResponse = async (response) => {
            const url = response.url();
            if (
              url.includes("/getcharacter") &&
              response.request().method() === "GET"
            ) {
              try {
                networkJson = await response.json();
              } catch (e) {}
            }
          };
          page.on("response", onResponse);

          await page.goto(player.link, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
          });

          // --- 等待天赋树渲染 (PoE2 用 Canvas) ---
          try {
            await page.waitForSelector('[data-tooltip-canvas="true"] canvas', { timeout: 15000 });
            await new Promise((r) => setTimeout(r, 3000)); // 等 Canvas 渲染完成
          } catch (e) {
            console.warn("等待天赋树 Canvas 超时");
          }
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight)
          );

          // --- 截图天赋树 (用 page.screenshot 截取 Canvas 区域，兼容 WebGL) ---
          let treeImgBase64 = null;
          const treeRect = await page.evaluate(() => {
            const tooltipCanvas = document.querySelector('[data-tooltip-canvas="true"]');
            if (!tooltipCanvas) return null;
            const rect = tooltipCanvas.getBoundingClientRect();
            if (!rect || rect.width < 100 || rect.height < 100) return null;
            return {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          });

          if (treeRect && treeRect.width > 0) {
            try {
              const imgBuffer = await page.screenshot({
                type: "jpeg",
                quality: 60,
                clip: {
                  x: treeRect.x,
                  y: treeRect.y,
                  width: Math.min(treeRect.width, 1200),
                  height: Math.min(treeRect.height, 1200),
                },
              });
              treeImgBase64 = `data:image/jpeg;base64,${Buffer.from(imgBuffer).toString("base64")}`;
              console.log(`天赋树截图成功: ${treeImgBase64.length} 字符`);
            } catch (e) {
              console.warn("天赋树截图失败:", e.message);
            }
          }

          // --- 提取数据 ---
          const detail = await page.evaluate(() => {
            const script = document.getElementById("__NEXT_DATA__");
            return script
              ? JSON.parse(script.innerText).props?.pageProps?.character
              : null;
          });
          if (detail) detail.treeImg = treeImgBase64;

          // 移除监听器
          page.off("response", onResponse);

          // 如果 eval 没有拿到，尝试用截获的 networkJson
          const rootData = detail || networkJson;

          if (rootData) {
            // 清洗逻辑 (Equipment, Skills 等格式化)
            const cleaned = {
              info: {
                name: rootData.name,
                class: rootData.class,
                level: rootData.level,
                league: rootData.league,
                account: rootData.account,
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
              keystones: rootData.keystones || [],
              passiveTreeImage: detail?.treeImg || null,
            };
            player.detail = cleaned;
            detailedPlayers.push(player);
            console.log(`         ✅ 成功 (装备:${cleaned.equipment.length})`);
          }
        } catch (err) {
          console.error(`         ❌ 失败: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 1000)); // 频率控制
      }
      allLadders[cls.name] = detailedPlayers;
    }

    // ==========================================
    // 阶段 3: 保存汇总结果
    // ==========================================
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
    console.log(`\n🎉 全部抓取任务完成！文件保存在: ${outPath}`);
  } catch (e) {
    console.error("❌ 发生崩溃:", e);
  } finally {
    await browser.close();
  }
})();
