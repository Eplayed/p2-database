require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const uploadAll = require('./upload_to_oss');
const { runNinjaEconomyDigest } = require('../crawlers/economy/ninja_digest');

async function runEconomyTask() {
  const data = await runNinjaEconomyDigest();

  if (require.main === module) {
    await uploadAll();
  }

  return data;
}

if (require.main === module) {
  runEconomyTask().catch(error => {
    console.error('\n❌ 汇率抓取失败:', error.message);
    process.exit(1);
  });
}

module.exports = { runEconomyTask };
