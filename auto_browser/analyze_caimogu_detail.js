#!/usr/bin/env node
/**
 * 踩蘑菇网 - 分析BD详情URL模式
 */

const puppeteer = require("puppeteer");
const path = require("path");

async function crawl() {
  console.log("🚀 分析踩蘑菇BD详情页...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 4000 });

  try {
    // 获取社区BD列表
    console.log("\n1️⃣ 获取社区BD列表...");
    await page.goto("https://poe2.caimogu.cc/planner#/plan/community-builds", {
      waitUntil: "networkidle0",
      timeout: 60000
    });
    await new Promise(r => setTimeout(r, 5000));

    // 获取BD列表和可能的ID
    const buildsInfo = await page.evaluate(() => {
      const cards = document.querySelectorAll('.cmg-bg-intro');
      return Array.from(cards).map((card, idx) => {
        const title = card.querySelector('.intro--title')?.innerText?.trim() || '';
        const author = card.querySelector('.hover-click')?.innerText?.trim() || '';

        // 获取所有属性
        const attrs = {};
        for (const attr of card.attributes) {
          attrs[attr.name] = attr.value;
        }

        // 检查内部链接
        const link = card.querySelector('a')?.href || '';
        const linkOnClick = card.getAttribute('onclick') || '';

        return { idx, title, author, attrs, link, linkOnClick };
      }).slice(0, 5);
    });

    console.log("   BD信息:");
    buildsInfo.forEach(b => {
      console.log(`   ${b.idx}. ${b.title} (${b.author})`);
      console.log(`      attrs: ${JSON.stringify(b.attrs)}`);
      console.log(`      link: ${b.link}`);
    });

    // 2. 点击BD并监听网络请求
    console.log("\n2️⃣ 点击BD并监听请求...");

    // 监听所有请求
    const requests = [];
    page.on('request', req => {
      requests.push({
        url: req.url(),
        type: req.resourceType()
      });
    });

    // 尝试点击
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.cmg-bg-intro');
      if (cards[0]) {
        cards[0].click();
      }
    });

    await new Promise(r => setTimeout(r, 5000));

    console.log(`   捕获了 ${requests.length} 个请求`);

    // 过滤API请求
    const apiRequests = requests.filter(r =>
      r.url.includes('api') ||
      r.url.includes('build') ||
      r.url.includes('detail')
    );

    console.log("   API相关请求:");
    apiRequests.slice(0, 10).forEach(r => {
      console.log(`      ${r.type}: ${r.url.substring(0, 100)}`);
    });

    // 3. 检查hash变化
    const hashAfterClick = await page.evaluate(() => window.location.hash);
    console.log(`\n   Hash变化: ${hashAfterClick}`);

    // 4. 如果hash没变，直接分析可能的数据结构
    if (hashAfterClick.includes('community-builds')) {
      console.log("\n3️⃣ 分析页面DOM结构寻找详情入口...");

      // 查找所有包含BD详情的元素
      const domAnalysis = await page.evaluate(() => {
        const result = {
          interactiveElements: [],
          dataEndpoints: [],
          vueComponents: []
        };

        // 查找包含"详情"或"detail"的元素
        document.querySelectorAll('*').forEach(el => {
          const text = el.innerText || '';
          if (text.includes('技能') || text.includes('装备') || text.includes('天赋树')) {
            result.interactiveElements.push({
              tag: el.tagName,
              class: el.className.substring(0, 50),
              text: text.substring(0, 100)
            });
          }
        });

        // 查找data属性中的URL或ID
        document.querySelectorAll('[data-href], [data-url], [data-link], [data-id]').forEach(el => {
          result.dataEndpoints.push({
            tag: el.tagName,
            class: el.className.substring(0, 30),
            dataId: el.getAttribute('data-id'),
            dataHref: el.getAttribute('data-href')
          });
        });

        // 查找所有可点击元素
        const clickables = document.querySelectorAll('*');
        const seen = new Set();
        clickables.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer' && el.innerText && el.innerText.length > 2) {
            const key = el.innerText.substring(0, 20);
            if (!seen.has(key) && seen.size < 20) {
              seen.add(key);
              result.vueComponents.push({
                tag: el.tagName,
                text: el.innerText.substring(0, 30),
                class: el.className.substring(0, 40)
              });
            }
          }
        });

        return result;
      });

      console.log("\n   包含技能/装备/天赋的元素:");
      domAnalysis.interactiveElements.forEach(el => {
        console.log(`      <${el.tag}> ${el.class}: "${el.text}"`);
      });

      console.log("\n   有data属性的元素:");
      domAnalysis.dataEndpoints.forEach(el => {
        console.log(`      <${el.tag}> data-id="${el.dataId}" data-href="${el.dataHref}"`);
      });

      console.log("\n   可点击元素:");
      domAnalysis.vueComponents.forEach(el => {
        console.log(`      <${el.tag}> "${el.text}"`);
      });
    }

    // 5. 截图
    await page.screenshot({ path: path.join(__dirname, "../final_analysis.png"), fullPage: false });
    console.log("\n📸 截图已保存: final_analysis.png");

  } catch (e) {
    console.error("❌ 失败:", e.message);
    await page.screenshot({ path: path.join(__dirname, "../debug.png"), fullPage: false });
  } finally {
    await browser.close();
  }
}

crawl().then(() => console.log("\n✅ 完成")).catch(e => console.error(e));
