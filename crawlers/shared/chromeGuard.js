/**
 * Chrome 二进制自检与自愈（crawlers/shared/chromeGuard.js）
 *
 * 背景（2026-09-24 事故）：~/.cache/puppeteer 整个目录被清理，Chrome 二进制
 * （ver.127.0.6533.88）丢失。天梯爬虫（translate_crawler）与 POE1 天赋树截图
 * （capture_passive_trees）在每日管线里静默失败两天——原重试逻辑只是等待后重试，
 * 二进制不存在时重试必然全部失败。
 *
 * 用法：在 puppeteer.launch 之前调用 ensureChrome(puppeteer)。
 * - 未显式指定 CHROME_PATH / PUPPETEER_EXECUTABLE_PATH 时必调；
 * - 幂等：二进制存在时只做一次 existsSync，开销可忽略；
 * - 缺失时调用 puppeteer 自带 install.mjs 重新下载与本包版本匹配的 Chrome，
 *   安装过程日志透传到任务日志，失败时给出手动恢复命令。
 */
const fs = require('fs');
const { spawnSync } = require('child_process');

async function ensureChrome(puppeteer, log = console.log) {
  let executablePath = '';
  try {
    executablePath = puppeteer.executablePath();
  } catch (err) {
    // 未安装时 executablePath() 会抛 "Could not find Chrome (ver. x)"
    executablePath = '';
  }
  if (executablePath && fs.existsSync(executablePath)) return true;

  log('   🛠  检测到 Chrome 二进制缺失，自动重新安装（一次性，约 1-3 分钟）...');
  const installScript = require.resolve('puppeteer/install.mjs');
  const result = spawnSync(process.execPath, [installScript], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`   ❌ Chrome 自动安装失败（退出码 ${result.status}），请手动执行: npx puppeteer browsers install chrome`);
    return false;
  }
  try {
    return fs.existsSync(puppeteer.executablePath());
  } catch (err) {
    return false;
  }
}

module.exports = { ensureChrome };
