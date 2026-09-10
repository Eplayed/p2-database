/**
 * 官方译名词典（腾讯国服交易站 × 国际服交易站）
 *
 * 数据来源（均为匿名公开接口，无需登录）：
 *   POE2 国服中文：https://poe.game.qq.com/api/trade2/data/{stats,static,leagues}
 *   POE2 国际英文：https://www.pathofexile.com/api/trade2/data/{stats,static,leagues}
 *   POE1 国服中文：https://poe.game.qq.com/api/trade/data/{stats,static,leagues}
 *   POE1 国际英文：https://www.pathofexile.com/api/trade/data/{stats,static,leagues}
 *
 * 同一游戏的两边共用一套 stat id，按 id join 即可得到官方权威的「英文 ↔ 国服中文」对照。
 * 两个游戏的数据严格隔离：POE2 走 trade2，POE1 走 trade，词典文件也分开，不可混用。
 *
 * 本模块同时被两处消费：
 *   1. scripts/build_official_dict.js —— 生成 base-data/dist/dict_stats_official*.json
 *   2. auto_browser/translate_crawler.js、crawlers/poe1/translations.js —— 运行时查询
 *
 * ⚠️ 生成与查询必须走同一套 normalizeStatKey，否则 key 对不上。
 */

const fs = require('fs');
const path = require('path');

const DICT_DIR = path.join(__dirname, '../../base-data/dist');

/** 每个游戏的词典文件名，必须与 scripts/build_official_dict.js 的 GAMES 保持一致 */
const DICT_FILES = {
  poe2: 'dict_stats_official.json',
  poe1: 'dict_stats_official_poe1.json',
};

const DEFAULT_GAME = 'poe2';

/**
 * 剥离 GGG 富文本标记。
 * 游戏内文本形如 "+5 to all [Attributes]"、"+15% to [Resistances|Fire Resistance]"，
 * 而官方交易站词缀不含这些标记，必须先还原成显示文本才能对齐。
 */
function stripMarkers(text) {
  return String(text == null ? '' : text)
    .replace(/\[[^\]|]*\|([^\]]+)\]/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    // 破折号统一为连字符：官方文本里区间用 –（U+2013），游戏内文本用 -
    .replace(/[–—]/g, '-');
}

const NUMBER_RE = /[-+]?\d+(?:\.\d+)?/g;

/**
 * 归一化为查询键：剥离标记 → 去掉紧邻占位符的字面正负号 → 数字换成 # → 压缩空白 → 小写。
 *
 * 两个要点：
 * 1. 只吃掉数字本身，不吃百分号。官方模板里 "#%" 与 "#" 是两种不同写法，
 *    保留 % 才能让 "15% increased X" 与 "#% increased X" 正确对齐。
 * 2. 官方模板可能自带字面符号（如 "+#% total to Cold Resistance"），而游戏内文本
 *    写作 "+15% total to Cold Resistance"，其中 "+" 会被数字正则一并吃掉。
 *    若不先把字面 "+#" 折叠成 "#"，两边就永远对不上，这类词缀会整批漏命中。
 */
