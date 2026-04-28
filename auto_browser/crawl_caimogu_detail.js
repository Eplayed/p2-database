#!/usr/bin/env node
/**
 * 从踩蘑菇网抓取热门BD详情数据
 * 包括：技能连接、装备推荐、天赋树、升级流程
 */

const puppeteer = require("puppeteer");
const OSS = require("ali-oss");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// OSS配置
const OSS_CONFIG = {
  region: process.env.OSS_REGION || "oss-cn-hangzhou",
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET || "poe2-all-class"
};

// 职业映射
const CLASS_MAP = {
  "女巫": "Witch",
  "游侠": "Ranger",
  "战士": "Warrior",
  "女术者": "Sorceress",
  "德鲁伊": "Druid",
  "僧侣": "Monk",
  "佣兵": "Mercenary",
  "女猎手": "Huntress"
};

const CLASS_CN_MAP = {
  "Witch": "女巫",
  "Ranger": "游侠",
  "Warrior": "战士",
  "Sorceress": "女术者",
  "Druid": "德鲁伊",
  "Monk": "僧侣",
  "Mercenary": "佣兵",
  "Huntress": "女猎手"
};

const CAIMOGU_URL = "https://poe2.caimogu.cc/planner#/plan/community-builds";

// 等待Vue渲染的辅助函数
async function waitForVueRender(page, maxWait = 10000) {
  await page.waitForFunction(
    () => {
      // 检查是否还有加载状态
      const loading = document.querySelector('.loading, [class*="loading"], .el-loading');
      return !loading;
    },
    { timeout: maxWait }
  ).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 2000));
}

// 提取技能连接数据
async function extractSkillLinks(page) {
  return await page.evaluate(() => {
    const skillLinks = [];

    // 查找技能链接区域 - 踩蘑菇网可能有以下选择器
    // 1. 技能链接组
    const linkGroups = document.querySelectorAll('[class*="skill-link"], [class*="skillLink"], .gem-group, [class*="socket-group"]');

    linkGroups.forEach((group, groupIndex) => {
      const gems = [];
      const gemElements = group.querySelectorAll('[class*="gem"], [class*="skill"], img[class*="gem"]');

      gemElements.forEach(gem => {
        // 获取宝石名称
        const nameEl = gem.querySelector('[class*="name"], [class*="label"], .gem-name');
        const name = nameEl ? nameEl.innerText.trim() : gem.getAttribute('alt') || gem.getAttribute('title') || '';

        // 获取宝石图标URL
        const imgEl = gem.querySelector('img');
        const icon = imgEl ? imgEl.getAttribute('src') || imgEl.getAttribute('data-src') : '';

        if (name) {
          gems.push({ name, icon });
        }
      });

      if (gems.length > 0) {
        skillLinks.push({
          group: groupIndex + 1,
          gems
        });
      }
    });

    // 备选：尝试从页面文本提取技能信息
    if (skillLinks.length === 0) {
      const pageText = document.body.innerText;
      const skillPatterns = [
        /([\u4e00-\u9fa5]{2,10})\s*\(?[A-Z][a-z]+\s*[A-Z]?\)?/g,  // 中英混合技能名
      ];

      const foundSkills = new Set();
      skillPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(pageText)) !== null) {
          foundSkills.add(match[0]);
        }
      });

      if (foundSkills.size > 0) {
        skillLinks.push({
          group: 1,
          gems: Array.from(foundSkills).slice(0, 6).map(name => ({ name, icon: '' }))
        });
      }
    }

    return skillLinks;
  });
}

