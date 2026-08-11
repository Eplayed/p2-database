const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const FILTEREDITOR_API = 'https://api.filtereditor.cn/prod/system/getPriceJson?id=2';
const FILTEREDITOR_PAGE = 'https://price.filtereditor.cn/';
const DD373_PAGE = 'https://www.dd373.com/';
const DD373_GAME_AREA = '夺神之权';
const DD373_LEAGUE = 'S30永火之咒';
const DD373_ITEMS = [
  { id: 'divine_orb', name: '神圣石', nameEn: 'Divine Orb', code: '1r08bv', priority: 'core' },
  { id: 'chaos_orb', name: '混沌石', nameEn: 'Chaos Orb', code: 't3avtw', priority: 'core' },
  { id: 'exalted_orb', name: '崇高石', nameEn: 'Exalted Orb', code: 'f25596', priority: 'core' },
  { id: 'vaal_orb', name: '瓦尔宝珠', nameEn: 'Vaal Orb', code: 'ubhcwh', priority: 'core' },
  { id: 'gemcutters_prism', name: '宝石匠的棱镜', nameEn: "Gemcutter's Prism", code: '5mhjef', priority: 'core' },
  { id: 'orb_of_annulment', name: '剥离石', nameEn: 'Orb of Annulment', code: '9t3pgk', priority: 'core' },
  { id: 'mirror_of_kalandra', name: '卡兰德的魔镜', nameEn: 'Mirror of Kalandra', code: 'fnm1qf', priority: 'core' },
  { id: 'orb_of_alchemy', name: '点金石', nameEn: 'Orb of Alchemy', code: 'bk757e', priority: 'common' },
  { id: 'orb_of_fusing', name: '链结石', nameEn: 'Orb of Fusing', code: 'sqsr19', priority: 'common' },
  { id: 'orb_of_regret', name: '后悔石', nameEn: 'Orb of Regret', code: 'rfre7m', priority: 'common' }
];
const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const outputDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const outputPath = path.join(outputDir, 'cn_economy_digest.json');

const CURRENT_CN_LEAGUE = {
  name: 's30',
  displayName: '永火之咒'
};
const manualPath = process.env.POE1_CN_ECONOMY_MANUAL
  ? path.resolve(process.env.POE1_CN_ECONOMY_MANUAL)
  : path.join(__dirname, '../../base-data/poe1/cn_economy_manual.json');

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function formatValue(value) {
  if (value >= 1000) return `${round(value / 1000, 2)}k`;
  if (value >= 100) return `${round(value, 0)}`;
  if (value >= 1) return `${round(value, 2)}`;
  return `${round(value, 3)}`;
}

