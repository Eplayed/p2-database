const fs = require('fs');
const https = require('https');
const path = require('path');
const envConfig = require('../../auto_browser/env-config');

const NINJA_BASE_URL = 'https://poe.ninja';
const POECDN_BASE_URL = 'https://web.poecdn.com';
const OSS_PUBLIC_BASE_URL = 'https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com';
const DEFAULT_LEAGUE_URL = 'runesofaldur';
const OUTPUT_FILE = 'economy_digest.json';
const LEGACY_FILE = 'economy.json';
const ICON_DIR_NAME = 'economy-icons';

const ECONOMY_TYPES = [
  { type: 'Currency', name: '通货', priority: 'core' },
  { type: 'Runes', name: '符文', priority: 'season' },
  { type: 'Verisium', name: '合金', priority: 'season' },
  { type: 'LineageSupportGems', name: '族裔辅助宝石', priority: 'season' },
  { type: 'Fragments', name: '终局门票', priority: 'season' },
  { type: 'UncutGems', name: '未切割宝石', priority: 'starter' },
  { type: 'Essences', name: '精华', priority: 'starter' },
  { type: 'Ritual', name: '预兆', priority: 'starter' },
  { type: 'Expedition', name: '探险', priority: 'starter' },
  { type: 'Abyss', name: '深渊骨骸', priority: 'starter' },
  { type: 'SoulCores', name: '灵魂核心', priority: 'starter' },
  { type: 'Breach', name: '裂隙催化剂', priority: 'starter' },
];

const MANUAL_TRANSLATIONS = {
  'Mirror of Kalandra': '卡兰德的魔镜',
  "Hinekora's Lock": '希内克拉的锁',
  'Divine Orb': '神圣石',
  'Exalted Orb': '崇高石',
  'Perfect Exalted Orb': '完美崇高石',
  'Perfect Chaos Orb': '完美混沌石',
  'Chaos Orb': '混沌石',
  'Orb of Alchemy': '点金石',
  'Orb of Annulment': '剥离石',
  'Orb of Extraction': '萃取石',
  'Fracturing Orb': '破裂石',
  'Vaal Orb': '瓦尔宝珠',
  'Vaal Cultivation Orb': '瓦尔培养石',
  'Perfect Jeweller\'s Orb': '完美工匠石',
  'Greater Jeweller\'s Orb': '高阶工匠石',
  'Lesser Jeweller\'s Orb': '低阶工匠石',
  'Uncut Skill Gem': '未切割技能宝石',
  'Uncut Spirit Gem': '未切割精魂宝石',
  'Uncut Support Gem': '未切割辅助宝石',
  'Expedition Logbook': '探险日志',
  'Breachstone': '裂隙石',
  'Azmeri Reliquary Key': '阿兹莫里圣物钥匙',
  "Xesht's Reliquary Key": '夏乌拉圣物钥匙',
  "Zarokh's Reliquary Key: Against the Darkness": '扎罗克圣物钥匙：对抗黑暗',
  "Tangmazu's Reliquary Key": '坦格玛祖圣物钥匙',
  "The Trialmaster's Reliquary Key": '试炼大师圣物钥匙',
  'Weathered Crisis Fragment': '风化危机碎片',
  'Ancient Crisis Fragment': '远古危机碎片',
  'Faded Crisis Fragment': '褪色危机碎片',
  'Aldur\'s Legacy': '奥杜尔的遗产',
  'Aldur\'s Saga': '奥杜尔传说',
  'Masterwork Rune': '名匠符文',
  'Greater Rune of Leadership': '高阶领导符文',
  'Celestial Alloy': '天界合金',
  'The Runebinder\'s Alloy': '符文缚者合金',
  'Transcendent Alloy': '超凡合金',
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function buildTranslationIndex() {
  const root = path.join(__dirname, '../..');
  const base = readJson(path.join(root, 'base-data/dist/dict_base.json'), {});
  const gems = readJson(path.join(root, 'base-data/dist/dict_gem.json'), {});
  const uniques = readJson(path.join(root, 'base-data/dist/dict_unique.json'), {});
  const stackables = readJson(path.join(root, 'base-data/stackable_currency.json'), []);
  const index = new Map();

  const add = (en, cn) => {
    if (!en || !cn) return;
    index.set(normalizeName(en), cn);
  };

  Object.entries(base).forEach(([en, cn]) => add(en, cn));
  Object.entries(gems).forEach(([en, cn]) => add(en, cn));
  Object.entries(uniques).forEach(([en, value]) => add(en, value.cn || value.full || value));
  stackables.forEach(item => add(item.en, item.cn));
  Object.entries(MANUAL_TRANSLATIONS).forEach(([en, cn]) => add(en, cn));

  return index;
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function translateName(name, translationIndex) {
  if (!name) return '';
  if (translationIndex.has(normalizeName(name))) return translationIndex.get(normalizeName(name));

  const gemMatch = String(name).match(/^(Uncut (?:Skill|Spirit|Support) Gem) \(Level (\d+)\)$/i);
  if (gemMatch) {
    const baseName = translationIndex.get(normalizeName(gemMatch[1])) || gemMatch[1];
    return `${baseName}（等级 ${gemMatch[2]}）`;
  }

  return name;
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://poe.ninja/poe2/economy',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`JSON 解析失败: ${url} (${error.message})`));
        }
      });
    }).on('error', reject);
  });
}

