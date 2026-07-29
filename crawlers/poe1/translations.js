const fs = require('fs');
const path = require('path');

function readJson(fileName, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../../base-data/dist', fileName), 'utf8'));
  } catch (error) {
    return fallback;
  }
}

const DIST_GEMS = readJson('dict_gem.json', {});
const DIST_BASES = readJson('dict_base.json', {});
const DIST_UNIQUES = readJson('dict_unique.json', {});
const DIST_STATS = readJson('dict_stats.json', { keywords: {}, patterns: [] });
const LOCAL_STAT_KEYWORDS = {
  Armour: '护甲',
  Attack: '攻击',
  Attacks: '攻击',
  Chance: '几率',
  Chaos: '混沌',
  Cold: '冰霜',
  Critical: '暴击',
  Damage: '伤害',
  Dexterity: '敏捷',
  Duration: '持续时间',
  Effect: '效果',
  Elemental: '元素',
  Enemies: '敌人',
  Enemy: '敌人',
  Energy: '能量',
  Evasion: '闪避值',
  Fire: '火焰',
  Global: '全局',
  Intelligence: '智慧',
  Life: '生命',
  Lightning: '闪电',
  Mana: '魔力',
  Melee: '近战',
  Minions: '召唤生物',
  Multiplier: '加成',
  Physical: '物理',
  Rating: '值',
  Resistance: '抗性',
  Shield: '护盾',
  Spell: '法术',
  Spells: '法术',
  Strength: '力量',
  Strike: '打击',
  taken: '承受'
};

const CLASS_NAMES = {
  Assassin: '刺客', Berserker: '狂战士', Champion: '冠军', Chieftain: '酋长',
  Deadeye: '锐眼', Elementalist: '元素使', Gladiator: '角斗士', Guardian: '守护者',
  Hierophant: '圣宗', Inquisitor: '判官', Juggernaut: '勇士', Necromancer: '死灵师',
  Occultist: '秘术师', Pathfinder: '药侠', Raider: '侠客', Saboteur: '破坏者',
  Slayer: '处刑者', Trickster: '诡术师', Warden: '守望者', Ascendant: '贵族',
  Scion: '贵族', Witch: '女巫', Ranger: '游侠', Marauder: '野蛮人',
  Duelist: '决斗者', Templar: '圣堂武僧', Shadow: '暗影'
};

