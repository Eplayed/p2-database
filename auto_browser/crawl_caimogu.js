#!/usr/bin/env node
/**
 * 从踩蘑菇网抓取热门BD并上传到OSS
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

async function crawlCaiMoGuBuilds() {
  console.log("🚀 启动踩蘑菇BD爬虫...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    console.log("1️⃣  访问踩蘑菇网...");
    await page.goto(CAIMOGU_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForTimeout(3000);

    // 滚动加载更多内容
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
    }

    // 获取页面文本
    console.log("2️⃣  提取BD数据...");
    const text = await page.evaluate(() => document.body.innerText);

    // 解析BD
    const lines = text.split("\n");
    const builds = [];
    let currentClass = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 职业行
      if (CLASS_MAP[line]) {
        currentClass = line;
        continue;
      }

      // BD行
      if (line.includes("作者") && line.includes("|")) {
        // 找标题
        let title = "";
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const prev = lines[j].trim();
          if (prev && !prev.includes("作者") && !prev.includes("更新时间") && !prev.includes("赛季")) {
            title = prev;
            break;
          }
        }

        // 解析作者和时间
        const parts = line.split("|");
        const authorMatch = parts[0].match(/作者[：:]\s*(.+)/);
        const author = authorMatch ? authorMatch[1].trim() : "未知";

        let updateTime = "";
        for (const p of parts.slice(1)) {
          if (p.includes("更新时间")) {
            updateTime = p.replace(/[^0-9年月日]/g, "");
          }
        }

        // 获取标签
        const tags = [];
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nl = lines[j].trim();
          if (nl === "升级") tags.push("升级");
          else if (nl === "攻坚") tags.push("攻坚");
          else if (nl === "硬核模式") tags.push("硬核");
          else if (nl === "独狼模式") tags.push("独狼");
        }

        const cls = CLASS_MAP[currentClass] || "Druid";

        builds.push({
          id: `CaiMoGu_${builds.length}`,
          meta: {
            title: title,
            author: author,
            class: cls,
            name: CLASS_CN_MAP[cls] || cls,
            tags: tags.length > 0 ? tags : ["热门"]
          },
          intro: {
            desc: title.substring(0, 100),
            pros: ["社区热门推荐", "经过玩家验证"],
            cons: ["具体效果因人而异"]
          },
          skills: [],
          keystones: [],
          equipment: { notes: `数据来源：踩蘑菇网 | 更新时间: ${updateTime}` },
          source: { updateTime, platform: "caimogu", originalAuthor: author }
        });

        if (builds.length >= 20) break;
      }
    }

    console.log(`   ✅ 解析到 ${builds.length} 条BD`);

    // 保存本地
    const outputDir = path.join(__dirname, "../translated-data/release/miniprogram_data");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "community.json");
    fs.writeFileSync(outputPath, JSON.stringify(builds, null, 2));
    console.log(`   💾 已保存到: ${outputPath}`);

    // 上传到OSS
    console.log("3️⃣  上传到OSS...");
    const client = new OSS(OSS_CONFIG);
    await client.put("poe2-ladders/miniprogram_data/community.json", outputPath);
    console.log("   ✅ OSS上传成功!");

    return builds;
  } catch (e) {
    console.error("❌ 爬虫失败:", e.message);
    throw e;
  } finally {
    await browser.close();
  }
}

// 直接运行
if (require.main === module) {
  crawlCaiMoGuBuilds()
    .then(() => console.log("\n✅ 完成!"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { crawlCaiMoGuBuilds };