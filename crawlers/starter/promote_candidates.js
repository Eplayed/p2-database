#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../auto_browser/.env') });

const fs = require('fs');
const path = require('path');
const envConfig = require('../../auto_browser/env-config');

const ROOT = path.join(__dirname, '../..');
const SOURCE_FILE = path.join(ROOT, 'base-data/starter/starter_builds.json');
const CANDIDATES_FILE = path.join(envConfig.dataDir, 'miniprogram_data/starter_candidates.json');

const CLASS_MAP = {
  '女巫': 'Witch',
  '游侠': 'Ranger',
  '战士': 'Warrior',
  '女术者': 'Sorceress',
  '佣兵': 'Mercenary',
  '僧侣': 'Monk',
  '女猎手': 'Huntress',
  '德鲁伊': 'Druid',
};

const ASCENDANCY_MAP = {
  '狱火师': 'Infernalist',
  '血法师': 'Blood Mage',
  '巫妖': 'Lich',
  '锐眼': 'Deadeye',
  '追猎者': 'Pathfinder',
  '泰坦': 'Titan',
  '战争使者': 'Warbringer',
  '奇塔弗工匠': 'Smith of Kitava',
  '风暴编织者': 'Stormweaver',
  '时空幻术师': 'Chronomancer',
  '女巫猎人': 'Witchhunter',
  '古灵军团': 'Gemling Legionnaire',
  '智勇军师': 'Tactician',
  '施法者': 'Invoker',
  '夏乌拉侍僧': 'Acolyte of Chayula',
  '亚马逊': 'Amazon',
  '仪式行者': 'Ritualist',
  '深渊巫妖': 'Abyssal Lich',
  '瓦拉煞的门徒': 'Disciple of Varashta',
  '神谕者': 'Oracle',
  '萨满': 'Shaman',
};

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function getPlanId(candidate) {
  const source = Array.isArray(candidate.sources) ? candidate.sources[0] : null;
  const url = (source && source.url) || '';
  const match = url.match(/\/plan\/([^/?#]+)/);
  return match ? match[1] : '';
}

function hasStarterIntent(candidate) {
  const title = String(candidate.title || '');
  const tags = Array.isArray(candidate.tags) ? candidate.tags.join(' ') : '';
  if (/速刷|最终版本/.test(title) && !/开荒|升级|备战/.test(title + tags)) return false;
  return /开荒|升级|备战|0\.5/.test(title + tags);
}

function getHotScore(candidate) {
  const metrics = candidate.sourceMetrics || {};
  return Number(metrics.hotScore || 0);
}

function getTier(candidate) {
  const hotScore = getHotScore(candidate);
  const hints = Array.isArray(candidate.reviewHints) ? candidate.reviewHints : [];
  if (hints.length) return hotScore >= 1200 ? 'A' : 'B';
  if (hotScore >= 1600) return 'S';
  if (hotScore >= 900) return 'A';
  return 'B';
}

function getStarterScore(candidate) {
  const hotScore = getHotScore(candidate);
  const hints = Array.isArray(candidate.reviewHints) ? candidate.reviewHints : [];
  const base = Math.min(92, 72 + Math.round(hotScore / 90));
  return Math.max(68, base - hints.length * 5);
}

function getDifficulty(candidate) {
  const title = String(candidate.title || '');
  if (/COC|暴击时施放|电矛/.test(title)) return 4;
  if (/自用|施工中/.test(title)) return 3;
  return 3;
}

function uniq(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = String(value || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseSkillLine(line) {
  const text = String(line || '').replace(/^技能[:：]\s*/, '');
  const parts = text.split('/').map(item => item.trim());
  const skillPart = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
  const gems = skillPart.split('+').map(item => item.trim()).filter(Boolean);
  if (!gems.length) return null;
  return {
    groupName: parts[0] && parts.length > 1 ? parts[0] : '技能配置',
    note: gems[0],
    links: gems.map((name, index) => ({
      name,
      isSupport: index > 0,
    })),
  };
}

function getSkillGroups(candidate) {
  const groups = [];
  (candidate.levelingPlan || []).forEach(stage => {
    (stage.mainSkills || []).forEach(line => {
      const group = parseSkillLine(line);
      if (group) groups.push(group);
    });
  });
  return groups.slice(0, 8);
}

function getRarePriority(candidate) {
  const text = `${candidate.title || ''} ${candidate.mainSkill || ''}`;
  if (/弓|箭|锐眼|游侠/.test(text)) {
    return [
      { slot: '武器', stats: ['武器伤害', '攻击速度', '元素点伤'] },
      { slot: '鞋子', stats: ['移动速度', '生命', '抗性'] },
    ];
  }
  if (/法|COC|雷|电|诅咒/.test(text)) {
    return [
      { slot: '武器/法器', stats: ['技能等级', '法术伤害', '施法速度'] },
      { slot: '防具', stats: ['生命', '抗性', '能量护盾'] },
    ];
  }
  if (/盾|战士|猛击/.test(text)) {
    return [
      { slot: '武器/盾牌', stats: ['物理伤害', '格挡', '生命'] },
      { slot: '防具', stats: ['生命', '抗性', '护甲'] },
    ];
  }
  return [
    { slot: '武器', stats: ['技能等级', '攻击/施法速度', '核心伤害词缀'] },
    { slot: '防具', stats: ['生命', '抗性', '移动速度'] },
  ];
}

function buildTags(candidate, tier) {
  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  const title = String(candidate.title || '');
  return uniq([
    '开服热门',
    '社区验证',
    tier === 'S' ? '高热度' : '',
    /清|速刷|锐眼|骑鸟/.test(title) ? '清图快' : '',
    /Boss|COC|盾|榴弹/.test(title) ? 'Boss 稳' : '',
    ...tags,
  ]).slice(0, 8);
}

function getSummary(candidate) {
  const cls = candidate.ascendancy || candidate.class || '职业待确认';
  const skill = candidate.mainSkill || '核心技能待确认';
  const metrics = candidate.sourceMetrics || {};
  return `来自踩蘑菇开服热门 BD：${cls} ${skill}。当前浏览 ${metrics.views || 0}、收藏 ${metrics.favorites || 0}，适合作为社区开荒候选，发布前仍保留人工复核标记。`;
}

function promoteCandidate(candidate, batchUpdatedAt) {
  const planId = getPlanId(candidate);
  const tier = getTier(candidate);
  const cls = CLASS_MAP[candidate.class] || candidate.class || '';
  const asc = ASCENDANCY_MAP[candidate.ascendancy] || candidate.ascendancy || '';
  const source = Array.isArray(candidate.sources) && candidate.sources.length ? candidate.sources[0] : {};
  const hints = Array.isArray(candidate.reviewHints) ? candidate.reviewHints : [];

  return {
    id: `caimogu_${planId ? slugify(planId) : slugify(candidate.title)}`,
    status: hints.length ? 'community_candidate' : 'community_hot',
    tier,
    class: cls,
    ascendancy: asc,
    title: candidate.title,
    mainSkill: candidate.mainSkill || '',
    author: candidate.author || '踩蘑菇玩家',
    updatedAt: batchUpdatedAt,
    recommendation: {
      starterScore: getStarterScore(candidate),
      difficulty: getDifficulty(candidate),
      gearDependency: /COC|速刷|骑鸟/.test(candidate.title || '') ? 4 : 3,
      bossing: /盾|COC|榴弹/.test(candidate.title || '') ? 4 : 3,
      mapping: /锐眼|骑鸟|旋風|速刷/.test(candidate.title || '') ? 5 : 4,
      survival: /盾|战士|召唤/.test(candidate.title || '') ? 4 : 3,
    },
    tags: buildTags(candidate, tier),
    summary: getSummary(candidate),
    pros: ['开服社区热度较高', '带有原帖技能装配', '后续可按真实反馈继续校准'],
    cons: hints.length ? ['候选数据仍有缺项，建议查看原帖确认'] : ['仍需结合自身掉落和操作习惯调整'],
    skills: getSkillGroups(candidate),
    leveling: [
      '优先按原帖技能装配推进剧情。',
      '剧情阶段先补生命、抗性和移动速度，再追求输出。',
      '进入异界后按天梯和价格变化决定是否转型。',
    ],
    levelingPlan: candidate.levelingPlan || [],
    equipment: {
      coreUniques: [],
      rarePriority: getRarePriority(candidate),
    },
    sources: [
      {
        name: '踩蘑菇热门 BD',
        type: 'community_agent',
        url: source.url || '',
        checkedAt: new Date().toISOString().slice(0, 10),
        confidence: hints.length ? 'low' : 'medium',
        note: `由热门 BD 候选池提升，原候选 reviewHints: ${hints.length ? hints.join('、') : '无'}`,
      },
    ],
    agentReview: {
      sourceCandidateId: candidate.id,
      reviewStatus: candidate.reviewStatus || 'needs_review',
      promotedAt: new Date().toISOString(),
      reviewHints: hints,
      sourceMetrics: candidate.sourceMetrics || {},
    },
  };
}

function main() {
  const sourceBuilds = readJson(SOURCE_FILE, []);
  const candidatePayload = readJson(CANDIDATES_FILE, null);
  const candidates = candidatePayload && Array.isArray(candidatePayload.candidates) ? candidatePayload.candidates : [];
  if (!candidates.length) throw new Error(`候选数据为空: ${CANDIDATES_FILE}`);

  const batchUpdatedAt = new Date().toISOString();
  const promoted = candidates
    .filter(hasStarterIntent)
    .map(candidate => promoteCandidate(candidate, batchUpdatedAt))
    .filter(entry => entry.title && entry.sources[0].url);

  const manualBuilds = sourceBuilds.filter(entry => !String(entry.id || '').startsWith('caimogu_'));
  const nextBuilds = [...promoted, ...manualBuilds];
  writeJson(SOURCE_FILE, nextBuilds);

  console.log(`候选输入: ${candidates.length}`);
  console.log(`提升为正式开荒源: ${promoted.length}`);
  promoted.forEach(entry => {
    console.log(`- ${entry.tier} ${entry.title} (${entry.class}${entry.ascendancy ? `/${entry.ascendancy}` : ''})`);
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('提升候选失败:', error.message);
    process.exit(1);
  }
}
