#!/usr/bin/env node
/**
 * 分析踩蘑菇网页面结构
 */

const puppeteer = require("puppeteer");
const path = require("path");

const CAIMOGU_URL = "https://poe2.caimogu.cc/planner#/plan/community-builds";

async function analyzePageStructure() {
  console.log("🚀 分析踩蘑菇网页面结构...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 3000 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  try {
    console.log("1️⃣ 访问踩蘑菇网...");
    await page.goto(CAIMOGU_URL, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 保存完整截图
    await page.screenshot({ path: path.join(__dirname, "../debug_full_page.png"), fullPage: true });
    console.log("📸 全页截图已保存: debug_full_page.png");

    // 分析页面结构
    const structure = await page.evaluate(() => {
      const result = {
        url: window.location.href,
        hash: window.location.hash,
        bodyClasses: document.body.className,
        children: [],
        allClickableElements: [],
        vueApp: !!window.__VUE__
      };

      const bodyChildren = document.body.children;
      for (let i = 0; i < bodyChildren.length; i++) {
        const el = bodyChildren[i];
        result.children.push({
          tag: el.tagName,
          id: el.id,
          class: el.className.substring(0, 100),
          childCount: el.children.length,
          textPreview: el.innerText?.substring(0, 50)
        });
      }

      const allElements = document.querySelectorAll('*');
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const style = window.getComputedStyle(el);
        if (style.cursor === 'pointer' || el.onclick || el.getAttribute('@click') || el.getAttribute('v-on:click')) {
          const text = el.innerText?.trim() || '';
          if (text && text.length > 2 && text.length < 100) {
            result.allClickableElements.push({
              tag: el.tagName,
              class: el.className.substring(0, 80),
              text: text.substring(0, 60)
            });
          }
        }
      }

      return result;
    });

    console.log("\n📊 页面分析结果:");
    console.log("URL:", structure.url);
    console.log("Hash:", structure.hash);

    console.log("\n📁 Body子元素:");
    structure.children.forEach((child, i) => {
      console.log(`  ${i + 1}. <${child.tag}> id="${child.id}" class="${child.class}" children=${child.childCount}`);
      if (child.textPreview) console.log(`     text: "${child.textPreview}"`);
    });

    console.log(`\n🖱️ 可点击元素 (${structure.allClickableElements.length}个):`);
    structure.allClickableElements.slice(0, 30).forEach((el, i) => {
      console.log(`  ${i + 1}. <${el.tag}> class="${el.class}" text="${el.text}"`);
    });

    console.log("\n🔍 关键词匹配:");
    const keywords = ['千万', '血法', '骨牢', '女巫', '作者', 'BD', 'build'];
    keywords.forEach(kw => {
      const matches = structure.allClickableElements.filter(el =>
        el.text.includes(kw) || el.class.includes(kw)
      );
      if (matches.length > 0) {
        console.log(`  "${kw}": ${matches.length}个`);
        matches.slice(0, 3).forEach(m => {
          console.log(`    - ${m.tag} "${m.text}" class="${m.class}"`);
        });
      }
    });

  } catch (e) {
    console.error("❌ 分析失败:", e.message);
    await page.screenshot({ path: path.join(__dirname, "../debug_error_analyze.png"), fullPage: false });
  } finally {
    await browser.close();
  }
}

analyzePageStructure()
  .then(() => console.log("\n✅ 分析完成"))
  .catch(e => console.error(e));
