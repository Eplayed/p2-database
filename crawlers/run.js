#!/usr/bin/env node
/**
 * PoE2 数据爬虫 - 统一入口（v3.1）
 *
 * 单版本爬虫：使用 Puppeteer 从 poe.ninja 页面直接抓取数据。
 * 已移除已废弃的 v2 HTTP API 爬虫（poe.ninja REST API 已下线）。
 *
 * 用法:
 *   node crawlers/run.js                    # 天梯爬虫 + 上传（默认）
 *   node crawlers/run.js --all              # 字典 + 天梯 + 天赋树截图 + 上传
 *   node crawlers/run.js --dict             # 只更新翻译字典
 *   node crawlers/run.js --ladder           # 只运行天梯爬虫
 *   node crawlers/run.js --trees            # 只运行天赋树截图
 *   node crawlers/run.js --essence          # 只运行踩蘑菇精华帖爬虫
 *   node crawlers/run.js --hot              # 只运行热门BD爬虫
 *   node crawlers/run.js --upload           # 只上传数据到 OSS
 *
 * 组合用法:
 *   node crawlers/run.js --dict --ladder   # 字典 + 天梯（不上传）
 *   node crawlers/run.js --ladder --trees  # 天梯 + 截图（不上传）
 *
 * 环境变量:
 *   NODE_ENV=dev          开发模式（输出到 translated-data/dev/）
 *   NODE_ENV=production   生产模式（输出到 translated-data/release/）
 */

require('dotenv').config({ path: require('path').join(__dirname, '../auto_browser/.env') });

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const flags = {
  dict: args.includes('--dict'),
  ladder: args.includes('--ladder'),
  trees: args.includes('--trees'),
  upload: args.includes('--upload'),
  all: args.includes('--all'),
  essence: args.includes('--essence'),
  hot: args.includes('--hot'),
  help: args.includes('--help') || args.includes('-h'),
};

// --all 展开为全部步骤
if (flags.all) {
  flags.dict = true;
  flags.ladder = true;
  flags.trees = true;
  flags.upload = true;
}

if (flags.help) {
  console.log(`\n🔧 PoE2 数据爬虫 v3.1 - 统一入口\n\n用法: node crawlers/run.js [选项]\n\n选项:\n  --dict        更新翻译字典 (从 poe2db.tw/cn 抓取)\n  --ladder      运行天梯爬虫 (Puppeteer, poe.ninja 页面抓取)\n  --trees       天赋树截图 (Puppeteer, 需要浏览器)\n  --upload      上传数据到 OSS\n  --all          运行全部 (字典 + 天梯 + 截图 + 上传)\n  --essence     踩蘑菇精华帖爬虫\n  --hot          热门BD爬虫\n  --help, -h    显示帮助\n\n默认行为 (无参数): 天梯爬虫 + 上传\n\n示例:\n  node crawlers/run.js --all                        # 完整流程\n  node crawlers/run.js --dict                       # 只更新字典\n  node crawlers/run.js --ladder --trees             # 天梯 + 天赋树截图\n  NODE_ENV=dev node crawlers/run.js --ladder        # 开发模式\n  `);
  process.exit(0);
}

// 默认：天梯 + 上传
if (!flags.dict && !flags.ladder && !flags.trees && !flags.upload && !flags.essence && !flags.hot) {
  flags.ladder = true;
  flags.upload = true;
}

// 路径配置
const isDev = process.env.NODE_ENV === 'dev';
const OUTPUT_DIR = isDev
  ? path.join(__dirname, '../translated-data/dev')
  : path.join(__dirname, '../translated-data/release');

// ========== 工具函数 ==========

async function runAsync(fn, label) {
  console.log('\n' + '━'.repeat(60));
  console.log(`  ${label}`);
  console.log('━'.repeat(60));
  const t0 = Date.now();
  try {
    await fn();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ✅ 完成 (${elapsed}s)\n`);
  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}`);
    throw err;
  }
}

function runSpawn(scriptPath, label) {
  return new Promise((resolve, reject) => {
    console.log('\n' + '━'.repeat(60));
    console.log(`  ${label}`);
    console.log('━'.repeat(60));
    const t0 = Date.now();
    const child = spawn('node', [scriptPath], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('close', (code) => {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`  ✅ 完成 (${elapsed}s)\n`);
        resolve();
      } else {
        reject(new Error(`${label} 失败，退出码: ${code}`));
      }
    });
  });
}

// ========== Step 1: 翻译字典 ==========

