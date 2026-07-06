#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_NAME = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const DATA_DIR = path.join(ROOT, 'translated-data', ENV_NAME);
const OUT_DIR = path.join(DATA_DIR, 'miniprogram_data');
const OUT_FILE = path.join(OUT_DIR, 'daily_return_digest.json');

const CLASS_NAME_MAPPING = {
  Warrior: '战士',
  Ranger: '游侠',
  Huntress: '女猎手',
  Sorceress: '女术者',
  Mercenary: '佣兵',
  Monk: '武僧',
  Witch: '女巫',
  Druid: '德鲁伊',
  Titan: '泰坦',
  Warbringer: '战争使者',
  'Smith of Kitava': '奇塔弗匠师',
  Deadeye: '锐眼',
  Pathfinder: '追猎者',
  Amazon: '亚马逊',
  Ritualist: '仪祭师',
  Stormweaver: '风暴编织者',
  Chronomancer: '塑时术师',
  'Disciple of Varashta': '巨灵信徒',
  Witchhunter: '猎巫人',
  'Gemling Legionnaire': '古灵使徒斗士',
  Tactician: '战术家',
  Invoker: '祈求者',
  'Acolyte of Chayula': '夏乌拉侍僧',
  Infernalist: '驱炎使',
  'Blood Mage': '血法师',
  Lich: '巫妖',
  Shaman: '萨满',
  Oracle: '神谕者',
  'Martial Artist': '武圣',
  'Spirit Walker': '魂灵行者',
  'Abyssal Lich': '深渊巫妖',
};

const MANUAL_NAME_MAPPING = {
  Mageblood: '法师之血',
  Headhunter: '猎首',
};

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function translateDisplayName(name, originalName) {
  return MANUAL_NAME_MAPPING[originalName] || MANUAL_NAME_MAPPING[name] || name || originalName || '';
}

function compactItem(item) {
  if (!item) return null;
  return {
    id: item.id || '',
    name: translateDisplayName(item.name, item.originalName || item.enName),
    originalName: item.originalName || item.enName || '',
    icon: item.icon || '',
    valueText: item.valueText || '',
    priceText: item.priceText || '',
    percent: Number.isFinite(Number(item.percent)) ? Number(item.percent) : null,
    count: Number.isFinite(Number(item.count)) ? Number(item.count) : null,
    change7d: Number.isFinite(Number(item.change7d)) ? Number(item.change7d) : null,
    detailPath: item.detailPath || '',
  };
}

