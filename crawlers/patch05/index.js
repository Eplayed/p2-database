#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../auto_browser/.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const envConfig = require('../../auto_browser/env-config');
const { fetchWithRetry } = require('../poe2db-dict/http_client');
const { SOURCES } = require('./sources');
const { parseSourcePage } = require('./parser');
const { groupEntries, loadOverrides, normalizeEntry } = require('./normalize');
const { validateEntries, validateOutputFiles } = require('./validate');
const { buildPatch05Economy } = require('./economy');

const ROOT = path.join(__dirname, '../..');
const PATCH_DIR = path.join(envConfig.dataDir, 'patch-0.5');
const BASE_DIR = path.join(ROOT, 'base-data/patch05');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(fileName, data) {
  if (!fs.existsSync(PATCH_DIR)) fs.mkdirSync(PATCH_DIR, { recursive: true });
  const filePath = path.join(PATCH_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`   ✅ ${path.relative(ROOT, filePath)}`);
}

function createContentVersion(data) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 12);
}

async function fetchSourcePages() {
  const pages = [];
  for (const source of Object.values(SOURCES)) {
    try {
      console.log(`   🔎 ${source.name}: ${source.url}`);
      const html = await fetchWithRetry(source.url);
      pages.push(parseSourcePage(html, source));
    } catch (err) {
      console.warn(`   ⚠️ ${source.key} 抓取失败: ${err.message}`);
      pages.push({
        ...source,
        title: '',
        description: '',
        links: [],
        checkedAt: new Date().toISOString().slice(0, 10),
        error: err.message,
      });
    }
  }
  return pages;
}

