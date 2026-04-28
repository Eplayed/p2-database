#!/usr/bin/env node
/**
 * 查看踩蘑菇圈子页面截图并尝试点击精华筛选
 */
const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

async function debugPage() {
  console.log("=== 踩蘑菇页面调试 ===\n");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 3000 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");

  try {
    await page.goto("https://www.caimogu.cc/circle/449.html", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 3000));

    // 截图保存
    const screenshotPath = path.join(__dirname, "debug_essence_filter.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log("截图已保存:", screenshotPath);

    // 分析页面元素，查找精华筛选按钮
    const analysis = await page.evaluate(() => {
      const result = {
        buttons: [],
        links: [],
        filters: []
      };

      // 查找所有按钮
      document.querySelectorAll("button").forEach(btn => {
        const text = btn.textContent?.trim() || "";
        if (text) {
          result.buttons.push({
            text,
            className: btn.className,
            id: btn.id,
            ariaLabel: btn.getAttribute("aria-label")
          });
        }
      });

      // 查找包含"精华"文字的元素
      const essenceElements = [];
      const allElements = document.querySelectorAll("*");
      allElements.forEach(el => {
        const text = el.textContent?.trim() || "";
        if (text === "精华" || text.includes("精华")) {
          essenceElements.push({
            tag: el.tagName,
            className: el.className,
            text,
            parentTag: el.parentElement?.tagName
          });
        }
      });
      result.filters = essenceElements;

      // 查找筛选相关的a标签
      document.querySelectorAll("a").forEach(link => {
        const href = link.getAttribute("href") || "";
        const text = link.textContent?.trim() || "";
        if (href.includes("filter") || text.includes("精华") || text.includes("全部")) {
          result.links.push({
            text,
            href,
            className: link.className
          });
        }
      });

      return result;
    });

    console.log("\n找到的按钮:");
    analysis.buttons.forEach(btn => {
      console.log(`  - "${btn.text}" | class: ${btn.className}`);
    });

    console.log("\n包含'精华'的元素:");
    analysis.filters.forEach(el => {
      console.log(`  - <${el.tag}> "${el.text}" | class: ${el.className} | parent: <${el.parentTag}>`);
    });

    console.log("\n筛选相关链接:");
    analysis.links.forEach(link => {
      console.log(`  - "${link.text}" | href: ${link.href}`);
    });

    // 尝试点击精华按钮
    console.log("\n尝试点击精华按钮...");

    // 方法1: 点击包含"精华"文字的元素
    const essenceClicked = await page.evaluate(() => {
      const elements = document.querySelectorAll("*");
      for (const el of elements) {
        if (el.textContent?.trim() === "精华") {
          console.log("找到精华元素:", el.tagName, el.className);
          el.click();
          return true;
        }
      }
      return false;
    });

    if (essenceClicked) {
      console.log("已点击精华按钮");
      await new Promise(r => setTimeout(r, 3000));

      // 截图看结果
      const afterClickPath = path.join(__dirname, "debug_after_essence_click.png");
      await page.screenshot({ path: afterClickPath, fullPage: false });
      console.log("点击后截图:", afterClickPath);

      // 获取URL看是否有变化
      console.log("当前URL:", page.url());
    } else {
      console.log("未找到精华按钮元素");
    }

  } catch (error) {
    console.error("错误:", error.message);
  } finally {
    await browser.close();
  }
}

debugPage().catch(console.error);
