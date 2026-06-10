const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');
const envConfig = require('../../auto_browser/env-config');

const OUTPUT_FILE = 'cn_market_digest.json';
const RAW_FILE = 'cn_market_raw.json';

const DD373_ITEMS = [
  {
    id: 'divine_orb',
    name: '神圣石',
    enName: 'Divine Orb',
    url: 'https://www.dd373.com/s-bcntax-c-n80v8p-h32hgr-fvdp4e.html',
    priority: 'core',
  },
  {
    id: 'exalted_orb',
    name: '崇高石',
    enName: 'Exalted Orb',
    url: 'https://www.dd373.com/s-bcntax-c-bkfnrd-h32hgr-fvdp4e.html',
    priority: 'core',
  },
  {
    id: 'chaos_orb',
    name: '混沌石',
    enName: 'Chaos Orb',
    url: 'https://www.dd373.com/s-bcntax-c-mxgtdd-h32hgr-fvdp4e.html',
    priority: 'core',
  },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function round(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function median(values) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  return numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
}

function normalizeHtmlText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decompressBody(buffer, encoding) {
  if (encoding === 'gzip') return zlib.gunzipSync(buffer);
  if (encoding === 'br') return zlib.brotliDecompressSync(buffer);
  if (encoding === 'deflate') return zlib.inflateSync(buffer);
  return buffer;
}

function requestText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept-Encoding': 'gzip, br, deflate',
        Referer: 'https://www.dd373.com/',
      },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < 3) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        requestText(nextUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          return;
        }
        try {
          resolve(decompressBody(body, res.headers['content-encoding']).toString('utf8'));
        } catch (error) {
          reject(new Error(`页面解压失败: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

function parseListings(text, itemName = '') {
  const startIndex = text.indexOf('商品信息');
  const sellerText = startIndex >= 0 ? text.slice(startIndex) : text;
  const listings = [];
  const quickRegex = /发货均时\s*(\d+)\s*分钟\s*1元=([\d.]+)\s*个\s*([\d.]+)\s*元\s*\/?\s*个[\s\S]{0,220}?库存数量：\s*([\d,]+)\s*个/g;
  let match;
  while ((match = quickRegex.exec(sellerText))) {
    const deliveryMinutes = Number(match[1]);
    const unitPerCny = Number(match[2]);
    const unitPriceCny = Number(match[3]);
    const stock = Number(String(match[4]).replace(/,/g, ''));
    if (!Number.isFinite(unitPerCny) || !Number.isFinite(unitPriceCny)) continue;
    if (unitPerCny <= 0 || unitPriceCny <= 0) continue;
    listings.push({
      deliveryMinutes,
      unitPerCny: round(unitPerCny, 4),
      unitPriceCny: round(unitPriceCny, 4),
      stock: Number.isFinite(stock) ? stock : null,
      listingType: 'quick',
    });
  }

  const itemPattern = itemName ? itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[^|]+';
  const normalRegex = new RegExp(
    `(\\d+)\\s*个=([\\d.]+)\\s*元[\\s\\S]{0,260}?游戏区服：\\s*降临\\s*/\\s*奥杜尔秘符赛季\\s*商品类型：\\s*${itemPattern}\\s*\\|\\s*库存：\\s*([\\d,]+)[\\s\\S]{0,260}?1元=([\\d.]+)\\s*个\\s*1个=([\\d.]+)\\s*元`,
    'g'
  );
  while ((match = normalRegex.exec(sellerText))) {
    const quantity = Number(match[1]);
    const totalPriceCny = Number(match[2]);
    const stock = Number(String(match[3]).replace(/,/g, ''));
    const unitPerCny = Number(match[4]);
    const unitPriceCny = Number(match[5]);
    if (!Number.isFinite(unitPerCny) || !Number.isFinite(unitPriceCny)) continue;
    if (unitPerCny <= 0 || unitPriceCny <= 0) continue;
    listings.push({
      deliveryMinutes: null,
      unitPerCny: round(unitPerCny, 4),
      unitPriceCny: round(unitPriceCny, 4),
      stock: Number.isFinite(stock) ? stock : null,
      quantity: Number.isFinite(quantity) ? quantity : null,
      totalPriceCny: Number.isFinite(totalPriceCny) ? round(totalPriceCny, 2) : null,
      listingType: 'normal',
    });
  }
  return listings;
}

function summarizeListings(listings) {
  const sorted = listings
    .filter(item => Number.isFinite(item.unitPriceCny) && item.unitPriceCny > 0)
    .sort((a, b) => a.unitPriceCny - b.unitPriceCny);
  const quoted = sorted.slice(0, 10);
  const topFive = sorted.slice(0, 5);
  const prices = topFive.map(item => item.unitPriceCny);
  const units = topFive.map(item => item.unitPerCny);
  const deliveryMinutes = sorted.map(item => item.deliveryMinutes).filter(Number.isFinite);

  return {
    sampleSize: listings.length,
    quotedSampleSize: quoted.length,
    bestUnitPriceCny: round(sorted[0]?.unitPriceCny, 4),
    medianUnitPriceCny: round(median(prices), 4),
    averageUnitPriceCny: round(mean(prices), 4),
    bestUnitPerCny: round(sorted[0]?.unitPerCny, 4),
    medianUnitPerCny: round(median(units), 4),
    averageUnitPerCny: round(mean(units), 4),
    minDeliveryMinutes: deliveryMinutes.length ? Math.min(...deliveryMinutes) : null,
    totalVisibleStock: sorted.reduce((sum, item) => sum + (Number.isFinite(item.stock) ? item.stock : 0), 0),
    confidence: listings.length >= 5 ? 'high' : listings.length >= 2 ? 'medium' : listings.length >= 1 ? 'low' : 'none',
    listings: quoted,
  };
}

async function fetchItem(item) {
  const html = await requestText(item.url);
  const text = normalizeHtmlText(html);
  const listings = parseListings(text, item.name);
  const summary = summarizeListings(listings);
  return {
    id: item.id,
    name: item.name,
    enName: item.enName,
    priority: item.priority,
    source: {
      name: 'DD373',
      url: item.url,
    },
    ...summary,
  };
}

async function waitRandomDelay() {
  const min = Number(process.env.DD373_DELAY_MIN_SECONDS || 0);
  const max = Number(process.env.DD373_DELAY_MAX_SECONDS || 0);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0) return 0;
  const lower = Math.max(0, Math.min(min, max));
  const upper = Math.max(lower, max);
  const seconds = Math.floor(lower + Math.random() * (upper - lower + 1));
  if (seconds <= 0) return 0;
  console.log(`   随机等待 ${seconds} 秒后开始抓取...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  return seconds;
}

async function runDD373Currency(options = {}) {
  const outputDir = options.outputDir || envConfig.dataDir;
  const minItemDelayMs = Number(process.env.DD373_ITEM_DELAY_MS || 1200);
  ensureDir(path.join(outputDir, 'miniprogram_data'));

  console.log('\n💴 DD373 国服通货行情');
  console.log('   游戏: 流放之路：降临');
  console.log('   区服: 奥杜尔秘符赛季');
  await waitRandomDelay();

  const items = [];
  for (const item of DD373_ITEMS) {
    process.stdout.write(`   抓取 ${item.name}... `);
    try {
      const result = await fetchItem(item);
      items.push(result);
      console.log(`${result.sampleSize} 条，最低 ${result.bestUnitPriceCny || '-'} 元/个`);
    } catch (error) {
      items.push({
        id: item.id,
        name: item.name,
        enName: item.enName,
        priority: item.priority,
        source: {
          name: 'DD373',
          url: item.url,
        },
        sampleSize: 0,
        confidence: 'none',
        error: error.message,
      });
      console.log(`失败: ${error.message}`);
    }

    if (minItemDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, minItemDelayMs));
    }
  }

  const updatedAt = new Date().toISOString();
  const digest = {
    schemaVersion: 1,
    updatedAt,
    source: {
      name: 'DD373',
      note: '公开商品列表聚合，仅作国服行情参考，不代表成交保证。',
    },
    game: {
      name: '流放之路：降临',
      league: '奥杜尔秘符赛季',
    },
    refreshPolicy: {
      recommendedIntervalMinutes: '10-20',
      cacheControlSeconds: 60,
    },
    summary: {
      itemCount: items.length,
      availableCount: items.filter(item => item.sampleSize > 0).length,
      highConfidenceCount: items.filter(item => item.confidence === 'high').length,
    },
    items,
  };

  const digestPath = path.join(outputDir, 'miniprogram_data', OUTPUT_FILE);
  fs.writeFileSync(digestPath, JSON.stringify(digest, null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), digestPath)}`);

  const rawPath = path.join(outputDir, RAW_FILE);
  fs.writeFileSync(rawPath, JSON.stringify({
    schemaVersion: 1,
    updatedAt,
    items,
  }, null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), rawPath)} (本地排查用，不上传 OSS)`);

  return digest;
}

if (require.main === module) {
  runDD373Currency().catch(error => {
    console.error('\n❌ DD373 国服行情更新失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  DD373_ITEMS,
  parseListings,
  summarizeListings,
  runDD373Currency,
};