const SKILL_NAMES = {
  ...DIST_GEMS,
  'Lightning Arrow': '闪电箭', 'Tornado Shot': '龙卷射击', 'Ice Shot': '冰霜射击',
  'Righteous Fire': '正义之火', 'Spark': '电球', 'Fireball': '火球',
  'Lightning Strike': '闪电打击', 'Molten Strike': '熔岩打击', 'Cleave': '劈砍',
  'Desecrate': '亵渎', 'Autoexertion': '自动竭尽', 'General\'s Cry': '将军之吼',
  'Lacerate of Butchering': '屠戮破空斩',
  'Cyclone': '旋风斩', 'Summon Raging Spirit': '召唤愤怒狂灵', 'Raise Spectre': '召唤幻影',
  'Raise Zombie': '召唤魔侍', 'Vaal Skeletons': '瓦尔召唤魔侍', 'Soulrend': '灵魂吸取',
  'Hexblast': '咒术枯萎', 'Essence Drain': '精华吸取', 'Contagion': '传染',
  'Toxic Rain': '腐蚀箭', 'Caustic Arrow': '腐蚀箭矢', 'Kinetic Blast': '力量爆破',
  'Power Siphon': '力量抽取', 'Blade Vortex': '飞刃风暴', 'Blade Blast': '刀刃爆破',
  'Frost Blades': '冰霜之刃', 'Frostbolt': '霜爆', 'Cold Snap': '霜暴',
  'Volatile Dead': '致命之息', 'Detonate Dead': '尸体爆破', 'Arc': '电弧',
  'Ball Lightning': '闪电之球', 'Storm Brand': '风暴烙印', 'Penance Brand': '忏悔烙印',
  'Explosive Arrow': '爆炸箭', 'Siege Ballista': '攻城弩炮', 'Earthshatter': '裂地之击',
  'Ground Slam': '裂地之击', 'Lacerate': '破空斩', 'Spectral Throw': '灵体投掷',
  'Vaal Lightning Arrow': '瓦尔闪电箭', 'Herald of Agony': '苦痛之捷',
  'Winter Orb': '冰霜之球', 'Fire Trap': '火焰陷阱',
  'Poisonous Concoction of Bouncing': '弹跳毒药', 'Flicker Strike': '闪现打击',
  'Vaal Reap': '瓦尔收割', 'Reap': '收割',
  'Elemental Hit of the Spectrum': '光谱元素打击', 'Kinetic Fusillade': '力量齐射',
  'Cyclone of Tumult': '暴乱旋风斩', 'Shield Crush': '盾牌碾压',
  'Ethereal Knives of the Massacre': '屠戮虚影短刃',
  'Melee Physical Damage Support': '近战物理伤害辅助',
  'Pulverise Support': '粉碎辅助',
  'Brutality Support': '残暴辅助',
  'Lifetap Support': '生命分流辅助',
  'Cast while Channelling Support': '吟唱时施放辅助',
  'Infused Channelling Support': '灌能吟唱辅助',
  'Greater Spell Echo Support': '强辅·施法回响',
  'Greater Chain Support': '强辅·连锁',
  'Hypothermia Support': '急冻辅助',
  'Increased Critical Damage Support': '增加暴击伤害辅助',
  'Faster Projectiles Support': '快速投射辅助',
  'Efficacy Support': '效能辅助',
  'Burning Damage Support': '燃烧伤害辅助',
  'Faster Attacks Support': '快速攻击辅助',
  'Trap and Mine Damage Support': '陷阱及地雷伤害辅助',
  'Swift Affliction Support': '极速腐化辅助',
  'Cast when Damage Taken Support': '受伤时施放辅助',
  'Multistrike Support': '多重打击辅助',
  'Fortify Support': '护体辅助',
  'Impale Support': '穿刺辅助',
  'Power Charge On Critical Support': '暴击获得暴击球辅助',
  'Momentum Support': '动量辅助',
  'Trinity Support': '三位一体辅助',
  'Greater Fork Support': '强辅·分叉',
  'Volatility Support': '无常辅助',
  'Greater Multiple Projectiles Support': '强辅·高阶多重投射',
  'More Duration Support': '延长持续时间辅助',
  'Inspiration Support': '启发辅助',
  'Controlled Destruction Support': '精准破坏辅助',
  'Eldritch Blasphemy Support': '魔蛊光环辅助',
  'Bonechill Support': '彻骨辅助',
  'Concentrated Effect Support': '集中效应辅助',
  'Increased Area of Effect Support': '增大范围辅助',
  'Cast On Critical Strike Support': '暴击时施放辅助',
  'Spellblade Support': '法术利刃辅助',
  'Energy Leech Support': '能量偷取辅助',
  'Eternal Blessing Support': '永恒祝福辅助',
  'Enhance Support': '增幅辅助',
  'Enlighten Support': '启蒙辅助',
  'Empower Support': '赋予辅助',
  'Pride': '尊严',
  'Determination': '坚定',
  'Flesh and Stone': '血与沙',
  'Precision': '精准',
  'Assassin\'s Mark': '刺客印记',
  'Poacher\'s Mark': '盗猎者印记',
  'Sniper\'s Mark': '狙击者印记',
  'Defiance Banner': '抗争之旗',
  'Dread Banner': '恐怖之旗',
  'War Banner': '战旗',
  'Blood and Sand': '血姿与沙戮',
  'Arrogance Support': '傲慢辅助',
  'Vaal Haste': '瓦尔迅捷',
  'Tornado': '龙卷风',
  'Purity of Elements': '元素净化',
  'Summon Ice Golem': '召唤寒冰魔像',
  'Anger': '愤怒',
  'Generosity Support': '和善辅助',
  'Hatred': '憎恨',
  'Wrath': '雷霆',
  'Flame Link': '烈焰连接',
  'Purity of Fire': '火焰净化',
  'Purity of Ice': '冰霜净化',
  'Purity of Lightning': '闪电净化',
  'Clarity': '清晰',
  'Vitality': '活力',
  'Grace': '优雅',
  'Haste': '迅捷',
  'Discipline': '纪律',
  'Vortex': '漩涡',
  'Creeping Frost of Floes': '浮冰寒霜渗透',
  'Summon Chaos Golem': '召唤混沌魔像',
  'Summon Lightning Golem': '召唤闪电魔像',
  'Summon Carrion Golem of Hordes': '集群腐化魔像',
  'Vaal Cold Snap': '瓦尔霜暴',
  'Frostbite': '冻伤',
  'Frost Bomb': '寒霜爆',
  'Summon Stone Golem': '召唤巨石魔像',
  'Elemental Weakness': '元素要害',
  'Summon Skitterbots': '召唤探测机兽',
  'Vaal Molten Shell': '瓦尔熔岩护盾',
  'Automation': '自动化',
  'Lancing Steel of Spraying': '喷射钢裂化',
  'Eye of Winter': '凛冬之眼',
  'Frost Shield': '寒霜护盾',
  'Zealotry': '奋锐光环'
};