// 提取装备数据
async function extractEquipment(page) {
  return await page.evaluate(() => {
    const equipment = {};

    // 查找装备槽位
    const slots = document.querySelectorAll('[class*="equipment"], [class*="gear"], [class*="item-slot"], .gear-slot, .equipment-slot');

    slots.forEach(slot => {
      // 获取槽位名称
      const slotNameEl = slot.querySelector('[class*="label"], [class*="name"], .slot-name, .label');
      const slotName = slotNameEl ? slotNameEl.innerText.trim() : '';

      // 获取装备名称
      const itemNameEl = slot.querySelector('[class*="item-name"], [class*="name"]:not([class*="label"]), .item-name');
      const itemName = itemNameEl ? itemNameEl.innerText.trim() : '';

      // 获取装备图标
      const imgEl = slot.querySelector('img');
      const icon = imgEl ? imgEl.getAttribute('src') || imgEl.getAttribute('data-src') : '';

      if (slotName || itemName) {
        equipment[slotName || 'unknown'] = {
          name: itemName,
          icon
        };
      }
    });

    return equipment;
  });
}

// 提取天赋树数据
async function extractPassiveTree(page) {
  return await page.evaluate(() => {
    // 踩蘑菇网的天赋树可能是Canvas或SVG
    const treeData = {
      points: 0,
      nodes: []
    };

    // 检查是否有天赋树选择器
    const treeContainer = document.querySelector('[class*="tree"], [class*="passive"], .passive-tree, #passive-tree');

    if (treeContainer) {
      // 获取天赋树点数
      const pointsEl = treeContainer.querySelector('[class*="points"], .points-count');
      if (pointsEl) {
        const pointsText = pointsEl.innerText;
        treeData.points = parseInt(pointsText.match(/\d+/)?.[0] || '0');
      }

      // 获取天赋节点
      const nodes = treeContainer.querySelectorAll('[class*="node"], [class*="keystone"], .node');
      nodes.forEach(node => {
        const nameEl = node.querySelector('[class*="name"], .node-name');
        const name = nameEl ? nameEl.innerText.trim() : node.getAttribute('data-name') || '';

        if (name) {
          treeData.nodes.push({ name });
        }
      });
    }

    return treeData;
  });
}

// 提取升级流程
async function extractLevelingGuide(page) {
  return await page.evaluate(() => {
    const guide = [];

    // 查找升级指南区域
    const guideSections = document.querySelectorAll('[class*="guide"], [class*="leveling"], [class*="流程"], .leveling-guide');

    guideSections.forEach(section => {
      const items = section.querySelectorAll('[class*="item"], [class*="step"], li');
      items.forEach(item => {
        const text = item.innerText.trim();
        if (text && text.length > 5 && text.length < 200) {
          guide.push(text);
        }
      });
    });

    return guide.slice(0, 20); // 限制数量
  });
}

