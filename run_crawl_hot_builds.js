#!/usr/bin/env node
/**
 * 热门BD爬虫入口脚本
 * 整合 crawl_caimogu.js，从 .env 读取 OSS 配置
 */

require("dotenv").config({ path: __dirname + "/auto_browser/.env" });

const { crawlCaiMoGuBuilds } = require("./auto_browser/crawl_caimogu");

async function main() {
  console.log("=".repeat(50));
  console.log("🔥 热门BD爬虫启动...");
  console.log("=".repeat(50));

  try {
    const builds = await crawlCaiMoGuBuilds();
    console.log(`\n✅ 成功抓取 ${builds.length} 条BD数据`);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ 爬虫执行失败:", error.message);
    process.exit(1);
  }
}

main();
