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
  'Ethereal Knives of the Massacre': '屠戮虚影短刃'
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

function translateCurrency(value) {
  return CURRENCY_NAMES[value] || value || '未命名通货';
}

function translateKeyPassive(value) {
  return KEY_PASSIVE_NAMES[value] || value || '未知关键天赋';
}

module.exports = { translateClass, translateSkill, translateCurrency, translateKeyPassive };
