#!/usr/bin/env node
/**
 * 生成官方译名词典 base-data/dist/dict_stats_official.json
 *
 * 做法：从国服交易站与国际服交易站各取一份 trade2 元数据，按 id join，
 * 得到官方权威的「英文 ↔ 国服中文」对照表。
 *
 * 用法：
 *   node scripts/build_official_dict.js
 *   node scripts/build_official_dict.js --dry   # 只统计不落盘
 *
 * 两个数据源均为匿名公开接口，可随时重跑刷新（新赛季开服后建议重跑一次）。
 */

const fs = require('fs');
const path = require('path');
const {
  normalizeStatKey,
  stripMarkers,
} = require('../crawlers/shared/officialDict');

const OUT_DIR = path.join(__dirname, '../base-data/dist');

/**
 * 两个游戏的接口路径与产出文件，必须与 crawlers/shared/officialDict.js 的
 * DICT_FILES 保持一致。POE2 走 trade2，POE1 走 trade，数据不可混用。
 */
const GAMES = {
  poe2: {
    label: 'POE2',
    cnBase: 'https://poe.game.qq.com/api/trade2/data',
    intlBase: 'https://www.pathofexile.com/api/trade2/data',
    outFile: 'dict_stats_official.json',
  },
  poe1: {
    label: 'POE1',
    cnBase: 'https://poe.game.qq.com/api/trade/data',
    intlBase: 'https://www.pathofexile.com/api/trade/data',
    outFile: 'dict_stats_official_poe1.json',
  },
};

const UA_CN = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const UA_INTL = 'poe2-tooling/1.0 (data pipeline; contact: repo maintainer)';

