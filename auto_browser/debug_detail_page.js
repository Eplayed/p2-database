#!/usr/bin/env node
/**
 * 分析踩蘑菇详情页结构
 */

const puppeteer = require("puppeteer");
const path = require("path");

async function analyze() {
  console.log("🚀 分析踩蘑菇详情页结构...\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 4000 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  try {
    // 1. 访问社区BD列表
    console.log("1️⃣ 访问社区BD列表...");
    await page.goto("https://poe2.caimogu.cc/planner#/plan/community-builds", {
      waitUntil: "networkidle0",
      timeout: 60000
    });
    await new Promise(r => setTimeout(r, 8000));

    // 2. 点击第一个BD
    console.log("\n2️⃣ 点击第一个BD...");
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.cmg-bg-intro, [class*="bg-intro"]');
      if (cards[0]) {
        cards[0].click();
      }
    });

    // 等待并检查URL变化
    await new Promise(r => setTimeout(r, 8000));

    const url1 = page.url();
    const hash1 = await page.evaluate(() => window.location.hash);
    console.log(`   URL: ${url1}`);
    console.log(`   Hash: ${hash1}`);

    // 3. 获取页面文本
    const text = await page.evaluate(() => document.body.innerText);

    console.log("\n3️⃣ 页面文本内容 (前3000字符):");
    console.log("=".repeat(60));
    console.log(text.substring(0, 3000));
    console.log("=".repeat(60));

    // 4. 截图
    await page.screenshot({ path: path.join(__dirname, "../detail_page.png"), fullPage: false });
    console.log("\n📸 详情页截图已保存: detail_page.png");

  } catch (e) {
    console.error("❌ 失败:", e.message);
    await page.screenshot({ path: path.join(__dirname, "../debug.png"), fullPage: false });
  } finally {
    await browser.close();
  }
}

analyze().then(() => console.log("\n✅ 完成")).catch(e => console.error(e));