function formatCny(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return '';
  if (value >= 100) return `${round(value, 1)}`;
  if (value >= 1) return `${round(value, 2)}`;
  return `${round(value, 4)}`;
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'poe-season-helper/1.0'
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchFilterEditorItems() {
  const payload = await fetchJson(FILTEREDITOR_API);
  if (!payload || typeof payload.data !== 'string') {
    throw new Error('FilterEditor 返回结构缺少 data');
  }
  const buffer = Buffer.from(payload.data, 'base64');
  const text = zlib.gunzipSync(buffer).toString('utf8');
  const items = JSON.parse(text);
  if (!Array.isArray(items)) throw new Error('FilterEditor 解压结果不是数组');
  return items;
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
        Referer: DD373_PAGE
      }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < 3) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        requestText(nextUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDD373Url(code) {
  return `${DD373_PAGE}s-49pbxm-c-${code}-q2ahdc-4mnkb0.html`;
}

function parseDD373Listings(text, itemName) {
  const areaPattern = escapeRegExp(DD373_GAME_AREA);
  const leaguePattern = escapeRegExp(DD373_LEAGUE);
  const itemPattern = escapeRegExp(itemName);
  const listingRegex = new RegExp(
    `游戏区服：\\s*${areaPattern}\\s*/\\s*${leaguePattern}\\s*商品类型：\\s*${itemPattern}\\s*\\|\\s*库存：\\s*([\\d,]+)[\\s\\S]{0,260}?1元=([\\d.]+)\\s*(?:个)?\\s*(?:${itemPattern})?[\\s\\S]{0,100}?1(?:个)?\\s*(?:${itemPattern})?=([\\d.]+)\\s*元`,
    'g'
  );
  const listings = [];
  let match;
  while ((match = listingRegex.exec(text))) {
    const stock = Number(String(match[1]).replace(/,/g, ''));
    const unitPerCny = Number(match[2]);
    const unitPriceCny = Number(match[3]);
    if (!Number.isFinite(unitPerCny) || !Number.isFinite(unitPriceCny)) continue;
    if (unitPerCny <= 0 || unitPriceCny <= 0) continue;
    listings.push({
      unitPerCny: round(unitPerCny, 4),
      unitPriceCny: round(unitPriceCny, 4),
      stock: Number.isFinite(stock) ? stock : null
    });
  }
  return listings;
}

function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarizeDD373Listings(listings) {
  const sorted = listings
    .filter((item) => Number.isFinite(item.unitPriceCny) && item.unitPriceCny > 0)
    .sort((a, b) => a.unitPriceCny - b.unitPriceCny);
  const quoted = sorted.slice(0, 10);
  const topFive = sorted.slice(0, 5);
  return {
    sampleSize: listings.length,
    quotedSampleSize: quoted.length,
    bestUnitPriceCny: round(sorted[0]?.unitPriceCny, 4),
    bestUnitPerCny: round(sorted[0]?.unitPerCny, 4),
    medianUnitPriceCny: round(median(topFive.map((item) => item.unitPriceCny)), 4),
    totalVisibleStock: sorted.reduce((sum, item) => sum + (Number.isFinite(item.stock) ? item.stock : 0), 0),
    confidence: listings.length >= 5 ? 'high' : listings.length >= 2 ? 'medium' : listings.length >= 1 ? 'low' : 'none',
    listings: quoted
  };
}

async function fetchDD373Item(item) {
  const url = buildDD373Url(item.code);
  const html = await requestText(url);
  const text = normalizeHtmlText(html);
  const listings = parseDD373Listings(text, item.name);
  return {
    ...item,
    url,
    ...summarizeDD373Listings(listings)
  };
}

async function fetchDD373Items() {
  const results = [];
  for (const item of DD373_ITEMS) {
    try {
      results.push(await fetchDD373Item(item));
    } catch (error) {
      results.push({
        ...item,
        url: buildDD373Url(item.code),
        sampleSize: 0,
        confidence: 'none',
        error: error.message
      });
    }
  }
  return results;
}

function parseHistoryChange(history, current) {
  const values = String(history || '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (Number(current) > 0) values.push(Number(current));
  if (values.length < 2) return 0;
  return round(((values[values.length - 1] - values[0]) / values[0]) * 100, 1);
}

function classifyItem(item) {
  const baseType = String(item.baseType || item.name || '');
  const name = String(item.name || '');
  const text = `${baseType} ${name}`;

  if (item.frameType === 5) {
    if (/圣油/.test(text)) return { id: 'oil', label: '圣油' };
    if (/精华/.test(text)) return { id: 'essence', label: '精华' };
    if (/化石/.test(text)) return { id: 'fossil', label: '化石' };
    if (/催化剂/.test(text)) return { id: 'catalyst', label: '催化剂' };
    if (/命能/.test(text)) return { id: 'lifeforce', label: '命能' };
    if (/裂片|碎片|裂隙|军团|驱灵/.test(text)) return { id: 'fragment', label: '碎片' };
    if (/预兆/.test(text)) return { id: 'omen', label: '预兆' };
    return { id: 'currency', label: '通货' };
  }
  if (item.frameType === 4) {
    if (/强辅|觉醒|Awakened/i.test(text)) return { id: 'awakened_gem', label: '强辅技能石' };
    return { id: 'skill_gem', label: '技能石' };
  }
  if (item.frameType === 3) {
    if (/珠宝/.test(text)) return { id: 'unique_jewel', label: '暗金珠宝' };
    if (/药剂|魔瓶/.test(text)) return { id: 'unique_flask', label: '暗金药剂' };
    return { id: 'unique_item', label: '暗金装备' };
  }
  if (item.frameType === 6) return { id: 'divination_card', label: '命运卡' };
  return { id: 'other', label: '其他' };
}

function normalizeAutoItem(item) {
  const chaosValue = Number(item.calculated);
  if (!Number.isFinite(chaosValue) || chaosValue <= 0) return null;
  const category = classifyItem(item);
  const name = item.name || item.baseType || `物品 ${item.id}`;
  return {
    id: `filtereditor-${item.id}`,
    sourceId: item.id,
    sourceType: 'filtereditor',
    category: category.label,
    categoryId: category.id,
    name,
    nameEn: '',
    baseType: item.baseType || '',
    chaosValue: round(chaosValue, 3),
    displayValue: formatValue(chaosValue),
    change7d: parseHistoryChange(item.history, chaosValue),
    volume: Number(item.count) || 0,
    icon: item.icon || '',
    totalStacksize: Number(item.totalStacksize) || 1,
    sourceSearchCode: item.searchCode || ''
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadManualConfig() {
  if (!fs.existsSync(manualPath)) return { enabled: false, items: [] };
  return readJson(manualPath);
}

function normalizeManualItem(item) {
  if (!item || item.enabled === false) return null;
  const chaosValue = Number(item.chaosValue);
  if (!Number.isFinite(chaosValue) || chaosValue <= 0) return null;
  return {
    id: `manual-${slug(item.nameEn || item.name)}`,
    sourceId: item.sourceId || '',
    sourceType: 'manual',
    category: item.category || '通货',
    categoryId: item.categoryId || 'currency',
    name: item.name || item.nameEn,
    nameEn: item.nameEn || '',
    baseType: item.baseType || item.name || item.nameEn || '',
    chaosValue: round(chaosValue, 3),
    displayValue: formatValue(chaosValue),
    change7d: Number.isFinite(Number(item.change7d)) ? round(item.change7d, 1) : 0,
    volume: Number(item.volume) || 0,
    icon: item.icon || '',
    totalStacksize: Number(item.totalStacksize) || 1,
    sourceSearchCode: item.sourceSearchCode || ''
  };
}

function normalizeDD373Items(dd373Items) {
  const chaosQuote = dd373Items.find((item) => (
    item.id === 'chaos_orb'
    && Number.isFinite(item.bestUnitPriceCny)
    && item.bestUnitPriceCny > 0
  ));
  if (!chaosQuote) return [];

  return dd373Items
    .filter((item) => Number.isFinite(item.bestUnitPriceCny) && item.bestUnitPriceCny > 0)
    .map((item) => {
      const chaosValue = item.id === 'chaos_orb' ? 1 : item.bestUnitPriceCny / chaosQuote.bestUnitPriceCny;
      const marketValueLabel = `${formatCny(item.bestUnitPriceCny)} 米粒/个`;
      const marketDetailLabel = item.bestUnitPerCny
        ? `1 米粒≈${formatValue(item.bestUnitPerCny)} 个`
        : `${item.sampleSize || 0} 条公开报价`;
      return {
        id: `dd373-${item.id}`,
        sourceId: item.code,
        sourceType: 'dd373',
        category: '通货',
        categoryId: 'currency',
        name: item.name,
        nameEn: item.nameEn,
        baseType: item.name,
        chaosValue: round(chaosValue, 3),
        displayValue: formatValue(chaosValue),
        change7d: 0,
        volume: Number(item.sampleSize) || 0,
        icon: '',
        totalStacksize: 1,
        sourceSearchCode: item.code,
        sourceUrl: item.url,
        priority: item.priority,
        bestUnitPriceCny: item.bestUnitPriceCny,
        bestUnitPerCny: item.bestUnitPerCny,
        medianUnitPriceCny: item.medianUnitPriceCny,
        totalVisibleStock: item.totalVisibleStock,
        confidence: item.confidence,
        marketValueLabel,
        marketDetailLabel
      };
    });
}

function loadManualItems(config) {
  if (!config || config.enabled !== true || !Array.isArray(config.items)) return [];
  return config.items.map(normalizeManualItem).filter(Boolean);
}

function mergeItems(autoItems, manualItems) {
  const merged = new Map();
  autoItems.forEach((item) => {
    const key = item.nameEn || item.name;
    merged.set(key, item);
  });
  manualItems.forEach((item) => {
    const key = item.nameEn || item.name;
    merged.set(key, item);
  });
  return Array.from(merged.values());
}

function selectCore(items) {
  const names = ['神圣石', '混沌石', '崇高石', '剥离石', '卡兰德的魔镜'];
  return names
    .map((name) => items.find((item) => item.name === name || item.nameEn === name))
    .filter(Boolean);
}

function buildCategories(items) {
  const order = [
    ['currency', '通货'],
    ['fragment', '碎片'],
    ['essence', '精华'],
    ['oil', '圣油'],
    ['fossil', '化石'],
    ['catalyst', '催化剂'],
    ['lifeforce', '命能'],
    ['skill_gem', '技能石'],
    ['awakened_gem', '强辅技能石'],
    ['unique_jewel', '暗金珠宝'],
    ['unique_item', '暗金装备'],
    ['divination_card', '命运卡']
  ];
  return order
    .map(([id, label]) => ({
      id,
      label,
      items: items
        .filter((item) => item.categoryId === id || item.category === label)
        .sort((a, b) => b.chaosValue - a.chaosValue)
        .slice(0, 30)
    }))
    .filter((category) => category.items.length > 0);
}

function makeEmptyOutput(errorMessage) {
  return {
    schemaVersion: 1,
    market: 'cn',
    available: false,
    updatedAt: new Date().toISOString(),
    source: {
      name: 'FilterEditor 国服物价榜',
      url: FILTEREDITOR_PAGE,
      apiUrl: FILTEREDITOR_API,
      note: '公开网页数据读取失败；不会使用国际服行情冒充国服。'
    },
    league: {
      ...CURRENT_CN_LEAGUE
    },
    baseCurrency: {
      name: '混沌石',
      nameEn: 'Chaos Orb',
      chaosValue: 1
    },
    exchange: null,
    core: [],
    categories: [],
    sourceHealth: {
      rawItems: 0,
      pricedItems: 0,
      pricedCurrencyItems: 0,
      manualItems: 0,
      coreCurrencyReady: false
    },
    warnings: [errorMessage].filter(Boolean),
    emptyState: {
      title: '国服行情源暂不可用',
      description: '当前未拿到可信国服公开行情；不会把国际服比例当成国服价格展示。'
    }
  };
}

async function buildCnEconomyDigest() {
  let rawItems = [];
  let autoItems = [];
  let dd373RawItems = [];
  let dd373Items = [];
  let fetchError = '';
  let dd373Error = '';

  try {
    rawItems = await fetchFilterEditorItems();
    autoItems = rawItems.map(normalizeAutoItem).filter(Boolean);
  } catch (error) {
    fetchError = error.message;
  }

  try {
    dd373RawItems = await fetchDD373Items();
    dd373Items = normalizeDD373Items(dd373RawItems);
  } catch (error) {
    dd373Error = error.message;
  }

  const manualConfig = loadManualConfig();
  const manualItems = loadManualItems(manualConfig);

  if (!autoItems.length && !dd373Items.length && !manualItems.length) {
    const output = makeEmptyOutput(fetchError || dd373Error || '国服公开源当前没有有效价格数据');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`⚠️ POE1 国服行情摘要为空: ${outputPath}`);
    console.log(`   ${output.emptyState.description}`);
    return output;
  }

  const items = mergeItems([...autoItems, ...dd373Items], manualItems);
  const core = selectCore(items);
  const categories = buildCategories(items);
  const divine = core.find((item) => item.name === '神圣石' || item.nameEn === 'Divine Orb');
  const chaos = core.find((item) => item.name === '混沌石' || item.nameEn === 'Chaos Orb');
  const coreCurrencyReady = Boolean(divine && chaos);
  const hasVisibleMarketData = core.length > 0 || categories.some((category) => category.items.length > 0);
  const warnings = [];
  if (fetchError) warnings.push(`自动源读取失败: ${fetchError}`);
  if (dd373Error) warnings.push(`DD373 公开报价读取失败: ${dd373Error}`);
  if (!divine) warnings.push('当前未提供有效神圣石价格；如需展示核心换算，请先人工核验后写入 cn_economy_manual.json。');
  if (!chaos) warnings.push('当前未提供有效混沌石价格；国服核心换算暂以“混沌石=1”作为单位锚点。');

  const output = {
    schemaVersion: 1,
    market: 'cn',
    available: hasVisibleMarketData,
    updatedAt: new Date().toISOString(),
    source: {
      name: [
        manualItems.length ? '人工校验' : '',
        dd373Items.length ? 'DD373 国服公开报价' : '',
        autoItems.length ? 'FilterEditor 国服物价榜' : ''
      ].filter(Boolean).join(' + ') || '国服公开行情源',
      url: dd373Items.length ? DD373_PAGE : FILTEREDITOR_PAGE,
      apiUrl: FILTEREDITOR_API,
      note: '公开网页行情源，仅作国服行情参考，不代表成交保证。'
    },
    league: (manualConfig.enabled && manualConfig.league) || CURRENT_CN_LEAGUE,
    baseCurrency: {
      name: '混沌石',
      nameEn: 'Chaos Orb',
      chaosValue: chaos?.chaosValue || 1
    },
    exchange: divine ? {
      label: `1 神圣石 ≈ ${formatValue(divine.chaosValue)} 混沌石`,
      divineToChaos: divine.chaosValue
    } : null,
    core,
    categories,
    sourceHealth: {
      rawItems: rawItems.length,
      pricedItems: autoItems.length,
      pricedCurrencyItems: autoItems.filter((item) => item.categoryId === 'currency').length,
      dd373Items: dd373RawItems.length,
      dd373PricedItems: dd373Items.length,
      manualItems: manualItems.length,
      coreCurrencyReady
    },
    warnings,
    emptyState: hasVisibleMarketData ? null : {
      title: '国服核心通货待校准',
      description: '已接入公开物价源，但当前没有神圣石、混沌石等核心通货的有效价格；不会使用国际服比例冒充国服。'
    }
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`✅ POE1 国服行情摘要已生成: ${outputPath}`);
  console.log(`   自动源: ${rawItems.length} 条原始数据 / ${autoItems.length} 条有效价格`);
  console.log(`   DD373: ${dd373RawItems.length} 项 / ${dd373Items.length} 项有效价格`);
  console.log(`   核心通货: ${core.length} 项 | ${output.exchange?.label || '核心换算待人工校验'}`);
  if (warnings.length) warnings.forEach((warning) => console.log(`   ⚠️ ${warning}`));
  return output;
}

if (require.main === module) {
  buildCnEconomyDigest().catch((error) => {
    console.error('❌ POE1 国服行情摘要生成失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildCnEconomyDigest,
  classifyItem,
  formatValue,
  normalizeAutoItem
};
