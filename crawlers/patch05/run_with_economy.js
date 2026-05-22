#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../auto_browser/.env') });

const { runEconomyTask } = require('../../auto_browser/crawl_economy');
const { main: runPatch05 } = require('./index');

async function main() {
  await runEconomyTask();
  await runPatch05();
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 0.5 经济数据刷新失败:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
