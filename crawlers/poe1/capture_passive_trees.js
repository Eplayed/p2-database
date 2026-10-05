#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { ensureChrome } = require('../shared/chromeGuard');
require('dotenv').config({ path: path.join(__dirname, '../../auto_browser/.env') });

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const dataDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const digestPath = path.join(dataDir, 'ladder_digest.json');
const outputDir = path.join(dataDir, 'passive-trees');
const passiveIconDir = path.join(dataDir, 'passive-icons');
const bucket = process.env.OSS_BUCKET || 'poe2-all-class';
const region = process.env.OSS_REGION || 'oss-cn-hangzhou';
const publicBaseUrl = (process.env.OSS_PUBLIC_BASE_URL || `https://${bucket}.${region}.aliyuncs.com`).replace(/\/+$/, '');
const remotePrefix = `poe1-season/${env}/miniprogram_data/passive-trees`;
const passiveIconRemotePrefix = `poe1-season/${env}/miniprogram_data/passive-icons`;
const TREE_PANEL_SELECTOR = '.relative.col-span-5.mb-0.p-6.lg\\:col-span-3.bg-coolgrey-1050';
const FULLSCREEN_PASSIVE_RE = /fullscreen-passive-skill-tree|poe\.game\.qq\.com/;

const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = args.includes('--all') ? Infinity : Number(limitArg ? limitArg.split('=')[1] : process.env.POE1_TREE_LIMIT || 30);
const force = args.includes('--force');
const delayArg = args.find((arg) => arg.startsWith('--delay='));
const delayMs = Number(delayArg ? delayArg.split('=')[1] : process.env.POE1_TREE_DELAY_MS || 1200);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readDigest() {
  if (!fs.existsSync(digestPath)) {
    throw new Error(`请先生成 POE1 天梯摘要: ${digestPath}`);
  }
  return JSON.parse(fs.readFileSync(digestPath, 'utf8'));
}

function writeDigest(data) {
  fs.writeFileSync(digestPath, `${JSON.stringify(data)}\n`);
}

/**
 * 摘要与 BD 详情拆成两份文件后，sourceUrl 和 keyPassives 只在 poe1_builds/{id}.json 里，
 * 截图结果却要让首屏也能直接用。这里统一成一套读写口径：
 * 读的时候把详情和摘要合成一个记录，写的时候两份都写。
 */
function detailPathOf(build) {
  if (!build || !build.detailFile) return '';
  return path.join(dataDir, build.detailFile);
}

function readBuildDetail(build) {
  const filePath = detailPathOf(build);
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`   详情文件读取失败 ${build.id}: ${error.message}`);
    return null;
  }
}

function loadBuildRecord(build) {
  const detail = readBuildDetail(build);
  if (!detail) return { ...build };
  return { ...detail, ...build };
}

function patchBuildDetail(build, patch) {
  const filePath = detailPathOf(build);
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    const detail = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    Object.assign(detail, patch);
    fs.writeFileSync(filePath, `${JSON.stringify(detail)}\n`);
    return true;
  } catch (error) {
    console.warn(`   详情文件写回失败 ${build.id}: ${error.message}`);
    return false;
  }
}

// 已截图的天赋树指纹。没有这份记录时，"文件已存在"只能按角色名判断，
// 玩家改了天赋也会一直显示旧图；有了指纹就能在树变化时自动重拍。
const TREE_INDEX_FILE = path.join(outputDir, 'index.json');

function readTreeIndex() {
  try {
    return JSON.parse(fs.readFileSync(TREE_INDEX_FILE, 'utf8'));
  } catch (error) {
    return {};
  }
}

function writeTreeIndex(index) {
  try {
    fs.writeFileSync(TREE_INDEX_FILE, JSON.stringify(index, null, 2));
  } catch (error) {
    console.warn(`   天赋截图索引写入失败: ${error.message}`)
  }
}

const treeIndex = readTreeIndex();

function makeImageFileName(build) {
  return `${String(build.id || `${build.account}-${build.character}`).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.jpg`;
}

function makePublicUrl(fileName) {
  return `${publicBaseUrl}/${remotePrefix}/${fileName}`;
}