function normalizeStatKey(text) {
  return stripMarkers(text)
    .replace(/[-+](?=#)/g, '')
    .replace(NUMBER_RE, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** 提取文本中的数字字面量（含正负号），用于回填中文模板 */
function extractNumbers(text) {
  return stripMarkers(text).match(NUMBER_RE) || [];
}

/** 把提取到的数字按序回填进中文模板的 # 占位符 */
function fillTemplate(template, numbers) {
  let i = 0;
  return String(template).replace(/([-+]?)#/g, (match, sign) => {
    if (i >= numbers.length) return match;
    const value = numbers[i];
    i += 1;

    const valueSign = value[0] === '+' || value[0] === '-' ? value[0] : '';
    const digits = valueSign ? value.slice(1) : value;
    // 官方模板可能自带字面符号（如 "+#% 总冰霜抗性"），但模板只反映正向写法：
    // 负向 roll（如 -10%）必须显示负号，所以数字自带符号时一律以数字为准，
    // 只有数字不带符号时才沿用模板的字面符号。
    const finalSign = valueSign || sign;
    return finalSign + digits;
  });
}

const cache = new Map();

/** 空词典：词典缺失或被禁用时使用，调用方随即回退到原有正则/关键词方案 */
const EMPTY_DICT = { statsByEn: {}, staticByEn: {}, leagues: {}, leaguesReverse: {} };

/**
 * 应急开关：DISABLE_OFFICIAL_DICT=1 时整体退回接入官方词典之前的行为。
 * 用于线上出现问题时的快速回滚，以及新旧译名的 A/B 对比。
 */
function isDisabled() {
  return process.env.DISABLE_OFFICIAL_DICT === '1';
}

function dictPath(game) {
  return path.join(DICT_DIR, DICT_FILES[game] || DICT_FILES[DEFAULT_GAME]);
}

function loadDict(game = DEFAULT_GAME) {
  if (isDisabled()) return EMPTY_DICT;

  const key = DICT_FILES[game] ? game : DEFAULT_GAME;
  if (cache.has(key)) return cache.get(key);

  let dict;
  try {
    dict = JSON.parse(fs.readFileSync(dictPath(key), 'utf8'));
  } catch (error) {
    // 词典尚未生成时不阻断管线，调用方回退到原有的正则/关键词方案
    dict = EMPTY_DICT;
  }
  cache.set(key, dict);
  return dict;
}

function isReady(game = DEFAULT_GAME) {
  const dict = loadDict(game);
  return Object.keys(dict.statsByEn || {}).length > 0;
}

/**
 * 查询官方词缀译名。
 * @param {string} text 原始英文词缀（可含 [Term|Display] 标记与具体数值）
 * @param {'poe2'|'poe1'} game
 * @returns {string|null} 回填数值后的官方中文；未命中返回 null，由调用方走原有回退链
 */
function lookupOfficialStat(text, game = DEFAULT_GAME) {
  if (!text) return null;
  const dict = loadDict(game);
  const entry = dict.statsByEn && dict.statsByEn[normalizeStatKey(text)];
  if (!entry || !entry.cn) return null;
  return fillTemplate(entry.cn, extractNumbers(text));
}

/**
 * 查询官方底材 / 通货 / 符文 / 精华等名称译名。
 * @param {string} name 英文名，如 "Scroll of Wisdom"
 * @param {'poe2'|'poe1'} game
 * @returns {string|null}
 */
function lookupOfficialStatic(name, game = DEFAULT_GAME) {
  if (!name) return null;
  const dict = loadDict(game);
  const key = stripMarkers(name).replace(/\s+/g, ' ').trim().toLowerCase();
  const entry = dict.staticByEn && dict.staticByEn[key];
  return entry && entry.cn ? entry.cn : null;
}

/** 国服赛季名 → 国际服赛季名 */
function leagueCnToIntl(name, game = DEFAULT_GAME) {
  if (!name) return null;
  const dict = loadDict(game);
  return (dict.leagues && dict.leagues[name]) || null;
}

/** 国际服赛季名 → 国服赛季名 */
function leagueIntlToCn(name, game = DEFAULT_GAME) {
  if (!name) return null;
  const dict = loadDict(game);
  return (dict.leaguesReverse && dict.leaguesReverse[name]) || null;
}

function getMeta(game = DEFAULT_GAME) {
  return loadDict(game).meta || {};
}

/** 清空缓存，供测试或重新生成词典后使用 */
function resetCache() {
  cache.clear();
}

module.exports = {
  DICT_FILES,
  DEFAULT_GAME,
  dictPath,
  isDisabled,
  stripMarkers,
  normalizeStatKey,
  extractNumbers,
  fillTemplate,
  loadDict,
  isReady,
  resetCache,
  lookupOfficialStat,
  lookupOfficialStatic,
  leagueCnToIntl,
  leagueIntlToCn,
  getMeta,
};
