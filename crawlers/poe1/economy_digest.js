const fs = require('fs');
const path = require('path');
const { translateCurrency } = require('./translations');
const { selectPrimaryChallengeLeague } = require('./league');

const API_ROOT = 'https://poe.ninja/poe1/api';
const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const outputDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const categories = [
  { id: 'Currency', label: '通货' },
  { id: 'Fragment', label: '碎片' },
  { id: 'Essence', label: '精华' },
  { id: 'Oil', label: '圣油' }
];

const LEAGUE_DISPLAY_NAME_MAP = {
  Allflame: '永火之咒'
};

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'poe-season-helper/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

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

function mergeCategory(category, payload) {
  const itemsById = new Map((payload.items || []).map((item) => [item.id, item]));
  return (payload.lines || []).map((line) => {
    const item = itemsById.get(line.id) || {};
    return {
      id: line.id,
      category: category.label,
      name: translateCurrency(item.name || line.id),
      nameEn: item.name || line.id,
      chaosValue: round(line.primaryValue, 3),
      displayValue: formatValue(line.primaryValue),
      change7d: round(line.sparkline?.totalChange, 1),
      volume: round(line.volumePrimaryValue, 0),
      icon: item.image ? `https://poe.ninja${item.image}` : ''
    };
  });
}

function selectCore(items) {
  const names = ['Divine Orb', 'Chaos Orb', 'Exalted Orb', 'Mirror of Kalandra'];
  return names.map((name) => items.find((item) => item.nameEn === name)).filter(Boolean);
}

async function buildEconomyDigest() {
  const indexState = await fetchJson(`${API_ROOT}/data/index-state`);
  const league = selectPrimaryChallengeLeague(indexState.economyLeagues);
  if (!league) throw new Error('未找到当前 POE1 经济赛季');
  const leagueDisplayName = LEAGUE_DISPLAY_NAME_MAP[league.name] || league.displayName || league.name;
  const payloads = await Promise.all(categories.map(async (category) => ({
    category,
    payload: await fetchJson(`${API_ROOT}/economy/exchange/current/overview?league=${encodeURIComponent(league.name)}&type=${category.id}`)
  })));
  const items = payloads.flatMap(({ category, payload }) => mergeCategory(category, payload));
  const chaosValue = items.find((item) => item.nameEn === 'Chaos Orb')?.chaosValue || 1;
  const divine = items.find((item) => item.nameEn === 'Divine Orb');
  const output = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: { name: 'poe.ninja POE1 Economy', url: `https://poe.ninja/economy/${league.url}/currency` },
    league: { name: league.name, url: league.url, displayName: leagueDisplayName },
    baseCurrency: { name: '混沌石', nameEn: 'Chaos Orb', chaosValue },
    exchange: divine ? {
      label: `1 神圣石 ≈ ${formatValue(divine.chaosValue)} 混沌石`,
      divineToChaos: divine.chaosValue
    } : null,
    core: selectCore(items),
    categories: categories.map((category) => ({
      id: category.id,
      label: category.label,
      items: items.filter((item) => item.category === category.label)
        .sort((a, b) => b.chaosValue - a.chaosValue)
        .slice(0, 30)
    }))
  };
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'economy_digest.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`✅ POE1 经济摘要已生成: ${outputPath}`);
  console.log(`   赛季: ${league.name} | 条目: ${items.length} | ${output.exchange?.label || '换算待补'}`);
  return output;
}

if (require.main === module) {
  buildEconomyDigest().catch((error) => {
    console.error('❌ POE1 经济摘要生成失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildEconomyDigest, formatValue, mergeCategory };