function requestBuffer(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://poe.ninja/poe2/economy',
      },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < 3) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        requestBuffer(nextUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`图片下载失败 ${res.statusCode}: ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function getActiveLeague() {
  const configured = process.env.POE_NINJA_ECONOMY_LEAGUE || DEFAULT_LEAGUE_URL;
  const indexState = await requestJson(`${NINJA_BASE_URL}/poe2/api/data/index-state`);
  const leagues = indexState.economyLeagues || [];
  const league = leagues.find(item => item.url === configured)
    || leagues.find(item => item.indexed && !item.hardcore)
    || leagues[0];
  if (!league) throw new Error('未找到 poe.ninja PoE2 经济赛季');
  return league;
}

function buildImageUrl(image) {
  if (!image) return '';
  if (image.startsWith('http')) return image;
  return `${POECDN_BASE_URL}${image}`;
}

function safeFileName(value) {
  return String(value || 'item')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

function inferExt(url) {
  const clean = String(url || '').split('?')[0];
  const ext = path.extname(clean).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return ext;
  return '.png';
}

function getRemoteIconUrl(fileName) {
  return `${OSS_PUBLIC_BASE_URL}/${envConfig.ossPath}miniprogram_data/${ICON_DIR_NAME}/${fileName}`;
}

function mapEconomyItem({ typeInfo, line, item, core, translationIndex }) {
  const enName = item.name || line.id;
  const valueInDivine = round(line.primaryValue, 4);
  const exchangeRate = core && core.rates && core.rates.exalted ? Number(core.rates.exalted) : null;
  const valueInExalted = exchangeRate && valueInDivine !== null ? round(valueInDivine * exchangeRate, 2) : null;
  const iconUrl = buildImageUrl(item.image);
  const iconFile = iconUrl ? `${safeFileName(typeInfo.type)}-${safeFileName(item.id || item.detailsId || enName)}${inferExt(iconUrl)}` : '';

  return {
    id: item.id || line.id,
    detailsId: item.detailsId || '',
    type: typeInfo.type,
    category: typeInfo.name,
    priority: typeInfo.priority,
    name: translateName(enName, translationIndex),
    enName,
    icon: iconFile ? getRemoteIconUrl(iconFile) : iconUrl,
    sourceIcon: iconUrl,
    iconFile,
    valueInDivine,
    valueInExalted,
    valueText: formatValue(valueInDivine, valueInExalted),
    change7d: round(line.sparkline && line.sparkline.totalChange, 1),
    volumePerHour: round(line.volumePrimaryValue, 1),
    popularCurrency: line.maxVolumeCurrency || '',
    popularRate: round(line.maxVolumeRate, 2),
    popularText: formatPopular(line.maxVolumeCurrency, line.maxVolumeRate),
  };
}

function formatValue(valueInDivine, valueInExalted) {
  if (valueInDivine === null) return '-';
  if (valueInDivine >= 1) return `${formatNumber(valueInDivine)} D`;
  if (valueInExalted !== null && valueInExalted >= 0.1) return `${formatNumber(valueInExalted)} Ex`;
  return `${formatNumber(valueInDivine)} D`;
}

function formatPopular(currency, rate) {
  if (!currency || !Number.isFinite(Number(rate))) return '';
  const unit = currency === 'divine' ? 'D' : currency === 'exalted' ? 'Ex' : currency;
  return `${formatNumber(rate)} ${unit}`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number >= 1000) return `${round(number / 1000, 1)}k`;
  if (number >= 100) return String(round(number, 0));
  if (number >= 10) return String(round(number, 1));
  if (number >= 1) return String(round(number, 2));
  return String(round(number, 4));
}

function getItemScore(item) {
  const valueScore = Math.log10(Math.max(item.valueInDivine || 0, 0.0001) + 1) * 18;
  const volumeScore = Math.log10(Math.max(item.volumePerHour || 0, 0) + 1) * 10;
  const changeScore = Math.min(Math.abs(item.change7d || 0) / 25, 20);
  return valueScore + volumeScore + changeScore;
}

function topItems(items, options = {}) {
  const { limit = 10, types = null, sort = 'score', filter = null } = options;
  return items
    .filter(item => !types || types.includes(item.type))
    .filter(item => (filter ? filter(item) : true))
    .sort((a, b) => {
      if (sort === 'value') return (b.valueInDivine || 0) - (a.valueInDivine || 0);
      if (sort === 'volume') return (b.volumePerHour || 0) - (a.volumePerHour || 0);
      if (sort === 'change') return (b.change7d || 0) - (a.change7d || 0);
      if (sort === 'absChange') return Math.abs(b.change7d || 0) - Math.abs(a.change7d || 0);
      return getItemScore(b) - getItemScore(a);
    })
    .slice(0, limit);
}

function pickByIds(items, ids) {
  const index = new Map(items.map(item => [item.id, item]));
  return ids.map(id => index.get(id)).filter(Boolean);
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSections(allItems) {
  const coreIds = ['divine', 'exalted', 'perfect-exalted-orb', 'perfect-chaos-orb', 'mirror', 'hinekoras-lock'];
  const todayRates = pickByIds(allItems.filter(item => item.type === 'Currency'), coreIds);
  const newEconomy = dedupeItems([
    ...topItems(allItems, { types: ['Runes', 'Verisium', 'LineageSupportGems', 'Fragments'], sort: 'score', limit: 14 }),
    ...topItems(allItems, { types: ['Currency'], sort: 'value', limit: 6, filter: item => /perfect|mirror|hinekoras|fracturing|extraction/i.test(item.id) }),
  ]).slice(0, 16);
  const runeAlloys = topItems(allItems, { types: ['Runes', 'Verisium'], sort: 'score', limit: 16 });
  const starterMaterials = topItems(allItems, {
    types: ['UncutGems', 'Essences', 'Ritual', 'Expedition', 'Abyss', 'SoulCores', 'Breach'],
    sort: 'score',
    limit: 16,
  });
  const bossTickets = topItems(allItems, { types: ['Fragments'], sort: 'score', limit: 12 });
  const movers = topItems(allItems, { sort: 'absChange', limit: 20, filter: item => (item.volumePerHour || 0) >= 10 });
  const highVolume = topItems(allItems, { sort: 'volume', limit: 12 });

  return {
    todayRates,
    newEconomy,
    runeAlloys,
    starterMaterials,
    bossTickets,
    movers,
    highVolume,
  };
}

async function fetchType(leagueName, typeInfo, translationIndex) {
  const url = `${NINJA_BASE_URL}/poe2/api/economy/exchange/current/overview?league=${encodeURIComponent(leagueName)}&type=${encodeURIComponent(typeInfo.type)}`;
  const data = await requestJson(url);
  const itemIndex = new Map((data.items || []).map(item => [item.id, item]));
  const coreItems = ((data.core && data.core.items) || []).map(item => ({ ...item, category: item.category || typeInfo.type }));
  for (const item of coreItems) {
    if (!itemIndex.has(item.id)) itemIndex.set(item.id, item);
  }
  const lines = data.lines || [];
  const items = lines
    .map(line => {
      const item = itemIndex.get(line.id);
      if (!item) return null;
      return mapEconomyItem({ typeInfo, line, item, core: data.core, translationIndex });
    })
    .filter(Boolean);

  return {
    type: typeInfo.type,
    name: typeInfo.name,
    priority: typeInfo.priority,
    count: items.length,
    core: data.core || null,
    items,
  };
}

async function downloadIcons(items, outputDir) {
  const iconDir = path.join(outputDir, 'miniprogram_data', ICON_DIR_NAME);
  ensureDir(iconDir);
  const iconItems = items.filter(item => item.sourceIcon && item.iconFile);
  let saved = 0;

  for (const item of iconItems) {
    const target = path.join(iconDir, item.iconFile);
    if (fs.existsSync(target)) continue;
    try {
      const buffer = await requestBuffer(item.sourceIcon);
      fs.writeFileSync(target, buffer);
      saved += 1;
    } catch (error) {
      console.warn(`   ⚠️ 图标保存失败: ${item.enName} (${error.message})`);
    }
  }

  return { total: iconItems.length, saved };
}

function buildLegacyEconomy(digest, categories = []) {
  const currencyItems = categories
    .find(category => category.type === 'Currency')?.items || digest.sections.todayRates || [];
  const rates = currencyItems.map(item => ({
    id: item.id,
    name: item.name,
    enName: item.enName,
    price: item.valueInExalted,
    valueInDivine: item.valueInDivine,
    valueInExalted: item.valueInExalted,
    valueText: item.valueText,
    change: item.change7d,
    volumePerHour: item.volumePerHour,
    icon: item.icon,
    iconName: item.id.replace(/-/g, '_'),
  }));

  return {
    schemaVersion: 2,
    updateTime: digest.updatedAt,
    league: digest.league.displayName,
    source: digest.source,
    primaryUnit: 'divine',
    secondaryUnit: 'exalted',
    coreRates: digest.coreRates,
    rates,
  };
}

async function runNinjaEconomyDigest(options = {}) {
  const outputDir = options.outputDir || envConfig.dataDir;
  const translationIndex = buildTranslationIndex();
  ensureDir(path.join(outputDir, 'miniprogram_data'));

  console.log('\n💰 poe.ninja PoE2 经济摘要');
  const league = await getActiveLeague();
  console.log(`   赛季: ${league.displayName || league.name} (${league.url})`);

  const categories = [];
  for (const typeInfo of ECONOMY_TYPES) {
    process.stdout.write(`   抓取 ${typeInfo.name}... `);
    const category = await fetchType(league.name || league.displayName || 'Runes of Aldur', typeInfo, translationIndex);
    categories.push(category);
    console.log(`${category.count} 条`);
  }

  const allItems = categories.flatMap(category => category.items);
  const selectedItems = dedupeItems(Object.values(buildSections(allItems)).flat());
  const iconStats = await downloadIcons(selectedItems, outputDir);
  console.log(`   图标: ${iconStats.total} 个需要展示，新增保存 ${iconStats.saved} 个`);

  const currencyCategory = categories.find(category => category.type === 'Currency');
  const coreRates = currencyCategory && currencyCategory.core && currencyCategory.core.rates
    ? {
        divineToExalted: round(currencyCategory.core.rates.exalted, 2),
        divineToChaos: round(currencyCategory.core.rates.chaos, 2),
        exaltedToDivine: round(currencyCategory.items.find(item => item.id === 'exalted')?.valueInDivine, 4),
      }
    : {};

  const sections = buildSections(allItems);
  const digest = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    league: {
      name: league.name || '',
      displayName: league.displayName || league.name || '',
      url: league.url || '',
    },
    source: {
      name: 'poe.ninja PoE2 Economy',
      url: `${NINJA_BASE_URL}/poe2/economy/${league.url || DEFAULT_LEAGUE_URL}/currency`,
    },
    units: {
      primary: 'Divine Orb',
      secondary: 'Exalted Orb',
    },
    coreRates,
    summary: {
      categoryCount: categories.length,
      itemCount: allItems.length,
      selectedItemCount: selectedItems.length,
    },
    categorySummary: categories.map(category => ({
      type: category.type,
      name: category.name,
      priority: category.priority,
      count: category.count,
    })),
    sections,
  };

  const digestPath = path.join(outputDir, 'miniprogram_data', OUTPUT_FILE);
  fs.writeFileSync(digestPath, JSON.stringify(digest, null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), digestPath)}`);

  const rawPath = path.join(outputDir, 'economy_raw.json');
  fs.writeFileSync(rawPath, JSON.stringify({
    schemaVersion: 1,
    updatedAt: digest.updatedAt,
    league: digest.league,
    source: digest.source,
    categories,
  }, null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), rawPath)} (本地排查用，不上传 OSS)`);

  const legacyPath = path.join(outputDir, LEGACY_FILE);
  fs.writeFileSync(legacyPath, JSON.stringify(buildLegacyEconomy(digest, categories), null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), legacyPath)}`);

  return digest;
}

if (require.main === module) {
  runNinjaEconomyDigest().catch(error => {
    console.error('\n❌ 经济摘要更新失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  ECONOMY_TYPES,
  runNinjaEconomyDigest,
  buildLegacyEconomy,
};
