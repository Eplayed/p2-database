#!/usr/bin/env node
/**
 * 踩蘑菇网BD完整数据爬虫 - 抓取20条BD详情
 */

const puppeteer = require("puppeteer");
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

// 辅助技能关键词
const SUPPORT_KEYWORDS = [
  '高效', '范围集中', '元素集中', '多重范围施法', '快速施法',
  '持续时间延长', '能量保存', '范围扩大', '天顶', '残片效能',
  '灌输', '觉醒', '灌注', '赋能', '增效', '强化'
];

// 判断是否辅助技能
function isSupportSkill(name) {
  return SUPPORT_KEYWORDS.some(kw => name.includes(kw));
}

// 解析详情页数据
function parseDetailPage(text, url) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  const result = {
    meta: {
      title: '',
      author: '',
      class: 'Druid',
      name: '德鲁伊',
      tags: [],
      season: ''
    },
    intro: {
      desc: '',
      pros: ['社区热门推荐', '经过玩家验证'],
      cons: []
    },
    skills: [],
    equipment: {},
    source: {
      platform: 'caimogu',
      originalAuthor: '',
      updateTime: '',
      url: url
    }
  };

  // 解析标题（从 "作者：" 之前找）
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('作者：') || line.includes('作者:')) {
      // 往前找标题
      for (let j = i - 1; j >= 0; j--) {
        const prev = lines[j];
        if (prev && prev.length > 2 && prev.length < 50 &&
            !prev.includes('更新时间') && !prev.includes('选择职业')) {
          result.meta.title = prev;
          break;
        }
      }
      // 解析作者
      const authorMatch = line.match(/作者[：:]\s*(.+)/);
      if (authorMatch) {
        result.meta.author = authorMatch[1].trim();
        result.source.originalAuthor = authorMatch[1].trim();
      }
      // 解析时间
      const timeMatch = line.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (timeMatch) {
        result.source.updateTime = `${timeMatch[1]}年${timeMatch[2]}月${timeMatch[3]}日`;
      }
      break;
    }
  }

  // 解析职业
  for (const line of lines) {
    if (CLASS_MAP[line]) {
      result.meta.class = CLASS_MAP[line];
      result.meta.name = line;
      break;
    }
  }

  // 检测职业关键词
  const title = result.meta.title;
  if (title.includes('女巫') || title.includes('COC') || title.includes('COS')) {
    result.meta.class = 'Witch';
    result.meta.name = '女巫';
  } else if (title.includes('游侠') || title.includes('亚马逊')) {
    result.meta.class = 'Ranger';
    result.meta.name = '游侠';
  } else if (title.includes('战士') || title.includes('泰坦')) {
    result.meta.class = 'Warrior';
    result.meta.name = '战士';
  } else if (title.includes('女术者') || title.includes('法师')) {
    result.meta.class = 'Sorceress';
    result.meta.name = '女术者';
  } else if (title.includes('僧侣')) {
    result.meta.class = 'Monk';
    result.meta.name = '僧侣';
  } else if (title.includes('佣兵')) {
    result.meta.class = 'Mercenary';
    result.meta.name = '佣兵';
  } else if (title.includes('女猎手')) {
    result.meta.class = 'Huntress';
    result.meta.name = '女猎手';
  }

  // 解析标签
  for (const line of lines) {
    if (line === '升级' && !result.meta.tags.includes('升级')) {
      result.meta.tags.push('升级');
    } else if (line === '攻坚' && !result.meta.tags.includes('攻坚')) {
      result.meta.tags.push('攻坚');
    } else if (line === '硬核模式' && !result.meta.tags.includes('硬核')) {
      result.meta.tags.push('硬核');
    } else if (line === '独狼模式' && !result.meta.tags.includes('独狼')) {
      result.meta.tags.push('独狼');
    }
  }

  if (result.meta.tags.length === 0) {
    result.meta.tags.push('热门');
  }

  // 解析技能组
  let currentGroup = null;
  let groupIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跳过非技能行
    if (line.includes('作者') || line.includes('更新时间') ||
        line.includes('流派说明') || line.includes('BD说明') ||
        line.includes('装备') || line.includes('天赋') ||
        line.includes('升级指南') || line.includes('选择职业')) {
      continue;
    }

    // 检测技能组标题（残片、魔力、输出等）
    if (line.match(/^[A-Za-z\u4e00-\u9fa5]+残片$/) ||
        line.match(/^[A-Za-z\u4e00-\u9fa5]+魔力$/) ||
        line.match(/^[A-Za-z\u4e00-\u9fa5]+图腾$/) ||
        line.match(/^[A-Za-z\u4e00-\u9fa5]+诅咒$/) ||
        line.match(/^[A-Za-z\u4e00-\u9fa5]+药剂$/) ||
        line.match(/^[A-Za-z\u4e00-\u9fa5]+陷阱$/) ||
        line.match(/^[A-Za-z\u4e00-\u9fa5]+灵体$/) ||
        line.includes('输出') || line.includes('防御') ||
        line.includes('辅助')) {

      // 保存之前的技能组
      if (currentGroup && currentGroup.gems.length > 0) {
        const { mainSkills, supportSkills, links } = categorizeGems(currentGroup.gems);
        result.skills.push({
          groupName: currentGroup.name,
          groupIndex: ++groupIndex,
          mainSkills,
          supportSkills,
          links
        });
      }

      // 开始新技能组
      currentGroup = { name: line, gems: [] };
      continue;
    }

    // 收集宝石名（单行且不包含特殊字符）
    if (line.length >= 2 && line.length <= 20 &&
        !line.includes('：') && !line.includes(':') &&
        !line.includes('。') && !line.includes('。') &&
        !line.match(/^\d+$/) && !line.includes('|')) {

      // 过滤明显的非技能名
      if (!line.includes('作者') && !line.includes('时间') &&
          !line.includes('流派') && !line.includes('BD') &&
          !line.includes('模拟器') && !line.includes('下一页') &&
          !line.includes('上一页')) {

        if (currentGroup) {
          currentGroup.gems.push(line);
        }
      }
    }
  }

  // 保存最后一个技能组
  if (currentGroup && currentGroup.gems.length > 0) {
    const { mainSkills, supportSkills, links } = categorizeGems(currentGroup.gems);
    result.skills.push({
      groupName: currentGroup.name,
      groupIndex: ++groupIndex,
      mainSkills,
      supportSkills,
      links
    });
  }

  // 生成简介描述
  if (result.meta.title) {
    result.intro.desc = `来自踩蘑菇网的热门BD「${result.meta.title}」，${result.meta.name}职业。`;
  }

  // 生成ID
  const idBase = result.meta.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').substring(0, 10);
  result.id = `CaiMoGu_${idBase}_${Date.now().toString(36)}`;

  return result;
}