function buildChecklist() {
  return [
    {
      id: 'patch05_read_overview',
      group: '版本准备',
      name: '阅读 0.5 版本重点',
      description: '了解奥杜尔秘符、终局重做、异界推进和新经济分类。',
      priority: 'high',
      sourceKey: 'poe2db_version_050',
    },
    {
      id: 'patch05_unlock_runeforging',
      group: '赛季机制',
      name: '解锁并理解符文锻造',
      description: '确认符文锻造入口、符文类型和相关奖励。',
      priority: 'high',
      sourceKey: 'poe2db_runeforging',
    },
    {
      id: 'patch05_track_runic_ward',
      group: '赛季机制',
      name: '确认符文结界相关收益',
      description: '记录符文结界与卡古兰技能、符文玩法的联动。',
      priority: 'medium',
      sourceKey: 'poe2db_runes_of_aldur',
    },
    {
      id: 'patch05_atlas_masters',
      group: '终局推进',
      name: '推进异界大师任务',
      description: '逐步完成异界大师相关任务线，记录解锁节点。',
      priority: 'high',
      sourceKey: 'poe2db_version_050',
    },
    {
      id: 'patch05_fortress_progress',
      group: '终局推进',
      name: '推进要塞目标',
      description: '把要塞推进作为终局 Boss 解锁路径的关键检查项。',
      priority: 'medium',
      sourceKey: 'poe2db_version_050',
    },
    {
      id: 'patch05_boss_unlocks',
      group: 'Boss',
      name: '记录巅峰 Boss 解锁',
      description: '版本初期先记录解锁方式，掉落表稳定后再补充收益判断。',
      priority: 'medium',
      sourceKey: 'poe2db_version_050',
    },
  ].map(item => ({
    ...item,
    completed: false,
    source: {
      name: SOURCES[item.sourceKey]?.name || 'manual',
      url: SOURCES[item.sourceKey]?.url || '',
      checkedAt: new Date().toISOString().slice(0, 10),
      confidence: SOURCES[item.sourceKey]?.confidence || 'medium',
    },
  }));
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  PoE2 0.5 中文资料数据管线');
  console.log('═'.repeat(60));
  console.log(`  环境: ${envConfig.isProd ? 'production' : 'dev'}`);
  console.log(`  输出: ${PATCH_DIR}`);
  console.log('');

  const manualEntries = readJson(path.join(BASE_DIR, 'manual_entries.json'), []);
  const guideContent = readJson(path.join(BASE_DIR, 'guide_content.json'), {
    mustWatch: [],
    bossGuides: [],
  });
  const overridesJson = readJson(path.join(BASE_DIR, 'overrides.zh-CN.json'), { entries: {} });
  const overrides = loadOverrides(overridesJson);

  const sourcePages = await fetchSourcePages();
  const entries = manualEntries.map(entry => normalizeEntry(entry, overrides));
  const validation = validateEntries(entries);
  for (const warning of validation.warnings) console.warn(`   ⚠️ ${warning}`);
  if (validation.errors.length) {
    for (const error of validation.errors) console.error(`   ❌ ${error}`);
    throw new Error(`0.5 数据校验失败: ${validation.errors.length} 个错误`);
  }

  const grouped = groupEntries(entries);
  const now = new Date().toISOString();
  const quickStart = [
    {
      stage: '剧情开荒',
      title: '优先解锁符文锻造',
      description: '跟随赛季任务解锁维金符文锻造，先理解符文配方和遗物遭遇。',
      entryId: 'rune_system_runeforging',
    },
    {
      stage: '装备过渡',
      title: '用符文结界补足生存',
      description: '开荒期先把符文结界当作防御补强，再根据 BD 需求决定投入。',
      entryId: 'rune_system_runic_ward',
    },
    {
      stage: '进入异界',
      title: '推进大师与要塞',
      description: '优先完成异界大师任务和要塞地图，逐步获取长期异界收益。',
      entryId: 'endgame_atlas_masters',
    },
    {
      stage: '经济观察',
      title: '新通货先观察再投入',
      description: '合金通货、古代符文和元工艺符文价格波动大，先看每日行情。',
      entryId: 'currency_alloy_currency',
    },
  ];
  const index = {
    version: '0.5.0',
    seasonName: '奥杜尔秘符',
    updatedAt: now,
    categories: [
      { key: 'items', name: '版本重点', file: 'patch05_items.json', count: grouped.items.length },
      { key: 'runes', name: '符文', file: 'patch05_runes.json', count: grouped.runes.length },
      { key: 'currencies', name: '新通货', file: 'patch05_currencies.json', count: grouped.currencies.length },
      { key: 'kalguuran_gems', name: '卡古兰技能', file: 'patch05_kalguuran_gems.json', count: grouped.kalguuranGems.length },
      { key: 'bosses', name: '终局 Boss', file: 'patch05_bosses.json', count: grouped.bosses.length },
      { key: 'checklist', name: '终局清单', file: 'patch05_endgame_checklist.json', count: 6 },
    ],
  };
  const catalogCore = {
    version: '0.5.0',
    seasonName: '奥杜尔秘符',
    categories: index.categories,
    quickStart,
    mustWatch: guideContent.mustWatch || [],
    bossGuides: guideContent.bossGuides || [],
    entries,
  };
  const contentVersion = createContentVersion(catalogCore);
  const catalog = {
    ...catalogCore,
    schemaVersion: 1,
    contentVersion,
    updatedAt: now,
  };
  const version = {
    version: '0.5.0',
    schemaVersion: 2,
    contentVersion,
    catalogFile: 'patch05_catalog.json',
    updatedAt: now,
    sourceCount: sourcePages.length,
    entryCount: entries.length,
  };
  const checklist = buildChecklist();
  const patch05EconomyResult = buildPatch05Economy({
    currencies: grouped.currencies,
    updatedAt: now,
  });
  const files = {
    'version.json': version,
    'patch05_catalog.json': catalog,
    'patch05_index.json': index,
    'patch05_items.json': grouped.items,
    'patch05_runes.json': grouped.runes,
    'patch05_currencies.json': grouped.currencies,
    'patch05_economy.json': patch05EconomyResult.economy,
    'patch05_economy_watch.json': patch05EconomyResult.watch,
    'patch05_kalguuran_gems.json': grouped.kalguuranGems,
    'patch05_bosses.json': grouped.bosses,
    'patch05_endgame_checklist.json': checklist,
    'patch05_sources.json': sourcePages,
  };

  const outputErrors = validateOutputFiles(files);
  if (outputErrors.length) {
    for (const error of outputErrors) console.error(`   ❌ ${error}`);
    throw new Error(`输出校验失败: ${outputErrors.length} 个错误`);
  }

  for (const [fileName, data] of Object.entries(files)) {
    writeJson(fileName, data);
  }

  console.log('\n🎉 0.5 数据生成完成');
}

module.exports = { main };

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 0.5 数据生成失败:', err.message);
    process.exit(1);
  });
}