function makePassiveIconFileName(passive) {
  const raw = passive.nameEn || passive.name || path.basename(String(passive.icon || ''), path.extname(String(passive.icon || '')));
  return `${String(raw).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.jpg`;
}

function makePassiveIconPublicUrl(fileName) {
  return `${publicBaseUrl}/${passiveIconRemotePrefix}/${fileName}`;
}

async function findTreeCanvas(page) {
  await page.waitForSelector('canvas', { timeout: 25000 });
  const preferred = await page.$(`${TREE_PANEL_SELECTOR} canvas`);
  if (preferred) return preferred;

  const canvases = await page.$$('canvas');
  let best = null;
  let bestArea = 0;
  for (const canvas of canvases) {
    const box = await canvas.boundingBox();
    if (!box) continue;
    const area = box.width * box.height;
    if (area > bestArea) {
      best = canvas;
      bestArea = area;
    }
  }
  return best;
}


async function findLargestCanvas(page) {
  const canvases = await page.$$('canvas');
  let best = null;
  let bestArea = 0;
  for (const canvas of canvases) {
    const box = await canvas.boundingBox();
    if (!box) continue;
    const area = box.width * box.height;
    if (area > bestArea) {
      best = canvas;
      bestArea = area;
    }
  }
  return best;
}

function applyTreeImage(build, publicUrl) {
  build.passiveTreeImage = publicUrl;
  patchBuildDetail(build, { passiveTreeImage: publicUrl });
}

async function captureOne(page, build, index, total) {
  const record = loadBuildRecord(build);
  const isFullscreenType = record.passiveTreeIsFullscreenPage || FULLSCREEN_PASSIVE_RE.test(record.passiveTreeUrl || '');
  if (isFullscreenType && !build.passiveTreeImage) {
    return captureOneFullscreenPage(page, build, index, total);
  }

  const fileName = makeImageFileName(build);
  const outputPath = path.join(outputDir, fileName);
  const publicUrl = makePublicUrl(fileName);

  const hash = String(record.passiveTreeHash || '');
  const known = treeIndex[fileName];
  const imageExists = fs.existsSync(outputPath);
  let imageMtimeMs = 0;
  try {
    if (imageExists) imageMtimeMs = fs.statSync(outputPath).mtimeMs;
  } catch (error) {
    imageMtimeMs = 0;
  }
  const buildUpdatedMs = Date.parse(record.buildUpdatedUtc || '') || 0;
  let canReuse = false;
  if (imageExists) {
    if (known) {
      // 有指纹记录：指纹一致才复用；老记录没指纹时沿用旧图
      canReuse = !hash || !known.hash || known.hash === hash;
    } else {
      // 没有指纹记录（换源前的老产物，或索引文件被清掉）：拿角色自己的改点时间兜底，
      // 图截在他最后一次改天赋之后才能沿用。只看文件在不在的话，索引一丢就再也发现不了树已经改了。
      canReuse = !buildUpdatedMs || buildUpdatedMs <= imageMtimeMs;
    }
  }
  if (!force && canReuse) {
    applyTreeImage(build, publicUrl);
    if (!known && hash) {
      treeIndex[fileName] = {
        hash,
        capturedAt: imageMtimeMs ? new Date(imageMtimeMs).toISOString() : new Date().toISOString()
      };
      writeTreeIndex(treeIndex);
    }
    console.log(`   ${index}/${total} 天赋未变，复用旧图 ${build.character}`);
    return 'reused';
  }
  if (hash && known && known.hash !== hash && imageExists) {
    console.log(`   ${index}/${total} 天赋已改，重拍 ${build.character}`);
  }
  const sourceUrl = build.sourceUrl || record.sourceUrl || '';
  if (!sourceUrl) {
    console.warn(`   ${index}/${total} 跳过 ${build.character}: 缺少 poe.ninja 链接`);
    return false;
  }

  await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => {
    const el = document.querySelector('.relative.col-span-5.mb-0.p-6.lg\\:col-span-3.bg-coolgrey-1050') || document.querySelector('canvas');
    if (el) el.scrollIntoView({ block: 'center', inline: 'center' });
  });
  await sleep(900);

  const canvas = await findTreeCanvas(page);
  if (!canvas) throw new Error('未找到天赋树 canvas');

  // poe.ninja 把 Open / Enlarge 两个按钮叠在天赋树右下角，截图会一起拍进来。
  // 必须在 canvas 出现之后再隐藏：按钮是跟树一起渲染的，早一步 DOM 里还没有。
  await page.evaluate(() => {
    const holder = document.querySelector('.absolute.right-8.bottom-8');
    if (holder) holder.style.display = 'none';
    Array.from(document.querySelectorAll('button')).forEach((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      if (text === 'open' || text === 'enlarge') el.style.display = 'none';
    });
  });
  await sleep(150);

  await canvas.screenshot({
    path: outputPath,
    type: 'jpeg',
    quality: 82,
    omitBackground: false
  });

  applyTreeImage(build, publicUrl);
  if (hash) {
    treeIndex[fileName] = { hash, capturedAt: new Date().toISOString() };
    writeTreeIndex(treeIndex);
  }
  console.log(`   ${index}/${total} 截图完成 ${build.character}`);
  return true;
}