// 主爬虫函数
async function crawlCaiMoGuBuildDetails() {
  console.log("🚀 启动踩蘑菇BD详情爬虫...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 3000 }); // 增加高度以显示更多内容

  // 设置 User-Agent
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  try {
    console.log("1️⃣  访问踩蘑菇网...");
    await page.goto(CAIMOGU_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("2️⃣  等待BD列表加载...");
    await waitForVueRender(page);

    // 截图调试
    await page.screenshot({ path: path.join(__dirname, "../debug_community_list.png"), fullPage: false });
    console.log("   📸 社区BD列表截图已保存");

    // 等待BD卡片出现
    try {
      await page.waitForSelector('[class*="card"], [class*="build"], .bd-item, [class*="community"]', { timeout: 10000 });
    } catch (e) {
      console.log("   ⚠️ 未找到标准BD卡片，尝试其他选择器...");
    }

    // 获取BD列表
    console.log("3️⃣  提取BD列表...");
    const buildsList = await page.evaluate(() => {
      const builds = [];
      const cards = document.querySelectorAll('[class*="card"], [class*="build-item"], [class*="bd-card"], .build-card');

      cards.forEach((card, index) => {
        // 获取标题
        const titleEl = card.querySelector('[class*="title"], [class*="name"], h1, h2, h3, .title');
        const title = titleEl ? titleEl.innerText.trim() : '';

        // 获取作者
        const authorEl = card.querySelector('[class*="author"], [class*="creator"], .author');
        const author = authorEl ? authorEl.innerText.replace(/作者[:：]/g, '').trim() : '未知';

        // 获取职业
        const classEl = card.querySelector('[class*="class"], [class*="职业"], .class-icon, img[class*="class"]');
        const className = classEl ? classEl.innerText.trim() || classEl.getAttribute('alt') : '';

        // 获取标签
        const tags = [];
        card.querySelectorAll('[class*="tag"], [class*="badge"], .tag').forEach(tag => {
          const text = tag.innerText.trim();
          if (text) tags.push(text);
        });

        // 获取链接/ID
        const link = card.querySelector('a');
        const href = link ? link.getAttribute('href') || link.getAttribute('data-id') : '';

        if (title) {
          builds.push({
            title,
            author,
            className,
            tags,
            href,
            index
          });
        }
      });

      return builds;
    });

    console.log(`   ✅ 找到 ${buildsList.length} 个BD`);

    // 如果没有找到，尝试从页面文本解析
    if (buildsList.length === 0) {
      console.log("   ⚠️ 从DOM未找到BD，尝试从文本解析...");
      const text = await page.evaluate(() => document.body.innerText);
      const lines = text.split("\n");

      let currentClass = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 检测职业行
        if (CLASS_MAP[line]) {
          currentClass = line;
          continue;
        }

        // 检测BD行
        if (line.includes("作者：") && line.includes("|")) {
          let title = "";
          for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            const prev = lines[j].trim();
            if (prev && !prev.includes("作者") && !prev.includes("更新时间") && !prev.includes("赛季")) {
              title = prev;
              break;
            }
          }

          const parts = line.split("|");
          const authorMatch = parts[0].match(/作者[：:]\s*(.+)/);
          const author = authorMatch ? authorMatch[1].trim() : "未知";

          if (title) {
            buildsList.push({
              title,
              author,
              className: CLASS_CN_MAP[currentClass] || currentClass,
              tags: [],
              href: '',
              index: buildsList.length
            });
          }
        }
      }
      console.log(`   ✅ 从文本解析到 ${buildsList.length} 个BD`);
    }

    // 选择前几个BD进入详情页获取完整数据
    const buildsToCrawl = buildsList.slice(0, 3);
    const fullBuilds = [];

    for (const buildInfo of buildsToCrawl) {
      console.log(`\n4️⃣  抓取BD详情: ${buildInfo.title}`);

      try {
        // 如果有直接链接，访问详情页
        if (buildInfo.href) {
          const detailUrl = buildInfo.href.startsWith('http')
            ? buildInfo.href
            : `https://poe2.caimogu.cc${buildInfo.href}`;

          console.log(`   🔗 访问: ${detailUrl}`);
          await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        } else {
          // 否则尝试点击卡片
          console.log(`   🖱️ 点击卡片: ${buildInfo.index}`);
          const cards = await page.$$('[class*="card"], [class*="build-item"], [class*="bd-card"]');

          if (cards[buildInfo.index]) {
            await cards[buildInfo.index].click();
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            console.log("   ⚠️ 未找到卡片，跳过");
            continue;
          }
        }

        // 等待详情页加载
        await waitForVueRender(page);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 截图详情页
        await page.screenshot({
          path: path.join(__dirname, `../debug_detail_${buildInfo.index}.png`),
          fullPage: false
        });
        console.log(`   📸 详情页截图已保存`);

        // 提取详情数据
        const skillLinks = await extractSkillLinks(page);
        const equipment = await extractEquipment(page);
        const passiveTree = await extractPassiveTree(page);
        const levelingGuide = await extractLevelingGuide(page);

        console.log(`   📊 技能链接: ${skillLinks.length} 组`);
        console.log(`   📦 装备槽位: ${Object.keys(equipment).length} 个`);
        console.log(`   🌳 天赋节点: ${passiveTree.nodes.length} 个`);
        console.log(`   📝 升级流程: ${levelingGuide.length} 条`);

        // 检测职业
        let detectedClass = "Druid";
        if (buildInfo.title.includes("女巫")) detectedClass = "Witch";
        else if (buildInfo.title.includes("游侠")) detectedClass = "Ranger";
        else if (buildInfo.title.includes("战士") || buildInfo.title.includes("泰坦")) detectedClass = "Warrior";
        else if (buildInfo.title.includes("女术者") || buildInfo.title.includes("法师")) detectedClass = "Sorceress";
        else if (buildInfo.title.includes("德鲁伊")) detectedClass = "Druid";
        else if (buildInfo.title.includes("僧侣")) detectedClass = "Monk";
        else if (buildInfo.title.includes("佣兵")) detectedClass = "Mercenary";
        else if (buildInfo.title.includes("女猎手")) detectedClass = "Huntress";

        // 构建完整数据
        const fullBuild = {
          id: `CaiMoGu_${fullBuilds.length + 1}`,
          meta: {
            title: buildInfo.title,
            author: buildInfo.author,
            class: detectedClass,
            name: CLASS_CN_MAP[detectedClass] || detectedClass,
            tags: buildInfo.tags.length > 0 ? buildInfo.tags : ["热门", "社区推荐"]
          },
          // 技能连接数据
          skillLinks: skillLinks.length > 0 ? skillLinks : [
            { group: 1, gems: [{ name: "待补充", icon: "" }] }
          ],
          // 装备数据
          equipment: Object.keys(equipment).length > 0 ? equipment : { notes: "待补充" },
          // 天赋树
          passiveTree: passiveTree.nodes.length > 0 ? passiveTree : { points: 0, nodes: [] },
          // 升级流程
          levelingGuide: levelingGuide.length > 0 ? levelingGuide : [],
          // 来源信息
          source: {
            platform: "caimogu",
            originalAuthor: buildInfo.author
          }
        };

        fullBuilds.push(fullBuild);

        // 返回列表页
        console.log("   ↩️ 返回列表页...");
        await page.goBack();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await waitForVueRender(page);

      } catch (e) {
        console.log(`   ❌ 抓取失败: ${e.message}`);
        // 尝试返回列表页
        try {
          await page.goBack();
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (backErr) {
          console.log("   ⚠️ 返回列表页失败");
        }
      }
    }

    console.log(`\n✅ 共抓取 ${fullBuilds.length} 个完整BD`);

    // 保存数据
    const outputDir = path.join(__dirname, "../translated-data/release/miniprogram_data");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "community_full.json");
    fs.writeFileSync(outputPath, JSON.stringify(fullBuilds, null, 2));
    console.log(`💾 已保存到: ${outputPath}`);

    // 打印样例
    if (fullBuilds.length > 0) {
      console.log("\n📋 样例数据:");
      console.log(JSON.stringify(fullBuilds[0], null, 2).substring(0, 1000));
    }

    // 上传到OSS
    if (fullBuilds.length > 0) {
      console.log("\n5️⃣  上传到OSS...");
      const client = new OSS(OSS_CONFIG);
      await client.put("poe2-ladders/miniprogram_data/community_full.json", outputPath);
      console.log("   ✅ OSS上传成功!");
    }

    return fullBuilds;

  } catch (e) {
    console.error("❌ 爬虫失败:", e.message);

    try {
      await page.screenshot({ path: path.join(__dirname, "../debug_final_error.png"), fullPage: false });
    } catch (screenshotErr) {}

    throw e;
  } finally {
    await browser.close();
  }
}

// 直接运行
if (require.main === module) {
  crawlCaiMoGuBuildDetails()
    .then(() => console.log("\n✅ 完成!"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { crawlCaiMoGuBuildDetails };
