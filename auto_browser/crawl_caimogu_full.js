#!/usr/bin/env node
/**
 * 踩蘑菇网完整BD数据爬虫
 */

const puppeteer = require("puppeteer");
const path = require("path");

async function crawl() {
  console.log("🚀 踩蘑菇BD完整数据爬虫...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 4000 });

  try {
    // 1. 访问社区BD列表
    console.log("\n1️⃣ 访问社区BD列表...");
    await page.goto("https://poe2.caimogu.cc/planner#/plan/community-builds", {
      waitUntil: "networkidle0",
      timeout: 60000
    });
    await new Promise(r => setTimeout(r, 5000));

    await page.screenshot({ path: path.join(__dirname, "../step1_list.png"), fullPage: false });
    console.log("📸 列表页截图: step1_list.png");

    // 2. 提取BD列表
    console.log("\n2️⃣ 提取BD列表...");
    const buildsList = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.cmg-bg-intro, .cmg--wrapper');

      cards.forEach((card, idx) => {
        const titleEl = card.querySelector('.intro--title, [class*="title"]');
        const authorEl = card.querySelector('.hover-click, [class*="author"]');
        const seasonEl = card.querySelector('.colot-8, [class*="season"]');

        const title = titleEl?.innerText?.trim() || '';
        const author = authorEl?.innerText?.trim() || '';
        const season = seasonEl?.innerText?.trim() || '';

        if (title && !title.includes('选择职业')) {
          results.push({ index: idx, title, author, season });
        }
      });

      return results;
    });

    console.log(`   ✅ 找到 ${buildsList.length} 个BD`);
    buildsList.slice(0, 5).forEach((b, i) => {
      console.log(`   ${i + 1}. ${b.title} (${b.author})`);
    });

    // 3. 点击进入详情页
    console.log("\n3️⃣ 进入BD详情页...");

    let clicked = false;
    const bgIntro = await page.$('.cmg-bg-intro');
    if (bgIntro) {
      console.log("   🖱️ 点击 .cmg-bg-intro...");
      await bgIntro.click();
      clicked = true;
    } else {
      const titleEl = await page.$('.intro--title');
      if (titleEl) {
        console.log("   🖱️ 点击 .intro--title...");
        await titleEl.click();
        clicked = true;
      }
    }

    if (!clicked) {
      await page.evaluate(() => {
        const card = document.querySelector('.cmg-bg-intro');
        if (card) card.click();
      });
      clicked = true;
    }

    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: path.join(__dirname, "../step2_detail.png"), fullPage: false });
    console.log("📸 详情页截图: step2_detail.png");

    const currentHash = await page.evaluate(() => window.location.hash);
    console.log(`   Hash: ${currentHash}`);

    // 4. 提取详情页数据
    console.log("\n4️⃣ 提取详情页数据...");

    const detailData = await page.evaluate(() => {
      const result = {
        title: '',
        author: '',
        class: '',
        likes: 0,
        season: '',
        skillLinks: [],
        equipment: {},
        passiveTree: { points: 0, nodes: [] },
        levelingGuide: [],
        skillHtml: '',
        equipmentHtml: '',
        treeHtml: '',
        pageText: ''
      };

      // 基础信息
      const titleEl = document.querySelector('[class*="title"]:not([class*="intro"]), h1, h2');
      result.title = titleEl?.innerText?.trim() || '';

      const authorEl = document.querySelector('[class*="author"], .hover-click');
      result.author = authorEl?.innerText?.trim() || '';

      const likesEl = document.querySelector('[class*="like"], [class*="count"], .cmg-count');
      const likesText = likesEl?.innerText?.trim() || '0';
      result.likes = parseInt(likesText.match(/\d+/)?.[0] || '0');

      // 技能链接
      const skillArea = document.querySelector('[class*="skill"], [class*="gem"], [class*="socket"]');
      if (skillArea) {
        result.skillHtml = skillArea.innerHTML.substring(0, 500);
        const skillGroups = skillArea.querySelectorAll('[class*="group"], [class*="link"], [class*="gem-item"]');
        skillGroups.forEach((group, gIdx) => {
          const gems = [];
          const gemEls = group.querySelectorAll('[class*="gem"], [class*="skill"], img');
          gemEls.forEach(gem => {
            const name = gem.getAttribute('alt') || gem.getAttribute('title') || gem.innerText?.trim() || '';
            const icon = gem.querySelector('img')?.src || gem.src || '';
            if (name) gems.push({ name, icon });
          });
          if (gems.length > 0) {
            result.skillLinks.push({ group: gIdx + 1, gems });
          }
        });
      }

      // 装备
      const equipArea = document.querySelector('[class*="equipment"], [class*="gear"], [class*="item"], [class*="slot"]');
      if (equipArea) {
        result.equipmentHtml = equipArea.innerHTML.substring(0, 500);
        const slots = equipArea.querySelectorAll('[class*="slot"], [class*="item"]');
        slots.forEach(slot => {
          const slotName = slot.querySelector('[class*="label"], [class*="slot-name"]')?.innerText?.trim() || 'unknown';
          const itemName = slot.querySelector('[class*="name"]:not([class*="label"]), [class*="item-name"]')?.innerText?.trim() || '';
          const icon = slot.querySelector('img')?.src || '';
          if (itemName || icon) {
            result.equipment[slotName] = { name: itemName, icon };
          }
        });
      }

      // 天赋树
      const treeArea = document.querySelector('[class*="tree"], [class*="passive"], #passive-tree, .passive-tree');
      if (treeArea) {
        result.treeHtml = treeArea.innerHTML.substring(0, 500);
        const nodes = treeArea.querySelectorAll('[class*="node"], [class*="keystone"]');
        nodes.forEach(node => {
          const name = node.getAttribute('data-name') || node.innerText?.trim() || '';
          if (name && name.length < 30) {
            result.passiveTree.nodes.push(name);
          }
        });
      }

      // 升级流程
      const guideArea = document.querySelector('[class*="guide"], [class*="leveling"], [class*="流程"]');
      if (guideArea) {
        const items = guideArea.querySelectorAll('li, [class*="item"], p');
        items.forEach(item => {
          const text = item.innerText?.trim();
          if (text && text.length > 5 && text.length < 200) {
            result.levelingGuide.push(text);
          }
        });
      }

      result.pageText = document.body.innerText.substring(0, 5000);

      return result;
    });

    console.log("\n📊 详情页数据:");
    console.log(`   标题: ${detailData.title}`);
    console.log(`   作者: ${detailData.author}`);
    console.log(`   点赞: ${detailData.likes}`);
    console.log(`   技能链接: ${detailData.skillLinks.length} 组`);
    console.log(`   装备槽位: ${Object.keys(detailData.equipment).length} 个`);
    console.log(`   天赋节点: ${detailData.passiveTree.nodes.length} 个`);
    console.log(`   升级流程: ${detailData.levelingGuide.length} 条`);

    console.log("\n📄 页面文本 (前2000字符):");
    console.log(detailData.pageText.substring(0, 2000));

    console.log("\n🔍 HTML片段:");
    if (detailData.skillHtml) console.log("技能:", detailData.skillHtml.substring(0, 300));
    if (detailData.equipmentHtml) console.log("装备:", detailData.equipmentHtml.substring(0, 300));

  } catch (e) {
    console.error("❌ 失败:", e.message);
    await page.screenshot({ path: path.join(__dirname, "../debug.png"), fullPage: false });
  } finally {
    await browser.close();
  }
}

crawl().then(() => console.log("\n✅ 完成")).catch(e => console.error(e));