const BASE_NAMES = {
  ...DIST_BASES,
  'Ezomyte Burgonet': '艾兹麦坚盔',
  'Chimerascale Gauntlets': '奇美拉鳞护手',
  'Vaal Axe': '瓦尔巨斧',
  'Wyvernscale Boots': '飞龙鳞长靴',
  'Amethyst Ring': '紫晶戒指',
  'Iron Ring': '铁戒指',
  'Onyx Amulet': '黑曜护身符',
  'Studded Belt': '扣钉腰带',
  'Devout Chainmail': '虔诚锁甲',
  'Diamond Flask': '钻石药剂',
  'Granite Flask': '坚岩药剂',
  'Jade Flask': '翠玉药剂',
  'Basalt Flask': '玄武岩药剂',
  'Divine Life Flask': '神圣生命药剂',
  'Eternal Life Flask': '永恒生命药剂',
  'Quicksilver Flask': '水银药剂',
  'Silver Flask': '银药剂',
  'Quartz Flask': '石英药剂',
  'Ruby Flask': '红玉药剂',
  'Sapphire Flask': '蓝玉药剂',
  'Topaz Flask': '黄玉药剂',
  'Bismuth Flask': '灰岩药剂',
  'Stibnite Flask': '石化药剂',
  'Sulphur Flask': '硫磺药剂',
  'Gold Flask': '黄金药剂',
  'Cobalt Jewel': '钴蓝珠宝',
  'Crimson Jewel': '赤红珠宝',
  'Viridian Jewel': '翠绿珠宝',
  'Prismatic Jewel': '三相珠宝',
  'Timeless Jewel': '永恒珠宝',
  'Large Cluster Jewel': '大型星团珠宝',
  'Medium Cluster Jewel': '中型星团珠宝',
  'Small Cluster Jewel': '小型星团珠宝',
  'Hypnotic Eye Jewel': '催眠之眼珠宝',
  'Searching Eye Jewel': '搜寻之眼珠宝',
  'Murder Boots': '谋杀之靴',
  'Thicket Bow': '林野猎弓',
  'Ornate Quiver': '华丽箭袋',
  'Astral Plate': '星芒战铠',
  'Leather Belt': '皮革腰带',
  'Heavy Belt': '重革腰带',
  'Stygian Vise': '深渊腰带',
  'Unset Ring': '潜能之戒',
  'Two-Stone Ring': '双玉戒指',
  'Prismatic Ring': '三相戒指',
  'Lapis Amulet': '海玉护身符',
  'Turquoise Amulet': '青玉护身符',
  'Amber Amulet': '琥珀护身符',
  'Agate Amulet': '玛瑙护身符'
};

