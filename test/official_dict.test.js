/**
 * 官方译名词典（crawlers/shared/officialDict.js）单元测试
 *
 * 词典数据来自 base-data/dist/dict_stats_official*.json。
 * 若词典文件缺失，isReady() 为 false，本测试会显式跳过，
 * 避免在未生成词典的环境里产生误导性的失败。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const dict = require('../crawlers/shared/officialDict');
const { translateStatText } = require('../crawlers/poe1/translations');

const hasPoe2 = dict.isReady('poe2');
const hasPoe1 = dict.isReady('poe1');

// ---------------------------------------------------------------- 归一化逻辑

test('stripMarkers 还原 GGG 富文本标记', () => {
  assert.equal(dict.stripMarkers('+5 to all [Attributes]'), '+5 to all Attributes');
  assert.equal(
    dict.stripMarkers('+15% to [Resistances|Fire Resistance]'),
    '+15% to Fire Resistance',
  );
  assert.equal(dict.stripMarkers('A [X|B] and [C]'), 'A B and C');
});

test('stripMarkers 统一破折号并容忍空值', () => {
  assert.equal(dict.stripMarkers('Physical Damage: 10–20'), 'Physical Damage: 10-20');
  assert.equal(dict.stripMarkers(null), '');
  assert.equal(dict.stripMarkers(undefined), '');
});

test('normalizeStatKey 把数字换成 # 但保留百分号', () => {
  assert.equal(dict.normalizeStatKey('+20 to maximum Life'), '# to maximum life');
  assert.equal(dict.normalizeStatKey('15% increased Warcry Speed'), '#% increased warcry speed');
  // 官方模板里的字面 # 必须原样保留，才能与游戏内的具体数值对齐
  assert.equal(dict.normalizeStatKey('#% increased Warcry Speed'), '#% increased warcry speed');
  // 空白归一 + 大小写归一
  assert.equal(dict.normalizeStatKey('  Adds   5  to  10  Physical Damage '), 'adds # to # physical damage');
});

test('normalizeStatKey 会先剥离标记再归一', () => {
  assert.equal(dict.normalizeStatKey('+5 to all [Attributes]'), '# to all attributes');
  assert.equal(dict.normalizeStatKey('+15% to [Resistances|Fire Resistance]'), '#% to fire resistance');
});

test('normalizeStatKey 折叠模板里的字面正负号', () => {
  // 官方模板 "+#% total to Cold Resistance" 与游戏内 "+15% total to Cold Resistance"
  // 必须归一到同一个键，否则这类词缀会整批漏命中
  assert.equal(
    dict.normalizeStatKey('+#% total to Cold Resistance'),
    dict.normalizeStatKey('+15% total to Cold Resistance'),
  );
  assert.equal(dict.normalizeStatKey('+#% total to Cold Resistance'), '#% total to cold resistance');
  assert.equal(dict.normalizeStatKey('-#% total to Cold Resistance'), '#% total to cold resistance');
});

test('extractNumbers 保留正负号且忽略百分号', () => {
  assert.deepEqual(dict.extractNumbers('+20 to maximum Life'), ['+20']);
  assert.deepEqual(dict.extractNumbers('15% increased Warcry Speed'), ['15']);
  assert.deepEqual(dict.extractNumbers('Adds 5 to 10 Physical Damage'), ['5', '10']);
  assert.deepEqual(dict.extractNumbers('-12% to Fire Resistance'), ['-12']);
  assert.deepEqual(dict.extractNumbers('no numbers here'), []);
});

test('fillTemplate 按序回填占位符', () => {
  assert.equal(dict.fillTemplate('战吼速度提高 #%', ['15']), '战吼速度提高 15%');
  assert.equal(dict.fillTemplate('# 生命上限', ['+20']), '+20 生命上限');
  assert.equal(dict.fillTemplate('附加 # - # 物理伤害', ['5', '10']), '附加 5 - 10 物理伤害');
  // 数字不够时保留 # 而不是崩溃
  assert.equal(dict.fillTemplate('附加 # - # 伤害', ['5']), '附加 5 - # 伤害');
});

test('fillTemplate 不产生重复符号，且负向以数字为准', () => {
  // 模板自带字面 +，数字也带 +，不能拼成 "++15"
  assert.equal(dict.fillTemplate('+#% 总冰霜抗性', ['+15']), '+15% 总冰霜抗性');
  // 负向 roll 必须显示负号，不能被模板的字面 + 吃掉
  assert.equal(dict.fillTemplate('+#% 总冰霜抗性', ['-10']), '-10% 总冰霜抗性');
  // 数字不带符号时沿用模板的字面符号
  assert.equal(dict.fillTemplate('+#% 总冰霜抗性', ['15']), '+15% 总冰霜抗性');
});

// ---------------------------------------------------------------- 词典查询

test('POE2 词典已生成且规模合理', { skip: !hasPoe2 && '词典未生成' }, () => {
  const counts = dict.getMeta('poe2').counts;
  assert.ok(counts.statsByEn > 3000, `statsByEn 过少: ${counts.statsByEn}`);
  assert.ok(counts.staticByEn > 500, `staticByEn 过少: ${counts.staticByEn}`);
  assert.equal(dict.getMeta('poe2').game, 'poe2');
});

test('POE2 官方词缀查询命中并正确回填数值', { skip: !hasPoe2 && '词典未生成' }, () => {
  assert.equal(dict.lookupOfficialStat('+20 to maximum Life'), '+20 生命上限');
  assert.equal(dict.lookupOfficialStat('15% increased Warcry Speed'), '战吼速度提高 15%');
  assert.equal(dict.lookupOfficialStat('Adds 5 to 10 Physical Damage'), '附加 5 - 10 物理伤害');
});

test('真实数值文本（含符号）能被命中且符号正确', { skip: !hasPoe2 && '词典未生成' }, () => {
  // 官方模板是 "+#% total to Cold Resistance"，游戏内写作 "+15% ..."
  assert.equal(dict.lookupOfficialStat('+15% total to Cold Resistance'), '+15% 总冰霜抗性');
  assert.equal(dict.lookupOfficialStat('-10% total to Lightning Resistance'), '-10% 总闪电抗性');
  assert.equal(dict.lookupOfficialStat('-20 to maximum Life'), '-20 生命上限');
});

test('禁用开关生效，可一键回退到接入前的行为', () => {
  process.env.DISABLE_OFFICIAL_DICT = '1';
  try {
    assert.equal(dict.isDisabled(), true);
    assert.equal(dict.lookupOfficialStat('+20 to maximum Life'), null);
    assert.equal(dict.lookupOfficialStatic('Scroll of Wisdom'), null);
    assert.equal(dict.leagueCnToIntl('周年庆巅峰挑战', 'poe2'), null);
  } finally {
    delete process.env.DISABLE_OFFICIAL_DICT;
  }
  assert.equal(dict.isDisabled(), false);
});

test('POE2 查询会先剥离 [Term|Display] 标记', { skip: !hasPoe2 && '词典未生成' }, () => {
  assert.equal(dict.lookupOfficialStat('+15% to [Resistances|Fire Resistance]'), '火焰抗性 +15%');
});

test('未收录的词缀返回 null，交由调用方回退', { skip: !hasPoe2 && '词典未生成' }, () => {
  assert.equal(dict.lookupOfficialStat('TOTALLY UNKNOWN MOD TEXT XYZ'), null);
  assert.equal(dict.lookupOfficialStat(''), null);
  assert.equal(dict.lookupOfficialStat(null), null);
  assert.equal(dict.lookupOfficialStat(undefined), null);
});

test('两个游戏的词典严格隔离', { skip: !(hasPoe1 && hasPoe2) && '词典未生成' }, () => {
  // "Socketed Gems" 是 POE1 独有词缀，POE2 词典里不应存在
  assert.ok(dict.lookupOfficialStat('+# total to Level of Socketed Gems', 'poe1'));
  assert.equal(dict.lookupOfficialStat('+# total to Level of Socketed Gems', 'poe2'), null);

  assert.equal(dict.getMeta('poe2').game, 'poe2');
  assert.equal(dict.getMeta('poe1').game, 'poe1');
  // 未知游戏名回退到默认（POE2），不抛异常
  assert.equal(dict.getMeta('nope').game, 'poe2');
});

test('官方道具名查询', { skip: !hasPoe2 && '词典未生成' }, () => {
  assert.equal(dict.lookupOfficialStatic('Scroll of Wisdom'), '知识卷轴');
  assert.equal(dict.lookupOfficialStatic('Lesser Desert Rune'), '次级沙漠符文');
  // 大小写不敏感
  assert.equal(dict.lookupOfficialStatic('scroll of wisdom'), '知识卷轴');
  assert.equal(dict.lookupOfficialStatic('Not A Real Item'), null);
});

// ---------------------------------------------------------------- 赛季映射

test('赛季名双向映射', { skip: !hasPoe2 && '词典未生成' }, () => {
  assert.equal(dict.leagueCnToIntl('周年庆巅峰挑战'), 'Forbidden Rites');
  assert.equal(dict.leagueIntlToCn('Forbidden Rites'), '周年庆巅峰挑战');
  assert.equal(dict.leagueCnToIntl('不存在的赛季'), null);
  assert.equal(dict.leagueIntlToCn('Not A League'), null);
  assert.equal(dict.leagueCnToIntl(null), null);
});

test('POE1 赛季名映射与 POE2 分离', { skip: !hasPoe1 && '词典未生成' }, () => {
  assert.equal(dict.leagueCnToIntl('S30赛季', 'poe1'), 'Allflame');
  assert.equal(dict.leagueIntlToCn('Allflame', 'poe1'), 'S30赛季');
  // POE1 的赛季名不应出现在 POE2 词典
  assert.equal(dict.leagueCnToIntl('S30赛季', 'poe2'), null);
});

// ---------------------------------------------------------------- 管线集成

test('POE1 translateStatText 优先返回官方译名', { skip: !hasPoe1 && '词典未生成' }, () => {
  assert.equal(translateStatText('+#% total to Cold Resistance'), '+#% 总冰霜抗性');
  assert.equal(translateStatText('+# total to Level of Socketed Gems'), '+#宝石等级');
  assert.equal(translateStatText('+#% total Elemental Resistance'), '+#% 总元素抗性');
});

test('POE1 translateStatText 未命中时仍走原有回退链', { skip: !hasPoe1 && '词典未生成' }, () => {
  // 官方未收录 → 落到关键词替换，不应变成空串或抛异常
  const out = translateStatText('TOTALLY UNKNOWN MOD TEXT XYZ');
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0);
  assert.equal(translateStatText(''), '');
});

test('POE2 translateSingleMod 已接入官方词典', { skip: !hasPoe2 && '词典未生成' }, () => {
  const { translateSingleMod, translateMods } = require('../auto_browser/translate_crawler');
  assert.equal(translateSingleMod('15% increased Warcry Speed'), '战吼速度提高 15%');
  assert.equal(translateSingleMod('Grenade Skills Fire an additional Projectile'), '榴弹技能发射 1 个额外投射物');
  // 多行词缀按行翻译
  assert.equal(
    translateMods(['15% increased Warcry Speed', 'TOTALLY UNKNOWN MOD TEXT XYZ']).split('\n').length,
    2,
  );
});
