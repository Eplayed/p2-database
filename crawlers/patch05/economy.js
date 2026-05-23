const fs = require('fs');
const path = require('path');
const envConfig = require('../../auto_browser/env-config');

const PATCH_DIR = path.join(envConfig.dataDir, 'patch-0.5');
const ECONOMY_FILE = path.join(envConfig.dataDir, 'economy.json');
const HISTORY_DIR = path.join(envConfig.dataDir, 'economy-history');

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

function round(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function getSnapshotFileName(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + '-' + pad(date.getHours()) + '.json';
}

function saveEconomySnapshot(economyData, updatedAt) {
  if (!economyData || !Array.isArray(economyData.rates) || economyData.rates.length === 0) {
    return null;
  }
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const fileName = getSnapshotFileName(new Date(updatedAt));
  const snapshotPath = path.join(HISTORY_DIR, fileName);
  const snapshot = {
    schemaVersion: 1,
    updatedAt,
    economyUpdatedAt: economyData.updateTime || updatedAt,
    league: economyData.league || '',
    rates: economyData.rates.map(rate => ({
      id: rate.id || '',
      name: rate.name || '',
      enName: rate.enName || '',
      price: toNumber(rate.price),
      chaosEquivalent: toNumber(rate.chaosEquivalent || rate.price),
      change: toNumber(rate.change),
    })),
  };
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  return path.basename(snapshotPath);
}

function loadRecentSnapshots(limit = 12) {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  return fs.readdirSync(HISTORY_DIR)
    .filter(file => file.endsWith('.json'))
    .sort()
    .slice(-limit)
    .map(file => {
      const filePath = path.join(HISTORY_DIR, file);
      try {
        return {
          file,
          data: readJson(filePath, null),
        };
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .filter(snapshot => snapshot.data && Array.isArray(snapshot.data.rates));
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

  const price = matchedRate ? toNumber(matchedRate.price !== undefined ? matchedRate.price : matchedRate.chaosEquivalent) : null;
  const change = matchedRate ? toNumber(matchedRate.change) : null;

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

function buildSnapshotPriceIndex(snapshot) {
  const index = new Map();
  const rates = snapshot && snapshot.data && Array.isArray(snapshot.data.rates) ? snapshot.data.rates : [];
  for (const rate of rates) {
    const keys = [rate.id, rate.name, rate.enName].map(normalizeKey).filter(Boolean);
    for (const key of keys) {
      if (!index.has(key)) index.set(key, rate);
    }
  }
  return index;
}

function findHistoryPrice(item, snapshotIndexes) {
  const keys = getEntryKeys(item);
  for (let i = snapshotIndexes.length - 1; i >= 0; i -= 1) {
    const index = snapshotIndexes[i];
    const matched = keys.map(key => index.get(key)).find(Boolean);
    if (matched) {
      const price = toNumber(matched.price !== undefined ? matched.price : matched.chaosEquivalent);
      if (price !== null && price > 0) return price;
    }
  }
  return null;
}

function enrichWithHistory(items, snapshots) {
  const snapshotIndexes = snapshots.map(buildSnapshotPriceIndex);
  return items.map(item => {
    if (item.price === null || item.price <= 0) {
      return {
        ...item,
        previousPrice: null,
        changeFromPrevious: null,
        watchStatus: item.priceStatus === 'tracked' ? 'observing' : 'waiting',
      };
    }

    const previousPrice = findHistoryPrice(item, snapshotIndexes);
    const changeFromPrevious = previousPrice && previousPrice > 0
      ? round(((item.price - previousPrice) / previousPrice) * 100, 1)
      : null;
    const absoluteChange = changeFromPrevious === null ? Math.abs(item.change || 0) : Math.abs(changeFromPrevious);
    let watchStatus = 'observing';
    if (absoluteChange >= 35) watchStatus = 'volatile';
    else if (snapshots.length >= 3 && absoluteChange <= 12) watchStatus = 'reference';

    return {
      ...item,
      previousPrice,
      changeFromPrevious,
      watchStatus,
    };
  });
}

function sortByMove(items) {
  return items
    .filter(item => item.priceStatus === 'tracked')
    .filter(item => typeof item.changeFromPrevious === 'number' || typeof item.change === 'number')
    .sort((a, b) => {
      const moveA = Math.abs(typeof a.changeFromPrevious === 'number' ? a.changeFromPrevious : a.change);
      const moveB = Math.abs(typeof b.changeFromPrevious === 'number' ? b.changeFromPrevious : b.change);
      return moveB - moveA;
    });
}

function buildWatchSummary({ items, trackedItems, pendingItems, movers, snapshots }) {
  const summary = [];
  if (!trackedItems.length) {
    summary.push('0.5 新通货仍未匹配到稳定行情，当前以资料观察为主。');
  } else {
    summary.push(`已跟踪 ${trackedItems.length} 项 0.5 新经济物品，${pendingItems.length} 项等待行情源。`);
  }

  if (snapshots.length < 3) {
    summary.push('快照样本不足，涨跌结论先按观察处理。');
  } else if (movers.length) {
    const top = movers[0];
    const move = typeof top.changeFromPrevious === 'number' ? top.changeFromPrevious : top.change;
    summary.push(`${top.name} 波动最明显，当前 ${top.price}c，变化 ${move > 0 ? '+' : ''}${move}%。`);
  }

  const volatileCount = items.filter(item => item.watchStatus === 'volatile').length;
  if (volatileCount > 0) summary.push(`${volatileCount} 项价格处于高波动，赛季初谨慎囤货。`);
  if (!summary.length) summary.push('新经济数据观察中，等待更多行情样本。');
  return summary.slice(0, 4);
}

function buildPatch05EconomyWatch({ economy, snapshots, updatedAt }) {
  const items = economy.items || [];
  const trackedItems = items.filter(item => item.priceStatus === 'tracked');
  const pendingItems = items.filter(item => item.priceStatus !== 'tracked');
  const movers = sortByMove(items);
  const up = movers
    .filter(item => (typeof item.changeFromPrevious === 'number' ? item.changeFromPrevious : item.change) > 0)
    .slice(0, 5);
  const down = movers
    .filter(item => (typeof item.changeFromPrevious === 'number' ? item.changeFromPrevious : item.change) < 0)
    .slice(0, 5);
  const volatile = items
    .filter(item => item.watchStatus === 'volatile')
    .slice(0, 8);

  return {
    version: '0.5.0',
    schemaVersion: 1,
    updatedAt,
    economyUpdatedAt: economy.economyUpdatedAt || '',
    status: trackedItems.length === 0 ? 'waiting' : (snapshots.length < 3 ? 'observing' : 'reference'),
    snapshotCount: snapshots.length,
    summary: buildWatchSummary({ items, trackedItems, pendingItems, movers, snapshots }),
    counters: {
      total: items.length,
      tracked: trackedItems.length,
      pending: pendingItems.length,
      volatile: volatile.length,
    },
    movers: {
      up,
      down,
      volatile,
    },
    groups: {
      newCurrencies: items.filter(item => item.group === 'patch05_currency'),
      runesAndAlloys: items.filter(item => item.group === 'rune_alloy'),
    },
    warnings: [
      trackedItems.length === 0 ? '赛季初 0.5 新物品可能尚未进入 poe.ninja 行情。' : '',
      snapshots.length < 3 ? '快照不足 3 次时，涨跌只作为观察信号。' : '',
      '价格来自公开行情抓取，低成交物品可能存在虚高或跳价。',
    ].filter(Boolean),
  };
}

function buildPatch05Economy({ currencies, updatedAt = new Date().toISOString() }) {
  const economyData = readJson(ECONOMY_FILE, { rates: [] });
  const rateIndex = buildRateIndex(economyData);
  const snapshotFile = saveEconomySnapshot(economyData, updatedAt);
  const snapshots = loadRecentSnapshots(12).filter(snapshot => snapshot.file !== snapshotFile);
  const items = enrichWithHistory(currencies.map(entry => mergePrice(entry, rateIndex)), snapshots);
  const trackedItems = items.filter(item => item.priceStatus === 'tracked');
  const runeAlloy = items.filter(item => item.group === 'rune_alloy');
  const movers = sortByMove(trackedItems);

  const economy = {
    version: '0.5.0',
    schemaVersion: 2,
    updatedAt,
    economyUpdatedAt: economyData.updateTime || '',
    league: economyData.league || '',
    sourceFiles: {
      patchCurrencies: 'patch05_currencies.json',
      economy: fs.existsSync(ECONOMY_FILE) ? path.basename(ECONOMY_FILE) : '',
      latestSnapshot: snapshotFile || '',
    },
    summary: {
      total: items.length,
      tracked: trackedItems.length,
      pending: items.length - trackedItems.length,
      runeAlloy: runeAlloy.length,
      movers: movers.length,
      snapshotCount: snapshots.length + (snapshotFile ? 1 : 0),
    },
    groups: {
      patch05: items,
      runeAlloy,
      movers,
    },
    items,
  };

  return {
    economy,
    watch: buildPatch05EconomyWatch({
      economy,
      snapshots: snapshots.concat(snapshotFile ? [{ file: snapshotFile, data: null }] : []),
      updatedAt,
    }),
  };
}

function writePatch05Economy(currencies) {
  const data = buildPatch05Economy({ currencies });
  if (!fs.existsSync(PATCH_DIR)) fs.mkdirSync(PATCH_DIR, { recursive: true });
  const filePath = path.join(PATCH_DIR, 'patch05_economy.json');
  const watchPath = path.join(PATCH_DIR, 'patch05_economy_watch.json');
  fs.writeFileSync(filePath, JSON.stringify(data.economy, null, 2));
  fs.writeFileSync(watchPath, JSON.stringify(data.watch, null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), filePath)}`);
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), watchPath)}`);
  return data;
}

module.exports = {
  buildPatch05Economy,
  buildPatch05EconomyWatch,
  writePatch05Economy,
};

if (require.main === module) {
  const currencies = readJson(path.join(PATCH_DIR, 'patch05_currencies.json'), []);
  writePatch05Economy(currencies);
}