async function captureOneFullscreenPage(page, build, index, total) {
  const record = loadBuildRecord(build);
  const fileName = makeImageFileName(build);
  const outputPath = path.join(outputDir, fileName);
  const publicUrl = makePublicUrl(fileName);

  if (!force && fs.existsSync(outputPath)) {
    applyTreeImage(build, publicUrl);
    delete build.passiveTreeIsFullscreenPage;
    console.log(`   ${index}/${total} 已存在 [国服全屏天赋] ${build.character}`);
    return true;
  }
  const treeUrl = build.passiveTreeUrl || record.passiveTreeUrl || '';
  const isFullscreen = build.passiveTreeIsFullscreenPage || record.passiveTreeIsFullscreenPage || FULLSCREEN_PASSIVE_RE.test(treeUrl);
  if (!isFullscreen || !treeUrl) {
    console.warn(`   ${index}/${total} 跳过 [国服全屏天赋] ${build.character}: 条件不匹配或缺少 passiveTreeUrl`);
    return false;
  }

  await page.goto(treeUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);

  const canvas = await findLargestCanvas(page);
  if (!canvas) throw new Error('国服全屏天赋未找到最大 canvas');

  await canvas.screenshot({
    path: outputPath,
    type: 'jpeg',
    quality: 82,
    omitBackground: false
  });

  applyTreeImage(build, publicUrl);
  delete build.passiveTreeIsFullscreenPage;
  console.log(`   ${index}/${total} 截图完成 [国服全屏天赋] ${build.character}`);
  return true;
}