const UNIQUE_NAMES = Object.fromEntries(Object.entries(DIST_UNIQUES).map(([en, value]) => [en, value.cn || value.full || en]));
Object.assign(UNIQUE_NAMES, {
  Abyssus: '深渊之唤',
  'Uul-Netol\'s Kiss': '乌尔尼多之吻',
  'Foulborn Uul-Netol\'s Kiss': '污秽乌尔尼多之吻',
  'Carnage Heart': '屠戮之心',
  'The Magnate': '坚毅之环',
  'Foulborn The Magnate': '污秽坚毅之环',
  'The Fourth Vow': '第四誓愿',
  'Forbidden Flesh': '禁断血肉',
  'Forbidden Flame': '禁断烈焰',
  'Watcher\'s Eye': '守望之眼',
  'Thread of Hope': '希望之线',
  'Ancestral Vision': '先祖视界',
  'Glorious Vanity': '光荣的虚荣',
  'Maloney\'s Mechanism': '马洛尼的机关',
  'The Gull': '鸥喙',
  'Death Rush': '亡者呼唤',
  Blunderbore: '巨岩之傲',
  Headhunter: '猎首',
  'Replica Voidwalker': '仿品虚空行者',
  'The Golden Charlatan': '黄金骗子',
  'Marylene\'s Fallacy': '玛莉琳的护体之符',
  Hrimsorrow: '冰冷之眼',
  'The Overflowing Chalice': '满溢圣杯',
  'Cinderswallow Urn': '噬烬瓮',
  'Atziri\'s Promise': '阿兹里的诺言',
  Dawnbreaker: '破晓者',
  'Prismatic Eclipse': '虹耀之月',
  Mageblood: '法血',
  'Foulborn Mageblood': '污秽法血',
  'Emperor\'s Vigilance': '帝王的戒心',
  Haemophilia: '嗜血之手',
  'Lethal Pride': '致命的骄傲',
  'Seething Fury': '沸腾之怒',
  Stormshroud: '风暴遮蔽',
  'Piscator\'s Vigil': '皮斯卡托的慧眼',
  'Inpulsa\'s Broken Heart': '印卜萨的心碎',
  'Solstice Vigil': '炎阳之寂',
  'Esh\'s Mirror': '艾许之镜',
  'Foulborn Esh\'s Mirror': '污秽艾许之镜',
  'Soul Ascension': '灵魂升华',
  Nimis: '尼米斯',
  'The Fledgling': '羽翼初成',
  'The Wise Oak': '哲栎',
  'Dying Sun': '灭日',
  'Impossible Escape': '不可能的逃脱'
});

const RARE_WORDS = {
  Vengeance: '复仇', Talons: '之爪', Beast: '野兽', Goad: '刺激', Sorrow: '哀伤', Twirl: '旋环',
  Agony: '痛苦', Nail: '之钉', Kraken: '海怪', Bliss: '祝福', Dusk: '黄昏', Curio: '古物',
  Foe: '仇敌', Ruin: '毁灭', Phoenix: '凤凰', Star: '星辰', Eagle: '雄鹰', Dream: '梦境',
  Sol: '太阳', Glisten: '闪光', Cataclysm: '灾变', Desire: '渴望', Entropy: '熵变', Shine: '辉光',
  Blight: '枯萎', Lens: '透镜', Loath: '憎恶', Joy: '欢愉', Prism: '棱镜', Bramble: '荆棘',
  Vivid: '鲜活', Essence: '精华', Shard: '碎片', Rapture: '狂喜', Vessel: '容器',
  Apocalypse: '末日', Scratch: '抓痕', Spark: '火花', Wisdom: '智慧', Honour: '荣耀',
  Bond: '羁绊', Driftwood: '漂木', Club: '木棒', Craft: '工艺', Miracle: '奇迹',
  Golem: '魔像', Mitts: '护手', Mantle: '斗篷', Dread: '恐惧', Knuckle: '指节',
  Spirit: '灵魂', Dome: '穹顶', Gale: '狂风', Rosary: '念珠', Onslaught: '猛攻',
  Bane: '灾祸', Copper: '铜制', Tower: '塔盾', Shield: '盾', Demon: '恶魔',
  Band: '指环', Armageddon: '末日', Cowl: '头罩', Hate: '憎恨', Grasp: '之握',
  Empyrean: '苍穹', Damnation: '诅咒', Saw: '锯刃', Death: '死亡', Keep: '堡垒',
  Collar: '项圈', Stride: '步伐', Horror: '恐惧', Arch: '拱门'
};

const FLASK_PREFIXES = {
  Flagellant: '受难者', Seething: '沸腾', Alchemist: '炼金术士', Perpetual: '永续',
  Masochist: '受虐者', Transgressor: '僭越者', Dabbler: '浅尝者', Abecedarian: '初学者',
  Specialist: '专家', Terrified: '惊恐'
};

const FLASK_SUFFIXES = {
  Incision: '切割', Armadillo: '犰狳', Iguana: '鬣蜥', Sealing: '封印', Cheetah: '猎豹',
  Petrel: '海燕', Infliction: '折磨', Pangolin: '穿山甲', Assuaging: '缓和', Owl: '猫头鹰',
  'Bog Moss': '沼苔', Allaying: '缓解'
};

