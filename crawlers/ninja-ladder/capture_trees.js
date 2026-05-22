#!/usr/bin/env node
/**
 * 天赋树截图脚本 v3
 * 
 * 策略：首次运行浏览器让你手动登录 → 保存 cookie 到本地文件
 *       后续运行直接注入 cookie，无需每次登录
 * 
 * 用法:
 *   node crawlers/ninja-ladder/capture_trees.js [--limit N] [--dry-run]
 * 
 * 首次运行步骤：
 *   1. 脚本打开 Chromium 浏览器窗口
 *   2. 你手动在窗口里登录 poe.ninja
 *   3. 登录成功后按回车，脚本保存 cookie
 *   4. 开始截图
 * 
 * 后续运行：直接注入保存的 cookie，自动跳过登录
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PLAYER_DIR = path.join(__dirname, '../../translated-data/release/players');
const OUTPUT_DIR = PLAYER_DIR;
const COOKIE_FILE = path.join(__dirname, 'poe_ninja_cookies.json');
const LEAGUE = 'fate-of-the-vaal';
const VIEWPORT = { width: 1600, height: 1000 };

// 解析参数
const args = process.argv.slice(2);
const limit = parseInt(args.find(a => a.startsWith('--limit'))?.split('=')[1]) || Infinity;
const dryRun = args.includes('--dry-run');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 等待用户按回车
 */
function waitForEnter(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * 保存 cookies 到文件
 */
async function saveCookies(page) {
  const cookies = await page.cookies('https://poe.ninja', 'https://www.poe.ninja');
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`   ✅ Cookies 已保存到: ${COOKIE_FILE}`);
}

/**
 * 加载并注入 cookies
 */
async function loadAndInjectCookies(page) {
  if (!fs.existsSync(COOKIE_FILE)) return false;
  const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
  await page.setCookie(...cookies);
  console.log(`   ✅ 注入了 ${cookies.length} 个 cookies`);
  return true;
}

/**
 * 检查登录状态
 */
async function checkLogin(page) {
  await page.goto('https://poe.ninja/poe2/builds/vaal', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  const result = await page.evaluate(() => {
    // 检查是否有登录按钮
    const loginLinks = Array.from(document.querySelectorAll('a')).filter(a => 
      (a.href && a.href.includes('login')) || 
      (a.textContent && a.textContent.toLowerCase().includes('login'))
    );
    // 检查是否有用户相关元素
    const userElem = document.querySelector('[class*="user"]') || 
                   document.querySelector('[class*="account"]') ||
                   document.querySelector('button[class*="avatar"]');
    return {
      needsLogin: loginLinks.length > 0 && !userElem,
      url: location.href,
      title: document.title,
    };
  });

  return !result.needsLogin;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  天赋树截图脚本 v3');
  console.log('═'.repeat(60));
  console.log(`  玩家目录: ${PLAYER_DIR}`);
  console.log(`  限制数量: ${limit === Infinity ? '全部' : limit}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log('');

  // 读取玩家文件
  const files = fs.readdirSync(PLAYER_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('_tree'))
    .slice(0, limit);

  console.log(`📊 找到 ${files.length} 个玩家文件\n`);

  if (dryRun) {
    console.log('📋 将处理以下文件:');
    files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(0);
  }

  // 启动浏览器（headless=false 方便手动登录）
  console.log('🚀 启动 Chromium...');
  const browser = await puppeteer.launch({
    headless: false,  // 首次需要看到窗口
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=1400,900',
    ],
  });

  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport(VIEWPORT);

  // 反检测
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });

  // 检查是否需要登录
  const hasCookieFile = fs.existsSync(COOKIE_FILE);
  let isLoggedIn = false;

  if (hasCookieFile) {
    console.log('🍪 找到保存的 cookies，尝试注入...');
    await loadAndInjectCookies(page);
    isLoggedIn = await checkLogin(page);
    if (isLoggedIn) {
      console.log('✅ 登录状态有效！\n');
    } else {
      console.log('⚠️  登录状态已失效，需要重新登录\n');
    }
  }

  // 需要手动登录
  if (!hasCookieFile || !isLoggedIn) {
    console.log('👤 请在弹出的浏览器窗口中完成以下操作:');
    console.log('   1. 打开 https://poe.ninja/poe2/builds/vaal');
    console.log('   2. 点击登录（用 Google 账号）');
    console.log('   3. 登录成功后，回到终端按回车\n');

    await page.goto('https://poe.ninja/poe2/builds/vaal', { waitUntil: 'networkidle2', timeout: 60000 });

    await waitForEnter('登录完成后，按回车继续...');

    // 验证登录
    isLoggedIn = await checkLogin(page);
    if (!isLoggedIn) {
      console.log('❌ 登录验证失败，请重试');
      await browser.close();
      process.exit(1);
    }

    // 保存 cookies
    await saveCookies(page);
    console.log('');
  }

  // 切到 headless 模式截图（速度更快）
  console.log('📸 开始截图天赋树...\n');
  console.log('═'.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    console.log(`\n[${i + 1}/${files.length}] ${fileName}`);

    try {
      const filePath = path.join(PLAYER_DIR, fileName);
      const player = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const match = fileName.match(/^(.+)-(\d+)_(.+)\.json$/);
      if (!match) {
        console.log('   ⚠️  文件名格式异常，跳过');
        failCount++;
        continue;
      }

      const account = match[1];
      const charName = match[3];
      const url = `https://poe.ninja/poe2/builds/${LEAGUE}/${account}/${charName}`;

      console.log(`   URL: ${url}`);

      // 打开角色页
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(2000);

      // 检查是否被 Cloudflare 拦截
      const isBlocked = await page.evaluate(() => {
        return document.title.includes('Just a moment') ||
               !!document.querySelector('#challenge-stage') ||
               !!document.querySelector('[id*="challenge"]');
      });

      if (isBlocked) {
        console.log('   ⚠️  Cloudflare 拦截，等待绕过...');
        await sleep(8000);
      }

      // 等待 canvas 出现
      let canvasFound = false;
      for (let retry = 0; retry < 10; retry++) {
        canvasFound = await page.evaluate(() => {
          const canvas = document.querySelector('canvas[data-tooltip-canvas="true"]');
          return canvas && canvas.width > 0 && canvas.height > 0;
        });
        if (canvasFound) break;
        await sleep(1000);
      }

      if (!canvasFound) {
        console.log('   ❌ 未找到天赋树 canvas');
        failCount++;
        continue;
      }

      // 截图
      const canvas = await page.$('canvas[data-tooltip-canvas="true"]');
      const treeFileName = `${account}-${charName}_tree.jpg`;
      const outputPath = path.join(OUTPUT_DIR, treeFileName);

      await canvas.screenshot({ path: outputPath, type: 'jpeg', quality: 80 });

      // 更新 player JSON
      player.passiveTreeImageUrl = `players/${treeFileName}`;
      fs.writeFileSync(filePath, JSON.stringify(player, null, 2));

      console.log(`   ✅ 截图已保存: ${treeFileName}`);
      successCount++;

      await sleep(1500);

    } catch (err) {
      console.log(`   ❌ 失败: ${err.message}`);
      failCount++;
    }
  }

  await browser.close();

  console.log('\n' + '═'.repeat(60));
  console.log(`  🎉 完成！成功: ${successCount}, 失败: ${failCount}`);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('❌ 执行失败:', err);
  process.exit(1);
});