function getTopClass(classes) {
  if (!Array.isArray(classes) || !classes.length) return null;
  const top = classes[0];
  return {
    id: `class_${String(top.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name: CLASS_NAME_MAPPING[top.name] || top.displayName || top.name || '',
    originalName: top.name || '',
    percent: Number.isFinite(Number(top.percent)) ? Math.round(Number(top.percent) * 10) / 10 : null,
  };
}

function getCnMarketCards(cnMarket) {
  const items = Array.isArray(cnMarket && cnMarket.items) ? cnMarket.items : [];
  return items
    .filter(item => item && item.confidence !== 'low' && Number(item.bestUnitPriceCny) > 0)
    .slice(0, 3)
    .map(item => ({
      id: item.id,
      name: item.name,
      originalName: item.enName || '',
      priceText: `${item.bestUnitPriceCny} 米粒/个`,
      valueText: item.bestUnitPerCny ? `1 米粒≈${Math.round(item.bestUnitPerCny * 10) / 10} 个` : '',
      icon: item.icon || '',
    }));
}

function getEconomyCards(economyDigest, cnMarket) {
  const cnCards = getCnMarketCards(cnMarket);
  if (cnCards.length) return cnCards;

  const sections = economyDigest && economyDigest.sections ? economyDigest.sections : {};
  const todayRates = Array.isArray(sections.todayRates) ? sections.todayRates : [];
  const movers = Array.isArray(sections.movers) ? sections.movers : [];
  return [...todayRates.slice(0, 2), ...movers.slice(0, 1)].map(compactItem).filter(Boolean);
}

function pickProblemGuides(problemGuides) {
  const priority = ['fourth_ascendancy_unlock', 'map_sustain', 'low_profit', 'boss_low_damage'];
  const items = Array.isArray(problemGuides && problemGuides.items) ? problemGuides.items : [];
  const byId = new Map(items.map(item => [item.id, item]));
  return priority
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(item => ({
      id: item.id,
      groupTitle: item.groupTitle,
      title: item.title,
      summary: item.summary,
      level: item.level || item.groupTitle || '',
      url: `/pages-sub/problem-guide/detail?id=${encodeURIComponent(item.id)}`,
    }));
}

function createActionCards({ ladderBuildIndex, economyDigest, cnMarket, problemGuides, classes }) {
  const topSkill = compactItem(ladderBuildIndex && ladderBuildIndex.skills && ladderBuildIndex.skills[0]);
  const topEquipment = compactItem(ladderBuildIndex && ladderBuildIndex.equipment && ladderBuildIndex.equipment[0]);
  const topClass = getTopClass(classes);
  const economyCards = getEconomyCards(economyDigest, cnMarket);
  const rescueItems = pickProblemGuides(problemGuides);

  const cards = [];
  if (topSkill) {
    const skillKeyword = topSkill.originalName || topSkill.name;
    cards.push({
      id: 'top_skill',
      type: 'skill',
      tag: '热门技能',
      title: topSkill.name,
      subtitle: `${topSkill.count || 0} 位天梯玩家在用`,
      value: topSkill.percent !== null ? `${topSkill.percent}%` : '',
      icon: topSkill.icon,
      url: `/pages-sub/ladder-analysis/index?tab=skill&keyword=${encodeURIComponent(skillKeyword)}`,
    });
  }
  if (topEquipment) {
    const equipmentKeyword = topEquipment.originalName || topEquipment.name;
    cards.push({
      id: 'top_equipment',
      type: 'equipment',
      tag: '热门装备',
      title: topEquipment.name,
      subtitle: `${topEquipment.count || 0} 位天梯玩家装备`,
      value: topEquipment.percent !== null ? `${topEquipment.percent}%` : '',
      icon: topEquipment.icon,
      url: `/pages-sub/ladder-analysis/index?tab=equipment&keyword=${encodeURIComponent(equipmentKeyword)}`,
    });
  }
  if (topClass) {
    cards.push({
      id: 'top_class',
      type: 'class',
      tag: '热门职业',
      title: topClass.name,
      subtitle: topClass.originalName,
      value: topClass.percent !== null ? `${topClass.percent}%` : '',
      icon: '',
      url: '/pages-sub/ladder-analysis/index',
    });
  }
  if (rescueItems[0]) {
    cards.push({
      id: 'rescue_pick',
      type: 'problem',
      tag: '急救箱',
      title: rescueItems[0].title,
      subtitle: rescueItems[0].summary,
      value: '排查',
      icon: '',
      url: rescueItems[0].url,
    });
  }

  return { cards, economyCards, rescueItems };
}

function buildDailyReturnDigest() {
  const ladderBuildIndex = readJson(path.join(OUT_DIR, 'ladder_build_index.json'), {});
  const economyDigest = readJson(path.join(OUT_DIR, 'economy_digest.json'), {});
  const cnMarket = readJson(path.join(OUT_DIR, 'cn_market_digest.json'), {});
  const problemGuides = readJson(path.join(OUT_DIR, 'problem_guides.json'), {});
  const classes = readJson(path.join(DATA_DIR, 'classes.json'), []);
  const { cards, economyCards, rescueItems } = createActionCards({
    ladderBuildIndex,
    economyDigest,
    cnMarket,
    problemGuides,
    classes,
  });

  const updatedAt = new Date().toISOString();
  const digest = {
    schemaVersion: 1,
    version: updatedAt.slice(0, 10).replace(/-/g, '') + '-1',
    updatedAt,
    sourceUpdatedAt: {
      ladder: ladderBuildIndex.updatedAt || '',
      economy: economyDigest.updatedAt || '',
      cnMarket: cnMarket.updatedAt || '',
      problemGuides: problemGuides.updatedAt || '',
    },
    title: '今日变化',
    shareTitle: cards.length ? `PoE2 今日变化：${cards.slice(0, 2).map(item => item.title).join(' / ')}` : 'PoE2 今日变化',
    sections: {
      actionCards: cards,
      economyCards,
      rescueItems,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(digest, null, 2));
  return digest;
}

if (require.main === module) {
  const digest = buildDailyReturnDigest();
  console.log('📌 每日复访摘要已生成');
  console.log(`   环境: ${ENV_NAME}`);
  console.log(`   今日变化: ${digest.sections.actionCards.length}`);
  console.log(`   急救箱推荐: ${digest.sections.rescueItems.length}`);
  console.log(`   输出: ${path.relative(ROOT, OUT_FILE)}`);
}

module.exports = {
  buildDailyReturnDigest,
  createActionCards,
  pickProblemGuides,
};