const KEY_PASSIVE_NAMES = {
  'Chaos Inoculation': '混沌免疫',
  'Conduit': '导流',
  'Divine Flesh': '神圣血肉',
  'Eldritch Battery': '异能魔力',
  'Elemental Equilibrium': '元素之相',
  'Ghost Dance': '鬼舞',
  'Glancing Blows': '侧身之击',
  'Iron Reflexes': '钢铁反射',
  'Pain Attunement': '苦痛灵曲',
  'Supreme Ostentation': '至高炫耀',
  'Unwavering Stance': '霸体',
  'Versatile Combatant': '全能斗士'
};

const CURRENCY_NAMES = {
  'Chaos Orb': '混沌石', 'Divine Orb': '神圣石', 'Exalted Orb': '崇高石',
  'Mirror of Kalandra': '卡兰德的魔镜', 'Orb of Alchemy': '点金石',
  'Orb of Alteration': '改造石', 'Orb of Annulment': '剥离石',
  'Orb of Fusing': '链接石', 'Chromatic Orb': '幻色石', 'Regal Orb': '富豪石',
  'Orb of Scouring': '重铸石', 'Orb of Chance': '机会石', 'Blessed Orb': '祝福石',
  'Vaal Orb': '瓦尔宝珠', 'Orb of Regret': '后悔石', 'Jeweller\'s Orb': '工匠石',
  'Ancient Orb': '远古石', 'Harbinger\'s Orb': '裂界石', 'Fracturing Orb': '分裂石',
  'Sacred Orb': '神圣石', 'Awakened Sextant': '觉醒六分仪'
};

function translateClass(value) {
  return CLASS_NAMES[value] || value || '未知职业';
}

function translateSkill(value) {
  return SKILL_NAMES[value] || value || '未识别主技能';
}

function translateBaseItem(value) {
  return BASE_NAMES[value] || value || '';
}

function translateRareName(value) {
  const translated = `${value || ''}`.split(/\s+/).map((word) => RARE_WORDS[word] || word).join('');
  return translated && translated !== value ? translated : value;
}

function translateFlaskName(value) {
  const match = `${value || ''}`.match(/^(.+)'s (.+ Flask) of (.+)$/);
  if (!match) return null;
  const prefix = FLASK_PREFIXES[match[1]] || translateRareName(match[1]);
  const base = translateBaseItem(match[2]);
  const suffix = FLASK_SUFFIXES[match[3]] || translateRareName(match[3]);
  return `${prefix}的${base}（${suffix}）`;
}

function translateItemName(value) {
  if (!value) return '';
  const text = `${value}`;
  if (UNIQUE_NAMES[text]) return UNIQUE_NAMES[text];
  const flask = translateFlaskName(text);
  if (flask) return flask;
  return translateRareName(text);
}

function replaceKeywords(text) {
  let value = text;
  const entries = Object.entries({ ...(DIST_STATS.keywords || {}), ...LOCAL_STAT_KEYWORDS }).sort((a, b) => b[0].length - a[0].length);
  for (const [en, cn] of entries) {
    value = value.replace(new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), cn);
  }
  return value;
}