async function fetchJson(url, ua, { retries = 3 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua, Accept: 'application/json' },
        signal: AbortSignal.timeout(40000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  throw new Error(`拉取失败 ${url}: ${lastError && lastError.message}`);
}

/** 把 result[].entries[] 摊平成 id -> text */
function flatten(payload) {
  const out = new Map();
  for (const group of payload.result || []) {
    for (const entry of group.entries || []) {
      if (entry && entry.id && typeof entry.text === 'string') out.set(entry.id, entry.text);
    }
  }
  return out;
}

/** 同一个 stat_12345 会同时挂在 explicit./implicit./fractured. 等前缀下，归并掉 */
function baseStatId(id) {
  const m = /stat_[\d|]+$/.exec(id);
  return m ? m[0] : id;
}

function buildStatsDict(cnStats, intlStats) {
  const paired = [];
  for (const [id, cn] of cnStats) {
    const en = intlStats.get(id);
    if (typeof en === 'string' && en && en !== cn) paired.push({ id, en, cn });
  }

  // 按 baseStatId 归并，收集该 id 下所有 (en, cn) 组合
  const byBaseId = new Map();
  for (const item of paired) {
    const key = baseStatId(item.id);
    if (!byBaseId.has(key)) byBaseId.set(key, new Set());
    byBaseId.get(key).add(`${item.en}\u0000${item.cn}`);
  }

  // 归一化英文 → 中文候选集合
  const byKey = new Map();
  for (const combos of byBaseId.values()) {
    for (const combo of combos) {
      const [en, cn] = combo.split('\u0000');
      const key = normalizeStatKey(en);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, new Map());
      const counter = byKey.get(key);
      counter.set(cn, (counter.get(cn) || 0) + 1);
    }
  }

  const result = {};
  const ambiguous = [];
  const rejected = [];
  for (const [key, counter] of byKey) {
    const candidates = [...counter.keys()];
    let usable = candidates;
    if (candidates.length > 1) {
      // 占位符数量必须与英文一致：官方中文里存在把阈值写死的变体
      // （如 "每 10 敏捷使攻击速度提高 #%"），选错会输出错误数值，直接淘汰。
      const expected = (key.match(/#/g) || []).length;
      usable = candidates.filter((cn) => (cn.match(/#/g) || []).length === expected);
      if (usable.length !== candidates.length) {
        rejected.push({ key, dropped: candidates.filter((c) => !usable.includes(c)) });
      }
    }

    if (usable.length === 1) {
      result[key] = { cn: usable[0] };
    } else {
      // 仍无法唯一确定时，宁可回退到原有方案也不猜
      ambiguous.push({ key, candidates });
    }
  }
  return {
    result,
    ambiguous,
    rejected,
    pairedCount: paired.length,
    baseIdCount: byBaseId.size,
  };
}

function buildStaticDict(cnStatic, intlStatic) {
  const byId = {};
  const byEn = {};
  for (const [id, cn] of cnStatic) {
    const en = intlStatic.get(id);
    if (typeof en !== 'string' || !en) continue;
    byId[id] = { en, cn };
    const key = stripMarkers(en).replace(/\s+/g, ' ').trim().toLowerCase();
    if (key && !byEn[key]) byEn[key] = { cn, id };
  }
  return { byId, byEn };
}

function buildLeagues(cnLeagues, intlLeagues) {
  const cn = cnLeagues.result || [];
  const intl = intlLeagues.result || [];
  const leagues = {};
  // 两个接口返回顺序一致（同为 poe2 realm），并按数量取最小公约数逐位对齐
  for (let i = 0; i < Math.min(cn.length, intl.length); i += 1) {
    if (cn[i] && intl[i] && cn[i].id && intl[i].id) leagues[cn[i].id] = intl[i].id;
  }
  const reverse = {};
  for (const [c, e] of Object.entries(leagues)) if (!reverse[e]) reverse[e] = c;
  return { leagues, reverse, cnCount: cn.length, intlCount: intl.length };
}

async function buildGame(gameKey, cfg, dry) {
  console.log(`\n📥 [${cfg.label}] 拉取国服 / 国际服 trade 元数据...`);
  const [cnStatsRaw, cnStaticRaw, cnLeaguesRaw] = await Promise.all([
    fetchJson(`${cfg.cnBase}/stats`, UA_CN),
    fetchJson(`${cfg.cnBase}/static`, UA_CN),
    fetchJson(`${cfg.cnBase}/leagues`, UA_CN),
  ]);
  const [intlStatsRaw, intlStaticRaw, intlLeaguesRaw] = await Promise.all([
    fetchJson(`${cfg.intlBase}/stats`, UA_INTL),
    fetchJson(`${cfg.intlBase}/static`, UA_INTL),
    fetchJson(`${cfg.intlBase}/leagues`, UA_INTL),
  ]);

  const cnStats = flatten(cnStatsRaw);
  const intlStats = flatten(intlStatsRaw);
  const cnStatic = flatten(cnStaticRaw);
  const intlStatic = flatten(intlStaticRaw);

  console.log(`   国服 stats ${cnStats.size} 条 / 国际服 stats ${intlStats.size} 条`);
  console.log(`   国服 static ${cnStatic.size} 条 / 国际服 static ${intlStatic.size} 条`);

  const stats = buildStatsDict(cnStats, intlStats);
  const statics = buildStaticDict(cnStatic, intlStatic);
  const leagues = buildLeagues(cnLeaguesRaw, intlLeaguesRaw);

  console.log(`   配对成功 ${stats.pairedCount} 条 → 归并后 ${stats.baseIdCount} 个 stat id`);
  console.log(`   可查询词缀键 ${Object.keys(stats.result).length} 个（歧义丢弃 ${stats.ambiguous.length} 个，占位符不符淘汰 ${stats.rejected.length} 个）`);
  console.log(`   可查询道具名 ${Object.keys(statics.byEn).length} 个`);
  console.log(`   赛季对照 ${Object.keys(leagues.leagues).length} 条`);

  for (const [cn, intl] of Object.entries(leagues.leagues).slice(0, 8)) {
    console.log(`     ${cn}  ↔  ${intl}`);
  }

  const doc = {
    meta: {
      game: gameKey,
      generatedAt: new Date().toISOString(),
      sourceCn: `${cfg.cnBase}/{stats,static,leagues}`,
      sourceIntl: `${cfg.intlBase}/{stats,static,leagues}`,
      note: '官方英中配对词典，按 stat id / 英文名 join。匿名公开接口，可重跑刷新。',
      counts: {
        pairedStats: stats.pairedCount,
        statsByEn: Object.keys(stats.result).length,
        statsAmbiguousDropped: stats.ambiguous.length,
        statsPlaceholderRejected: stats.rejected.length,
        staticByEn: Object.keys(statics.byEn).length,
        leagues: Object.keys(leagues.leagues).length,
      },
    },
    leagues: leagues.leagues,
    leaguesReverse: leagues.reverse,
    statsByEn: stats.result,
    staticByEn: statics.byEn,
    staticById: statics.byId,
  };

  if (dry) {
    console.log('   --dry 模式，未写入文件。');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, cfg.outFile);
  fs.writeFileSync(outPath, JSON.stringify(doc));
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`   ✅ 已写入 base-data/dist/${cfg.outFile} (${kb} KB)`);
}

async function main() {
  const dry = process.argv.includes('--dry');
  const gameArg = process.argv.find((a) => a.startsWith('--game='));
  const targets = gameArg ? [gameArg.split('=')[1]] : Object.keys(GAMES);

  for (const gameKey of targets) {
    const cfg = GAMES[gameKey];
    if (!cfg) {
      console.error(`❌ 未知游戏: ${gameKey}（可选 ${Object.keys(GAMES).join(' / ')}）`);
      process.exit(1);
    }
    await buildGame(gameKey, cfg, dry);
  }
  console.log('\n全部完成。');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 生成失败:', error.message);
    process.exit(1);
  });
}

module.exports = { buildStatsDict, buildStaticDict, buildLeagues, normalizeStatKey };