async function runDict() {
  const { main: runDict } = require('./poe2db-dict/index');
  await runDict();
}

// ========== Step 2: 天梯爬虫 ==========
// 使用 Puppeteer 从 poe.ninja 页面抓取（v1 方案）
// v2 HTTP API 已废弃（poe.ninja REST API 已下线）

async function runLadder() {
  const scriptPath = path.join(__dirname, '../auto_browser/translate_crawler.js');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`天梯爬虫脚本不存在: ${scriptPath}`);
  }
  await runSpawn(scriptPath, '🏆 Step 2: 天梯爬虫 (Puppeteer)');
}

// ========== Step 3: 天赋树截图 ==========

async function runTrees() {
  // capture_trees.js 是独立 Puppeteer 脚本，用 spawn 调用
  const scriptPath = path.join(__dirname, 'ninja-ladder/capture_trees.js');
  if (!fs.existsSync(scriptPath)) {
    console.warn('  ⚠️  capture_trees.js 不存在，跳过天赋树截图');
    return;
  }
  await runSpawn(scriptPath, '📸 天赋树截图 (Puppeteer)');
}

// ========== Step 4: OSS 上传 ==========

async function runUpload() {
  const uploadAll = require('../auto_browser/upload_to_oss');
  await uploadAll();
}

// ========== Step 5: 踩蘑菇精华帖 ==========

async function runEssence() {
  const { crawlEssencePosts } = require('../auto_browser/crawl_caimogu_essence_full');
  const result = await crawlEssencePosts();
  console.log(`  ✅ 精华帖爬虫完成: ${result.length} 条数据`);

  // 转换数据格式
  console.log('  🔄 转换精华帖数据格式...');
  const transform = require('../auto_browser/transform_caimogu_data');
  await transform();
  console.log('  ✅ 数据转换完成');
}

// ========== Step 6: 热门BD ==========

async function runHot() {
  const { crawlHotBuilds } = require('../auto_browser/crawl_hot_builds');
  await crawlHotBuilds();
  console.log('  ✅ 热门BD爬虫完成');
}

// ========== 主流程 ==========

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  PoE2 数据爬虫 v3.0 - 统一入口');
  console.log('═'.repeat(60));
  console.log(`  环境: ${isDev ? 'dev' : 'production'}`);
  console.log(`  输出: ${OUTPUT_DIR}`);
  console.log(`  任务: ${[
    flags.dict && '字典更新',
    flags.ladder && '天梯爬虫',
    flags.trees && '天赋树截图',
    flags.upload && 'OSS上传',
    flags.essence && '精华帖',
    flags.hot && '热门BD',
  ].filter(Boolean).join(' → ')}`);
  console.log('═'.repeat(60));
  console.log('');

  const startTime = Date.now();

  try {
    if (flags.dict) {
      await runAsync(runDict, '📚 Step 1: 更新翻译字典 (poe2db.tw/cn)');
    }

    if (flags.ladder) {
      await runAsync(runLadder, '🏆 Step 2: 天梯爬虫 (Puppeteer)');
    }

    if (flags.trees) {
      await runAsync(runTrees, '📸 Step 3: 天赋树截图 (Puppeteer)');
    }

    if (flags.upload) {
      await runAsync(runUpload, '☁️  Step 4: 上传到 OSS');
    }

    if (flags.essence) {
      await runAsync(runEssence, '📜 Step 5: 踩蘑菇精华帖爬虫');
    }

    if (flags.hot) {
      await runAsync(runHot, '🔥 Step 6: 热门BD爬虫');
    }

    // 天梯数据分析（如果跑了天梯）
    // aggregate_analysis.js 和 upload_analysis.js 内含 process.exit()
    // 必须用 spawn 调用，不能用 require()
    if (flags.ladder || flags.all) {
      try {
        await runSpawn('scripts/aggregate_analysis.js', '📊 天梯数据分析');
      } catch (e) {
        console.warn('  ⚠️  分析跳过:', e.message);
      }

      if (flags.upload || flags.all) {
        try {
          await runSpawn('scripts/upload_analysis.js', '☁  上传分析数据到 OSS');
        } catch (e) {
          console.warn('  ⚠️  分析数据上传跳过:', e.message);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ✅ 全部完成！总耗时: ${elapsed}s`);
    console.log('═'.repeat(60));

  } catch (err) {
    console.error('\n❌ 执行失败:', err.message);
    if (err.stack && process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// 导出供 GitHub Actions 调用
module.exports = { main };

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 未捕获错误:', err);
    process.exit(1);
  });
}
