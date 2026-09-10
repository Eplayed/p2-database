#!/usr/bin/env node
/**
 * 官方词典对译名质量的回归对比报告
 *
 * 做法：取官方英文词缀全集作为基准输入，分别以「关闭官方词典」（= 接入前的旧行为）
 * 和「启用官方词典」跑一遍现有翻译函数，统计与官方中文的吻合度。
 *
 * 用法：
 *   node scripts/report_official_dict_impact.js
 *   node scripts/report_official_dict_impact.js --game=poe2
 *   node scripts/report_official_dict_impact.js --samples=15
 */

const dict = require('../crawlers/shared/officialDict');

const GAMES = {
  poe2: {
    label: 'POE2',
    cnBase: 'https://poe.game.qq.com/api/trade2/data',
    intlBase: 'https://www.pathofexile.com/api/trade2/data',
  },
  poe1: {
    label: 'POE1',
    cnBase: 'https://poe.game.qq.com/api/trade/data',
    intlBase: 'https://www.pathofexile.com/api/trade/data',
  },
};

const UA_CN = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const UA_INTL = 'poe2-tooling/1.0 (data pipeline)';

async function fetchJson(url, ua) {
  const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function flatten(payload) {
  const out = new Map();
  for (const g of payload.result || []) {
    for (const e of g.entries || []) {
      if (e && e.id && typeof e.text === 'string') out.set(e.id, e.text);
    }
  }
  return out;
}

/** 取双方都有的 stat id，得到官方英文 → 官方中文的基准对 */
async function loadPairs(cfg) {
  const [cnRaw, intlRaw] = await Promise.all([
    fetchJson(`${cfg.cnBase}/stats`, UA_CN),
    fetchJson(`${cfg.intlBase}/stats`, UA_INTL),
  ]);
  const cn = flatten(cnRaw);
  const intl = flatten(intlRaw);
  const pairs = [];
  for (const [id, cnText] of cn) {
    const enText = intl.get(id);
    if (typeof enText === 'string' && enText && enText !== cnText) {
      pairs.push({ en: enText, cn: cnText });
    }
  }
  return pairs;
}

function measure(pairs, translate) {
  let exact = 0;
  let different = 0;
  let untranslated = 0;
  for (const { en, cn } of pairs) {
    let out;
    try {
      out = translate(en);
    } catch (error) {
      out = en;
    }
    if (!out || out === en) untranslated += 1;
    else if (out === cn) exact += 1;
    else different += 1;
  }
  const total = pairs.length || 1;
  return {
    total: pairs.length,
    exact,
    different,
    untranslated,
    exactRate: (exact / total) * 100,
    untranslatedRate: (untranslated / total) * 100,
    coverageRate: ((total - untranslated) / total) * 100,
  };
}

function pct(n) {
  return `${n.toFixed(1)}%`;
}

function printMetrics(name, m) {
  console.log(`  ${name}`);
  console.log(`    完全命中官方中文 : ${String(m.exact).padStart(6)}  (${pct(m.exactRate)})`);
  console.log(`    有译文但与官方不符: ${String(m.different).padStart(6)}  (${pct((m.different / m.total) * 100)})`);
  console.log(`    完全未翻译(留英文): ${String(m.untranslated).padStart(6)}  (${pct(m.untranslatedRate)})`);
  console.log(`    ▶ 已翻译覆盖率    : ${pct(m.coverageRate)}`);
}

async function reportGame(gameKey, cfg, sampleCount) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${cfg.label}  官方词缀全集回归对比`);
  console.log('='.repeat(64));

  const pairs = await loadPairs(cfg);
  console.log(`  基准输入：官方英文词缀 ${pairs.length} 条\n`);

  const translate =
    gameKey === 'poe2'
      ? require('../auto_browser/translate_crawler').translateSingleMod
      : require('../crawlers/poe1/translations').translateStatText;

  // 旧行为：关闭官方词典
  process.env.DISABLE_OFFICIAL_DICT = '1';
  const before = measure(pairs, translate);

  // 新行为：启用官方词典
  delete process.env.DISABLE_OFFICIAL_DICT;
  const after = measure(pairs, translate);

  printMetrics('接入前（禁用官方词典）', before);
  console.log('');
  printMetrics('接入后（启用官方词典）', after);

  console.log('\n  ── 变化 ──');
  console.log(`    命中率      ${pct(before.exactRate)}  →  ${pct(after.exactRate)}   (+${(after.exactRate - before.exactRate).toFixed(1)} 个百分点)`);
  console.log(`    未翻译率    ${pct(before.untranslatedRate)}  →  ${pct(after.untranslatedRate)}   (${(after.untranslatedRate - before.untranslatedRate).toFixed(1)} 个百分点)`);
  console.log(`    覆盖率      ${pct(before.coverageRate)}  →  ${pct(after.coverageRate)}   (+${(after.coverageRate - before.coverageRate).toFixed(1)} 个百分点)`);

  if (sampleCount > 0) {
    console.log(`\n  ── 抽样对照（接入前 → 接入后）──`);
    let shown = 0;
    for (const { en, cn } of pairs) {
      if (shown >= sampleCount) break;
      process.env.DISABLE_OFFICIAL_DICT = '1';
      const oldOut = translate(en);
      delete process.env.DISABLE_OFFICIAL_DICT;
      const newOut = translate(en);
      if (oldOut === newOut) continue;
      shown += 1;
      console.log(`    EN   ${en}`);
      console.log(`    官方 ${cn}`);
      console.log(`    旧译 ${oldOut}`);
      console.log(`    新译 ${newOut}`);
      console.log('');
    }
  }

  return { before, after };
}

async function main() {
  const gameArg = process.argv.find((a) => a.startsWith('--game='));
  const sampleArg = process.argv.find((a) => a.startsWith('--samples='));
  const sampleCount = sampleArg ? Number(sampleArg.split('=')[1]) : 6;
  const targets = gameArg ? [gameArg.split('=')[1]] : Object.keys(GAMES);

  for (const key of targets) {
    if (!GAMES[key]) {
      console.error(`未知游戏: ${key}`);
      process.exit(1);
    }
    if (!dict.isReady(key)) {
      console.error(`\n${GAMES[key].label} 词典未生成，请先运行 node scripts/build_official_dict.js`);
      continue;
    }
    await reportGame(key, GAMES[key], sampleCount);
  }
  console.log('\n完成。');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('报告生成失败:', error.message);
    process.exit(1);
  });
}
