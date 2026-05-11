#!/usr/bin/env node
/**
 * poe.ninja 天梯爬虫 (纯 HTTP 版本)
 * 完全不依赖 Puppeteer，使用 poe.ninja 的 HTTP API 获取数据
 * 
 * 流程:
 *   1. 获取 Build ID（从 poe.ninja 页面 HTML 中提取）
 *   2. 获取职业列表（从 overview API）
 *   3. 获取每个职业的 Top N 玩家列表
 *   4. 通过 character API 获取每个玩家的详细数据
 *   5. 使用 base-data/dist/ 字典进行翻译
 *   6. 输出到 translated-data/{env}/
 * 
 * 用法:
 *   NODE_ENV=dev node crawlers/ninja-ladder/index.js
 *   NODE_ENV=production node crawlers/ninja-ladder/index.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../auto_browser/.env') });

const fs = require('fs');
const path = require('path');
const { getBuildId, fetchClassList, fetchPlayerList, fetchPlayerDetail } = require('./ninja_api');
const { translatePlayer } = require('./translator');
const { generateCommunityJSON } = require('./community');

// 环境配置
const isDev = process.env.NODE_ENV === 'dev';
const MAX_RANK = isDev ? 3 : 7;
const API_CONCURRENCY = 3;

const OUTPUT_DIR = isDev
  ? path.join(__dirname, '../../translated-data/dev')
  : path.join(__dirname, '../../translated-data/release');

const PLAYER_DIR = path.join(OUTPUT_DIR, 'players');

// 确保目录存在
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(PLAYER_DIR)) fs.mkdirSync(PLAYER_DIR, { recursive: true });

/**
 * 并发控制
 */
async function asyncPool(limit, items, fn) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.allSettled(results);
}

async function main() {
  console.log(`🚀 poe.ninja 天梯爬虫 (纯 HTTP)`);
  console.log(`   环境: ${isDev ? 'dev' : 'production'}`);
  console.log(`   抓取深度: ${MAX_RANK} 人/职业`);
  console.log(`   并发数: ${API_CONCURRENCY}`);
  console.log(`   输出目录: ${OUTPUT_DIR}`);
  console.log('');

  const startTime = Date.now();

  // 1. 获取 Build ID
  console.log('1️⃣  获取 Build ID...');
  const buildId = await getBuildId();
  console.log(`   ✅ Build ID: ${buildId}\n`);

  // 2. 获取职业列表
  console.log('2️⃣  获取职业列表...');
  const classList = await fetchClassList(buildId);
  console.log(`   ✅ ${classList.length} 个职业\n`);

  // 保存职业列表
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'classes.json'),
    JSON.stringify(classList, null, 2)
  );

  // 3. 获取每个职业的玩家列表
  console.log('3️⃣  获取玩家列表...');
  const allPlayers = {};
  for (const cls of classList) {
    const players = await fetchPlayerList(buildId, cls.name, MAX_RANK);
    allPlayers[cls.name] = players;
    console.log(`   ${cls.name}: ${players.length} 人`);
  }

  const totalPlayers = Object.values(allPlayers).reduce((sum, p) => sum + p.length, 0);
  console.log(`   📊 共 ${totalPlayers} 位玩家\n`);

  // 4. 获取玩家详情并翻译
  console.log('4️⃣  获取玩家详情 + 翻译...');
  const tasks = [];
  for (const [cls, players] of Object.entries(allPlayers)) {
    for (const player of players) {
      tasks.push({ cls, player });
    }
  }

  let successCount = 0;
  let failCount = 0;

  await asyncPool(API_CONCURRENCY, tasks, async ({ cls, player }) => {
    try {
      const rawData = await fetchPlayerDetail(buildId, player.account, player.name);
      if (!rawData) {
        failCount++;
        return;
      }

      // 翻译
      const translated = translatePlayer(rawData, player);

      // 保存玩家详情
      const safeAccount = (player.account || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = (player.name || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeAccount}_${safeName}.json`;
      fs.writeFileSync(
        path.join(PLAYER_DIR, fileName),
        JSON.stringify(translated, null, 2)
      );

      // 回写 detail 到 player 对象
      player.detail = translated;
      player.fileName = fileName;

      successCount++;
      if (successCount % 10 === 0) {
        console.log(`   进度: ${successCount}/${tasks.length}`);
      }
    } catch (err) {
      failCount++;
    }
  });

  console.log(`   ✅ 成功: ${successCount}, 失败: ${failCount}\n`);

  // 5. 保存天梯总览
  console.log('5️⃣  保存天梯数据...');
  const ladderData = {
    updateTime: new Date().toISOString(),
    buildId,
    ladders: allPlayers,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'all_ladders_translated.json'),
    JSON.stringify(ladderData, null, 2)
  );

  // 6. 生成 community.json
  console.log('6️⃣  生成 community.json...');
  const communityData = generateCommunityJSON(allPlayers, classList);
  const miniprogramDir = path.join(OUTPUT_DIR, 'miniprogram_data');
  if (!fs.existsSync(miniprogramDir)) fs.mkdirSync(miniprogramDir, { recursive: true });
  fs.writeFileSync(
    path.join(miniprogramDir, 'community.json'),
    JSON.stringify(communityData, null, 2)
  );
  console.log(`   ✅ ${communityData.length} 条 BD\n`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`🎉 天梯爬虫完成！耗时: ${elapsed}s`);
  console.log(`   玩家详情: ${PLAYER_DIR}/ (${successCount} 个文件)`);

  return OUTPUT_DIR;
}

// 导出供外部调用
module.exports = { runTask: main };

// 直接运行
if (require.main === module) {
  main().catch(err => {
    console.error('❌ 天梯爬虫失败:', err);
    process.exit(1);
  });
}