function translateStatText(value) {
  if (!value) return '';
  const text = `${value}`.trim();
  const customPatterns = [
    [/^Quality(?: \((.+) Modifiers\))?: ([+-]?[\d.]+%)$/, (_, type, number) => `品质${type ? `（${replaceKeywords(type)}词缀）` : ''}: ${number}`],
    [/^Armour: ([\d,]+)$/, (_, number) => `护甲: ${number}`],
    [/^Evasion Rating: ([\d,]+)$/, (_, number) => `闪避值: ${number}`],
    [/^Energy Shield: ([\d,]+)$/, (_, number) => `能量护盾: ${number}`],
    [/^Physical Damage: ([\d–-]+)$/, (_, number) => `物理伤害: ${number}`],
    [/^Critical Strike Chance: ([\d.]+%)$/, (_, number) => `暴击率: ${number}`],
    [/^Attacks per Second: ([\d.]+)$/, (_, number) => `每秒攻击次数: ${number}`],
    [/^Requires Level ([\d]+), Str ([\d]+), Dex ([\d]+), Int ([\d]+)$/, (_, level, str, dex, int) => `需求等级 ${level}，力量 ${str}，敏捷 ${dex}，智慧 ${int}`],
    [/^Lasts \{0\} Seconds: ([\d.]+)$/, (_, number) => `持续 ${number} 秒`],
    [/^Consumes \{0\} of \{1\} Charges on use: ([\d.]+) \/ ([\d.]+)$/, (_, a, b) => `使用时消耗 ${a}/${b} 充能`],
    [/^Currently has \{0\} Charges: ([\d.]+)$/, (_, number) => `当前有 ${number} 充能`],
    [/^Recovers \{0\} Life over \{1\} Seconds: ([\d.]+) \/ ([\d.]+)$/, (_, life, seconds) => `${seconds} 秒内回复 ${life} 生命`],
    [/^Limited to: (.+)$/, (_, limit) => `限定: ${limit}`],
    [/^Has ([\d]+) Sockets?$/, (_, number) => `有 ${number} 个插槽`],
    [/^Socketed Skill Gems get a ([\d.]+%) Cost & Reservation Multiplier$/, (_, number) => `插入的技能宝石获得 ${number} 消耗与保留倍率`],
    [/^\+([\d.]+) to all Attributes$/, (_, number) => `全属性 +${number}`],
    [/^\+([\d.]+)% to all Elemental Resistances$/, (_, number) => `所有元素抗性 +${number}%`],
    [/^\+([\d.]+)% to (Fire|Cold|Lightning|Chaos) Resistance$/, (_, number, type) => `${replaceKeywords(type)}抗性 +${number}%`],
    [/^\+([\d.]+) to maximum (Life|Mana|Energy Shield)$/, (_, number, type) => `最大${replaceKeywords(type)} +${number}`],
    [/^\+([\d.]+) to (Strength|Dexterity|Intelligence)$/, (_, number, type) => `${replaceKeywords(type)} +${number}`],
    [/^\+([\d.]+)% to (Melee|Global)? ?Critical Strike Multiplier$/, (_, number, scope) => `${scope ? `${replaceKeywords(scope)} ` : ''}暴击伤害加成 +${number}%`],
    [/^Adds ([\d.]+) to ([\d.]+) (Physical|Fire|Cold|Lightning|Chaos) Damage to Attacks$/, (_, a, b, type) => `攻击附加 ${a} - ${b} ${replaceKeywords(type)}伤害`],
    [/^Adds ([\d.]+) to ([\d.]+) (Physical|Fire|Cold|Lightning|Chaos) Damage$/, (_, a, b, type) => `附加 ${a} - ${b} ${replaceKeywords(type)}伤害`],
    [/^([\d.]+)% increased (Armour|Evasion|Energy Shield|Attack Speed|Movement Speed|Physical Damage|Spell Damage|Global Physical Damage)$/, (_, number, type) => `${replaceKeywords(type)}提高 ${number}%`],
    [/^([\d.]+)% reduced (Attack Speed|Amount Recovered|Duration)$/, (_, number, type) => `${replaceKeywords(type)}降低 ${number}%`],
    [/^([\d.]+)% increased Armour and Evasion$/, (_, number) => `护甲与闪避值提高 ${number}%`],
    [/^([\d.]+)% increased Armour and Energy Shield$/, (_, number) => `护甲与能量护盾提高 ${number}%`],
    [/^([\d.]+)% increased Evasion and Energy Shield$/, (_, number) => `闪避值与能量护盾提高 ${number}%`],
    [/^([\d.]+)% increased Critical Strike Chance during Effect$/, (_, number) => `效果期间暴击率提高 ${number}%`],
    [/^([\d.]+)% increased (Physical|Fire|Cold|Lightning|Chaos) Damage taken$/, (_, number, type) => `承受的${replaceKeywords(type)}伤害提高 ${number}%`],
    [/^([\d.]+)% increased (物理|火焰|冰霜|闪电|混沌)伤害 taken$/, (_, number, type) => `承受的${type}伤害提高 ${number}%`],
    [/^([\d.]+)% chance to (.+)$/, (_, number, rest) => `${number}% 几率${replaceKeywords(rest)}`],
    [/^Gain ([\d.]+) Charges when you are Hit by an Enemy$/, (_, number) => `被敌人击中时获得 ${number} 充能`],
    [/^Regenerate ([\d.]+)% of Life per second$/, (_, number) => `每秒回复 ${number}% 生命`],
    [/^Instant Recovery$/, () => '立即回复'],
    [/^Immunity to Bleeding and Corrupted Blood during Effect$/, () => '效果期间免疫流血和腐化之血'],
    [/^Grants Immunity to Bleeding for ([\d.]+) seconds if used while Bleeding$/, (_, number) => `流血时使用，获得 ${number} 秒流血免疫`],
    [/^Grants Immunity to Corrupted Blood for ([\d.]+) seconds if used while affected by Corrupted Blood$/, (_, number) => `受腐化之血影响时使用，获得 ${number} 秒腐化之血免疫`],
    [/^Curse Enemies with Vulnerability on Hit$/, () => '击中时用脆弱诅咒敌人'],
    [/^Exerted Attacks Knock Enemies Back on Hit$/, () => '竭尽攻击击中时击退敌人'],
    [/^Knocks Back Enemies in an Area when you use a Flask$/, () => '使用药剂时击退范围内敌人'],
    [/^Taunts nearby Enemies on use$/, () => '使用时嘲讽周围敌人'],
    [/^Adds Knockback to Melee Attacks during Effect$/, () => '效果期间近战攻击获得击退'],
    [/^Drops Brittle Ground while moving, lasting ([\d.]+) seconds$/, (_, number) => `移动时留下持续 ${number} 秒的脆弱地面`],
    [/^You can apply an additional Curse$/, () => '你可以施加一个额外诅咒'],
    [/^Armour also applies to Chaos Damage taken from Hits$/, () => '护甲也作用于击中承受的混沌伤害'],
    [/^Physical Damage taken bypasses Energy Shield$/, () => '承受的物理伤害绕过能量护盾'],
    [/^Allocates (.+) if you have the matching modifier on Forbidden (Flame|Flesh)$/, (_, passive, jewel) => `若对应禁断${jewel === 'Flame' ? '烈焰' : '血肉'}有匹配词缀，配置 ${replaceKeywords(passive)}`],
    [/^Added Small Passive Skills also grant: (.+)$/, (_, rest) => `新增小天赋还提供: ${translateStatText(rest)}`],
    [/^1 Added Passive Skill is (.+)$/, (_, rest) => `新增 1 个天赋: ${replaceKeywords(rest)}`],
    [/^Passive Skills in Radius can be Allocated without being connected to your tree$/, () => '范围内天赋无需连接到天赋树即可配置'],
    [/^Only affects Passives in Massive Ring$/, () => '只影响巨大环范围内的天赋'],
    [/^Passives in radius are Conquered by the Vaal$/, () => '范围内天赋被瓦尔征服'],
    [/^Radius: (.+)$/, (_, rest) => `范围: ${replaceKeywords(rest)}`]
  ];
  for (const [regex, replace] of customPatterns) {
    if (regex.test(text)) return text.replace(regex, replace);
  }
  for (const pattern of DIST_STATS.patterns || []) {
    const regex = new RegExp(`^${pattern.regex}$`);
    if (regex.test(text)) return text.replace(regex, pattern.replace);
  }
  return replaceKeywords(text)
    .replace(/\bEnemies\b/g, '敌人')
    .replace(/\bEnemy\b/g, '敌人')
    .replace(/\bAllies\b/g, '友军')
    .replace(/\bMinions\b/g, '召唤生物')
    .replace(/\bAttacks\b/g, '攻击')
    .replace(/\bAttack\b/g, '攻击')
    .replace(/\bSpells\b/g, '法术')
    .replace(/\bSpell\b/g, '法术')
    .replace(/\bDamage\b/g, '伤害')
    .replace(/\bDuration\b/g, '持续时间')
    .replace(/\bEffect\b/g, '效果');
}

function translateCurrency(value) {
  return CURRENCY_NAMES[value] || value || '未命名通货';
}

function translateKeyPassive(value) {
  return KEY_PASSIVE_NAMES[value] || value || '未知关键天赋';
}

module.exports = {
  translateBaseItem,
  translateClass,
  translateCurrency,
  translateItemName,
  translateKeyPassive,
  translateSkill,
  translateStatText
};
