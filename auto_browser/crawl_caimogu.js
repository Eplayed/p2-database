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

  // 设置 User-Agent
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  try {
    console.log("1️⃣  访问踩蘑菇网...");
    await page.goto(CAIMOGU_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

    // 等待 hash 路由变化生效
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 等待 BD 列表容器出现（通过特定文本内容）
    console.log("2️⃣  等待BD列表加载...");
    try {
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        return text.includes("千万血法") || text.includes("作者：");
      }, { timeout: 15000 });
      console.log("   ✅ BD列表已加载");
    } catch (e) {
      console.log("   ⚠️ 未检测到特定文本，尝试直接提取...");

      // 保存调试截图
      await page.screenshot({ path: path.join(__dirname, "../debug_page.png"), fullPage: false });
      console.log("   📸 已保存调试截图: debug_page.png");
    }

    // 等待足够时间让所有内容渲染
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 截图调试
    await page.screenshot({ path: path.join(__dirname, "../debug_before_parse.png"), fullPage: false });
    console.log("   📸 调试截图已保存");

    // 获取页面文本
    console.log("3️⃣  提取BD数据...");
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

      // BD行 - 检测作者行
      if (line.includes("作者：") && line.includes("|")) {
        // 找标题 - 在当前行之前找
        let title = "";
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const prev = lines[j].trim();
          if (prev && !prev.includes("作者") && !prev.includes("更新时间") && !prev.includes("赛季") && !prev.includes("登录")) {
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

        // 获取标签（检查当前行和后续几行）
        const tags = [];
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          const nl = lines[j].trim();
          if (nl === "升级") tags.push("升级");
          else if (nl === "攻坚") tags.push("攻坚");
          else if (nl === "硬核模式") tags.push("硬核");
          else if (nl === "独狼模式") tags.push("独狼");
        }

        // 找赛季信息
        let season = "";
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nl = lines[j].trim();
          if (nl.includes("赛季：")) {
            season = nl.replace("赛季：", "").trim();
            break;
          }
        }

        // 判断职业 - 从职业列表区域找
        let detectedClass = "Druid";
        if (title.includes("女巫")) detectedClass = "Witch";
        else if (title.includes("游侠")) detectedClass = "Ranger";
        else if (title.includes("战士") || title.includes("泰坦") || title.includes("Warrior")) detectedClass = "Warrior";
        else if (title.includes("女术者") || title.includes("法师") || title.includes("冰矛")) detectedClass = "Sorceress";
        else if (title.includes("德鲁伊")) detectedClass = "Druid";
        else if (title.includes("僧侣")) detectedClass = "Monk";
        else if (title.includes("佣兵")) detectedClass = "Mercenary";
        else if (title.includes("女猎手")) detectedClass = "Huntress";
        else if (CLASS_MAP[currentClass]) detectedClass = CLASS_MAP[currentClass];

        // 检测标签中的职业提示
        if (line.includes("血法") || line.includes("COC") || line.includes("诅咒")) detectedClass = "Witch";
        if (line.includes("亚马逊")) detectedClass = "Ranger";
        if (line.includes("骨牢") || line.includes("召唤")) detectedClass = "Witch";
        if (line.includes("冰矛")) detectedClass = "Ranger";
        if (line.includes("灰烬") || line.includes("泰坦")) detectedClass = "Warrior";

        const cls = detectedClass;

        if (title && !title.includes("BUILD模拟器") && !title.includes("选择职业")) {
          builds.push({
            id: `CaiMoGu_${builds.length + 1}`,
            meta: {
              title: title,
              author: author,
              class: cls,
              name: CLASS_CN_MAP[cls] || cls,
              tags: tags.length > 0 ? tags : ["热门"],
              season: season || "末裔德鲁伊"
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
        }

        if (builds.length >= 20) break;
      }
    }

    console.log(`   ✅ 解析到 ${builds.length} 条BD`);

    // 打印前几条
    if (builds.length > 0) {
      console.log("   📋 前3条BD:");
      builds.slice(0, 3).forEach((b, i) => {
        console.log(`      ${i + 1}. ${b.meta.title} (${b.meta.class}) - ${b.meta.author}`);
      });
    } else {
      console.log("   ⚠️ 未解析到任何BD，保存调试截图");
      // 打印部分页面文本
      console.log("   📄 页面文本片段（前2000字符）:");
      console.log(text.substring(0, 2000));
    }

    // 保存本地
    const outputDir = path.join(__dirname, "../translated-data/release/miniprogram_data");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "community.json");
    fs.writeFileSync(outputPath, JSON.stringify(builds, null, 2));
    console.log(`   💾 已保存到: ${outputPath}`);

    // 上传到OSS
    if (builds.length > 0) {
      console.log("4️⃣  上传到OSS...");
      const client = new OSS(OSS_CONFIG);
      await client.put("poe2-ladders/miniprogram_data/community.json", outputPath);
      console.log("   ✅ OSS上传成功!");
    } else {
      console.log("4️⃣  跳过OSS上传（无数据）");
    }

    return builds;
  } catch (e) {
    console.error("❌ 爬虫失败:", e.message);

    // 保存错误时的截图
    try {
      await page.screenshot({ path: path.join(__dirname, "../debug_error.png"), fullPage: false });
      console.log("   📸 错误截图已保存: debug_error.png");
    } catch (screenshotErr) {
      // ignore
    }

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