async function cachePassiveIcon(page, passive) {
  const iconUrl = passive.icon || '';
  if (!/^https?:\/\//.test(iconUrl) || iconUrl.startsWith(`${publicBaseUrl}/${passiveIconRemotePrefix}/`)) {
    return Boolean(iconUrl);
  }

  const fileName = makePassiveIconFileName(passive);
  const outputPath = path.join(passiveIconDir, fileName);
  const publicUrl = makePassiveIconPublicUrl(fileName);
  if (fs.existsSync(outputPath) && !force) {
    passive.icon = publicUrl;
    return true;
  }

  await page.setViewport({ width: 96, height: 96, deviceScaleFactor: 2 });
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          body { margin: 0; width: 96px; height: 96px; display: flex; align-items: center; justify-content: center; background: #0b0d10; }
          img { max-width: 88px; max-height: 88px; object-fit: contain; }
        </style>
      </head>
      <body><img id="icon" src="${iconUrl.replace(/"/g, '&quot;')}" /></body>
    </html>
  `, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const image = document.querySelector('#icon');
    return image && image.complete && image.naturalWidth > 0;
  }, { timeout: 15000 });
  const image = await page.$('#icon');
  await image.screenshot({
    path: outputPath,
    type: 'jpeg',
    quality: 86,
    omitBackground: false
  });
  passive.icon = publicUrl;
  return true;
}

async function cachePassiveIcons(digest, browser) {
  fs.mkdirSync(passiveIconDir, { recursive: true });
  const page = await browser.newPage();
  const seen = new Map();
  // 拆分后关键天赋只存在 BD 详情文件里，先按 BD 取出来再全局去重
  const passivesByBuild = new Map();
  for (const build of digest.builds || []) {
    const inDigest = Array.isArray(build.keyPassives) ? build.keyPassives : [];
    const passives = inDigest.length ? inDigest : loadBuildRecord(build).keyPassives || [];
    if (!Array.isArray(passives) || !passives.length) continue;
    passivesByBuild.set(String(build.id), passives);
    for (const passive of passives) {
      if (!passive.icon) continue;
      const key = passive.nameEn || passive.name || passive.icon;
      if (!seen.has(key)) seen.set(key, passive);
    }
  }

  let ok = 0;
  let failed = 0;
  for (const passive of seen.values()) {
    try {
      if (await cachePassiveIcon(page, passive)) ok += 1;
    } catch (error) {
      failed += 1;
      console.warn(`   关键天赋图标失败 ${passive.nameEn || passive.name}: ${error.message}`);
    }
  }
  await page.close();

  const iconUrlByKey = new Map(Array.from(seen.values()).map((passive) => [passive.nameEn || passive.name || passive.icon, passive.icon]));
  for (const build of digest.builds || []) {
    const passives = passivesByBuild.get(String(build.id)) || (Array.isArray(build.keyPassives) ? build.keyPassives : []);
    let changed = false;
    for (const passive of passives) {
      const nextIcon = iconUrlByKey.get(passive.nameEn || passive.name || passive.icon);
      if (nextIcon && passive.icon !== nextIcon) {
        passive.icon = nextIcon;
        changed = true;
      }
    }
    // 详情文件才是真正给前端读的那一份
    if (changed) patchBuildDetail(build, { keyPassives: passives });
  }
  digest.passiveIconImages = {
    updatedAt: new Date().toISOString(),
    cached: ok,
    failed,
    prefix: `${publicBaseUrl}/${passiveIconRemotePrefix}/`
  };
  console.log(`✅ POE1 关键天赋图标缓存完成: ${ok} 成功，${failed} 失败`);
}

async function capturePassiveTrees() {
  const digest = readDigest();
  const builds = Array.isArray(digest.builds) ? digest.builds : [];
  const targets = builds.slice(0, Number.isFinite(limit) ? Math.max(0, limit) : builds.length);
  if (!targets.length) throw new Error('ladder_digest.json 中没有可截图的 BD');

  fs.mkdirSync(outputDir, { recursive: true });
  console.log('═'.repeat(60));
  console.log('  POE1 天赋树截图');
  console.log('═'.repeat(60));
  console.log(`   环境: ${env}`);
  console.log(`   目标: ${Number.isFinite(limit) ? targets.length : '全部'} / ${builds.length}`);
  console.log(`   输出: ${outputDir}`);

  await ensureChrome(puppeteer);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=1440,1100'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
  });

  let ok = 0;
  let failed = 0;
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const build = targets[index];
      let success = false;
      try {
        const isFullscreenType = build.passiveTreeIsFullscreenPage || FULLSCREEN_PASSIVE_RE.test(build.passiveTreeUrl || '');
        success = isFullscreenType
          ? await captureOneFullscreenPage(page, build, index + 1, targets.length)
          : await captureOne(page, build, index + 1, targets.length);
        if (success) ok += 1;
      } catch (error) {
        failed += 1;
        console.warn(`   ${index + 1}/${targets.length} 失败 ${build.character}: ${error.message}`);
      }
      // 复用旧图没访问上游，不需要节流；只有真截了图才要隔开
      if (delayMs > 0 && success !== 'reused') await sleep(delayMs);
      writeDigest(digest);
    }
    await cachePassiveIcons(digest, browser);
  } finally {
    await browser.close();
  }

  digest.passiveTreeImages = {
    updatedAt: new Date().toISOString(),
    captured: ok,
    failed,
    limit: Number.isFinite(limit) ? limit : 'all',
    prefix: `${publicBaseUrl}/${remotePrefix}/`
  };
  writeDigest(digest);
  console.log(`✅ POE1 天赋树截图完成: ${ok} 成功，${failed} 失败`);
  return digest;
}

if (require.main === module) {
  capturePassiveTrees().catch((error) => {
    console.error('❌ POE1 天赋树截图失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { capturePassiveTrees };
