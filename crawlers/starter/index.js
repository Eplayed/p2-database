#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../auto_browser/.env') });

const fs = require('fs');
const path = require('path');
const envConfig = require('../../auto_browser/env-config');

const ROOT = path.join(__dirname, '../..');
const SOURCE_FILE = path.join(ROOT, 'base-data/starter/starter_builds.json');
const OUTPUT_DIR = path.join(envConfig.dataDir, 'miniprogram_data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'starters.json');
const LADDER_FILE = path.join(envConfig.dataDir, 'ladder_analysis.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function uniq(values) {
  const seen = {};
  return values.filter(value => {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function normalizeDate(value, fallback) {
  const timestamp = Date.parse(value || '');
  if (Number.isNaN(timestamp)) return fallback;
  return new Date(timestamp).toISOString();
}

function getClassTrendMap() {
  const analysis = readJson(LADDER_FILE, null);
  const trendMap = {};
  if (!analysis || !Array.isArray(analysis.classDistribution)) return trendMap;

  analysis.classDistribution.forEach(item => {
    if (!item || !item.name) return;
    trendMap[String(item.name).toLowerCase()] = {
      count: Number(item.count || 0),
      percent: Number(item.percent || 0),
      icon: item.icon || ''
    };
  });
  return trendMap;
}

function normalizeBuild(entry, trendMap, now) {
  const className = entry.class || '';
  const ascendancy = entry.ascendancy || '';
  const trend = trendMap[String(ascendancy || className).toLowerCase()] || trendMap[String(className).toLowerCase()] || null;
  const recommendation = entry.recommendation || {};
  const tags = uniq([entry.status === 'preseason' ? '0.5预选' : '', entry.tier ? entry.tier + '级' : '', ...(entry.tags || [])]);
  const source = Array.isArray(entry.sources) && entry.sources.length ? entry.sources[0] : null;
  const updatedAt = normalizeDate(entry.updatedAt || (source && source.checkedAt), now);
  const defaultSkills = [
    {
      groupName: '开荒主线',
      note: entry.mainSkill || '按掉落和手感选择主技能',
      links: [
        { name: entry.mainSkill || '主技能', isSupport: false },
        { name: '按需搭配辅助', isSupport: true }
      ]
    }
  ];

  return {
    id: entry.id || slugify([className, ascendancy, entry.title].join('-')),
    schemaVersion: 1,
    updatedAt,
    status: entry.status || 'reviewed',
    tier: entry.tier || 'A',
    meta: {
      title: entry.title || '未命名开荒 BD',
      author: entry.author || '人工精选',
      class: ascendancy || className,
      baseClass: className,
      ascendancy: ascendancy,
      mainSkill: entry.mainSkill || '',
      tags: tags,
      source: source ? source.name : '人工精选',
      confidence: source ? source.confidence : 'medium'
    },
    recommendation: {
      starterScore: Number(recommendation.starterScore || 0),
      difficulty: Number(recommendation.difficulty || 3),
      gearDependency: Number(recommendation.gearDependency || 3),
      bossing: Number(recommendation.bossing || 3),
      mapping: Number(recommendation.mapping || 3),
      survival: Number(recommendation.survival || 3)
    },
    trend: trend ? {
      ladderCount: trend.count,
      ladderPercent: trend.percent,
      label: trend.percent >= 5 ? '天梯热门' : '天梯观察'
    } : {
      ladderCount: 0,
      ladderPercent: 0,
      label: entry.status === 'preseason' ? '等待开服验证' : '人工审核'
    },
    intro: {
      desc: entry.summary || '',
      pros: entry.pros || [],
      cons: entry.cons || []
    },
    skills: Array.isArray(entry.skills) && entry.skills.length ? entry.skills : defaultSkills,
    equipment: {
      core_uniques: (entry.equipment && entry.equipment.coreUniques) || [],
      rare_priority: (entry.equipment && entry.equipment.rarePriority) || []
    },
    leveling_tips: entry.leveling || [],
    leveling_plan: Array.isArray(entry.levelingPlan) ? entry.levelingPlan : [],
    ascendancy_order: Array.isArray(entry.ascendancyOrder) ? entry.ascendancyOrder : [],
    transition_timing: entry.transitionTiming || '',
    agent_review: entry.agentReview || null,
    guide_sections: entry.guideSections || [],
    sources: entry.sources || []
  };
}

function validateBuilds(builds) {
  const errors = [];
  const ids = {};
  builds.forEach((build, index) => {
    if (!build.id) errors.push(`第 ${index + 1} 条缺少 id`);
    if (ids[build.id]) errors.push(`重复 id: ${build.id}`);
    ids[build.id] = true;
    if (!build.meta || !build.meta.title) errors.push(`${build.id} 缺少标题`);
    if (!build.meta || !build.meta.class) errors.push(`${build.id} 缺少职业`);
    if (!build.recommendation || !build.recommendation.starterScore) errors.push(`${build.id} 缺少开荒评分`);
    if (!build.sources || !build.sources.length) errors.push(`${build.id} 缺少来源说明`);
  });
  return errors;
}

function buildStarterData() {
  const now = new Date().toISOString();
  const manualBuilds = readJson(SOURCE_FILE, []);
  if (!Array.isArray(manualBuilds) || !manualBuilds.length) {
    throw new Error(`开荒源数据为空: ${SOURCE_FILE}`);
  }

  const trendMap = getClassTrendMap();
  const builds = manualBuilds
    .map(entry => normalizeBuild(entry, trendMap, now))
    .sort((a, b) => {
      const updatedDiff = (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0);
      if (updatedDiff !== 0) return updatedDiff;
      if (b.recommendation.starterScore !== a.recommendation.starterScore) {
        return b.recommendation.starterScore - a.recommendation.starterScore;
      }
      return String(a.meta.title).localeCompare(String(b.meta.title), 'zh-CN');
    });

  const errors = validateBuilds(builds);
  if (errors.length) {
    errors.forEach(error => console.error('   ❌ ' + error));
    throw new Error(`开荒 BD 校验失败: ${errors.length} 个错误`);
  }

  writeJson(OUTPUT_FILE, builds);
  console.log(`   ✅ ${path.relative(ROOT, OUTPUT_FILE)} (${builds.length} 条)`);
  return builds;
}

function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  PoE2 0.5 开荒 BD 推荐数据');
  console.log('═'.repeat(60));
  console.log(`  环境: ${envConfig.isProd ? 'production' : 'dev'}`);
  console.log(`  源数据: ${path.relative(ROOT, SOURCE_FILE)}`);
  console.log(`  输出: ${path.relative(ROOT, OUTPUT_FILE)}`);
  console.log('');
  buildStarterData();
  console.log('\n🎉 开荒 BD 推荐数据生成完成');
}

module.exports = { main, buildStarterData };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('❌ 开荒 BD 数据生成失败:', err.message);
    process.exit(1);
  }
}
