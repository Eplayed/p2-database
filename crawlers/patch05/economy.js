const fs = require('fs');
const path = require('path');
const envConfig = require('../../auto_browser/env-config');

const PATCH_DIR = path.join(envConfig.dataDir, 'patch-0.5');
const ECONOMY_FILE = path.join(envConfig.dataDir, 'economy.json');

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildRateIndex(economyData) {
  const index = new Map();
  for (const rate of economyData.rates || []) {
    const keys = [
      rate.id,
      rate.name,
      rate.enName,
      rate.iconName,
      String(rate.iconName || '').replace(/_/g, '-'),
    ];
    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (normalized && !index.has(normalized)) index.set(normalized, rate);
    }
  }
  return index;
}

function getEntryKeys(entry) {
  return [
    entry.id,
    entry.name,
    entry.enName,
    ...(entry.aliases || []),
  ].map(normalizeKey).filter(Boolean);
}

function getGroup(entry) {
  const text = [
    entry.name,
    entry.enName,
    entry.summary,
    entry.effect,
    ...(entry.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();

  if (text.includes('符文') || text.includes('rune') || text.includes('合金') || text.includes('alloy')) {
    return 'rune_alloy';
  }
  return 'patch05_currency';
}

function mergePrice(entry, rateIndex) {
  const matchedRate = getEntryKeys(entry)
    .map(key => rateIndex.get(key))
    .find(Boolean);

  const price = toNumber(matchedRate?.price ?? matchedRate?.chaosEquivalent);
  const change = toNumber(matchedRate?.change);

  return {
    id: entry.id,
    category: entry.category,
    group: getGroup(entry),
    name: entry.name,
    enName: entry.enName,
    summary: entry.summary,
    effect: entry.effect,
    tags: entry.tags || [],
    source: entry.source,
    price,
    chaosEquivalent: price,
    change,
    priceStatus: price === null ? 'pending' : 'tracked',
    priceSource: matchedRate ? {
      id: matchedRate.id || '',
      name: matchedRate.name || '',
      enName: matchedRate.enName || '',
    } : null,
  };
}

function buildPatch05Economy({ currencies, updatedAt = new Date().toISOString() }) {
  const economyData = readJson(ECONOMY_FILE, { rates: [] });
  const rateIndex = buildRateIndex(economyData);
  const items = currencies.map(entry => mergePrice(entry, rateIndex));
  const trackedItems = items.filter(item => item.priceStatus === 'tracked');
  const runeAlloy = items.filter(item => item.group === 'rune_alloy');
  const movers = trackedItems
    .filter(item => typeof item.change === 'number' && Math.abs(item.change) > 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    version: '0.5.0',
    schemaVersion: 1,
    updatedAt,
    economyUpdatedAt: economyData.updateTime || '',
    league: economyData.league || '',
    sourceFiles: {
      patchCurrencies: 'patch05_currencies.json',
      economy: fs.existsSync(ECONOMY_FILE) ? path.basename(ECONOMY_FILE) : '',
    },
    summary: {
      total: items.length,
      tracked: trackedItems.length,
      pending: items.length - trackedItems.length,
      runeAlloy: runeAlloy.length,
      movers: movers.length,
    },
    groups: {
      patch05: items,
      runeAlloy,
      movers,
    },
    items,
  };
}

function writePatch05Economy(currencies) {
  const data = buildPatch05Economy({ currencies });
  if (!fs.existsSync(PATCH_DIR)) fs.mkdirSync(PATCH_DIR, { recursive: true });
  const filePath = path.join(PATCH_DIR, 'patch05_economy.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), filePath)}`);
  return data;
}

module.exports = {
  buildPatch05Economy,
  writePatch05Economy,
};

if (require.main === module) {
  const currencies = readJson(path.join(PATCH_DIR, 'patch05_currencies.json'), []);
  writePatch05Economy(currencies);
}