// 分类宝石为主技能和辅助技能
function categorizeGems(gems) {
  const mainSkills = [];
  const supportSkills = [];
  const links = [];

  for (const gem of gems) {
    if (isSupportSkill(gem)) {
      supportSkills.push(gem);
      links.push({ name: gem, isSupport: true });
    } else {
      mainSkills.push(gem);
      links.push({ name: gem, isSupport: false });
    }
  }

  return { mainSkills, supportSkills, links };
}

async function crawl() {
  console.log("🚀 踩蘑菇网BD完整数据爬虫 - 抓取20条...\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 3000 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  const builds = [];

  try {
    // 1. 访问社区BD列表
    console.log("1️⃣ 访问踩蘑菇社区BD列表...");
    await page.goto("https://poe2.caimogu.cc/planner#/plan/community-builds", {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    // 等待页面渲染
    console.log("   ⏳ 等待页面渲染 (8秒)...");
    await new Promise(resolve => setTimeout(resolve, 8000));

    await page.screenshot({ path: path.join(__dirname, "../community_list.png"), fullPage: false });
    console.log("   📸 列表页截图已保存");

    // 2. 获取BD卡片列表
    console.log("\n2️⃣ 获取BD列表...");

    // 从 DOM 获取所有可点击的 BD 卡片
    const bdCards = await page.evaluate(() => {
      const cards = document.querySelectorAll('.cmg-bg-intro, [class*="bg-intro"]');
      const results = [];

      cards.forEach((card, idx) => {
        const title = card.querySelector('.intro--title')?.innerText?.trim() || '';
        const author = card.querySelector('.hover-click')?.innerText?.trim() || '';

        if (title && !title.includes('选择职业') && title.length > 2) {
          // 获取卡片在页面中的索引位置
          const rect = card.getBoundingClientRect();
          results.push({
            idx,
            title,
            author,
            top: rect.top,
            left: rect.left
          });
        }
      });

      return results.slice(0, 25); // 获取前25个
    });

    console.log(`   ✅ 找到 ${bdCards.length} 个BD`);
    bdCards.slice(0, 5).forEach((b, i) => {
      console.log(`   ${i + 1}. ${b.title} (${b.author})`);
    });

    // 3. 逐个抓取详情页
    console.log("\n3️⃣ 开始抓取详情页...");

    for (let i = 0; i < Math.min(20, bdCards.length); i++) {
      const card = bdCards[i];
      console.log(`\n   [${i + 1}/20] ${card.title}...`);

      try {
        // 点击第 i 个 BD 卡片
        const clicked = await page.evaluate((idx) => {
          const cards = document.querySelectorAll('.cmg-bg-intro, [class*="bg-intro"]');
          if (cards[idx]) {
            cards[idx].click();
            return true;
          }
          return false;
        }, i);

        if (!clicked) {
          console.log(`      ⚠️ 无法点击卡片`);
          continue;
        }

        // 等待详情页加载
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 获取当前URL
        const currentUrl = page.url();

        // 提取详情页文本
        const detailText = await page.evaluate(() => document.body.innerText);

        // 解析数据
        const buildData = parseDetailPage(detailText, currentUrl);

        // 确保有标题
        if (!buildData.meta.title) {
          buildData.meta.title = card.title;
        }
        if (!buildData.meta.author) {
          buildData.meta.author = card.author;
          buildData.source.originalAuthor = card.author;
        }

        // 添加到结果
        builds.push(buildData);
        console.log(`      ✅ 解析成功 - 职业: ${buildData.meta.class}, 技能组: ${buildData.skills.length}`);

        // 返回列表页
        await page.goto("https://poe2.caimogu.cc/planner#/plan/community-builds", {
          waitUntil: "networkidle0",
          timeout: 30000
        });
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (e) {
        console.log(`      ❌ 抓取失败: ${e.message}`);
        // 尝试返回列表页
        try {
          await page.goto("https://poe2.caimogu.cc/planner#/plan/community-builds", {
            waitUntil: "networkidle0",
            timeout: 30000
          });
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (err) {
          console.log(`      ⚠️ 返回列表页失败`);
        }
      }
    }

    console.log(`\n✅ 共抓取 ${builds.length} 条BD数据`);

    // 4. 保存数据
    const outputDir = path.join(__dirname, "../translated-data/release/miniprogram_data");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "community.json");
    fs.writeFileSync(outputPath, JSON.stringify(builds, null, 2));
    console.log(`\n💾 数据已保存: ${outputPath}`);

    // 5. 打印统计
    console.log("\n📊 数据统计:");
    console.log(`   总BD数: ${builds.length}`);
    const classStats = {};
    builds.forEach(b => {
      const cls = b.meta.class;
      classStats[cls] = (classStats[cls] || 0) + 1;
    });
    Object.entries(classStats).forEach(([cls, count]) => {
      console.log(`   ${cls}: ${count}条`);
    });

    // 6. 上传到OSS (可选)
    if (builds.length > 0 && OSS_CONFIG.accessKeyId) {
      console.log("\n4️⃣ 上传到OSS...");
      const OSS = require("ali-oss");
      const client = new OSS(OSS_CONFIG);
      await client.put("poe2-ladders/miniprogram_data/community.json", outputPath);
      console.log("   ✅ OSS上传成功!");
    } else {
      console.log("\n4️⃣ 跳过OSS上传 (无数据或未配置)");
    }

    return builds;

  } catch (e) {
    console.error("❌ 爬虫失败:", e.message);
    await page.screenshot({ path: path.join(__dirname, "../crawl_error.png"), fullPage: false });
    throw e;
  } finally {
    await browser.close();
  }
}

// 运行
if (require.main === module) {
  crawl()
    .then(() => console.log("\n🎉 完成!"))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { crawl };
