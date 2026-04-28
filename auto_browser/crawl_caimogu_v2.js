#!/usr/bin/env node
/**
 * 踩蘑菇网BD完整数据爬虫 v2 - 通过API + 详情页抓取
 * 使用 planid 直接访问详情页，从图标URL解析技能名称
 */

const puppeteer = require("puppeteer");
const https = require("https");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// OSS配置
const OSS_CONFIG = {
  region: process.env.OSS_REGION || "oss-cn-hangzhou",
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET || "poe2-all-class"
};

// 职业ID映射 (踩蘑菇cid)
const CID_CLASS_MAP = {
  1000: { class: 'Witch', name: 'Witch', zh: '女巫' },
  1001: { class: 'Infernalist', name: 'Infernalist', zh: '狱囚' },
  1002: { class: 'Blood Mage', name: 'Blood Mage', zh: '血法师' },
  1003: { class: 'Witch', name: 'Witch', zh: '女巫' },
  1004: { class: 'Ranger', name: 'Ranger', zh: '游侠' },
  1005: { class: 'Deadeye', name: 'Deadeye', zh: '死眼' },
  1006: { class: 'Huntress', name: 'Huntress', zh: '女猎人' },
  1007: { class: 'Warrior', name: 'Warrior', zh: '战士' },
  1008: { class: 'Titan', name: 'Titan', zh: '泰坦' },
  1009: { class: 'Slayer', name: 'Slayer', zh: '杀手' },
  1010: { class: 'Sorceress', name: 'Sorceress', zh: '女术士' },
  1011: { class: 'Stormweaver', name: 'Stormweaver', zh: '风暴织者' },
  1012: { class: 'Spellblade', name: 'Spellblade', zh: '魔剑士' },
  1013: { class: 'Druid', name: 'Druid', zh: '德鲁伊' },
  1014: { class: 'Ritualist', name: 'Ritualist', zh: '仪式师' },
  1015: { class: 'Druid', name: 'Druid', zh: '德鲁伊' },
  1016: { class: 'Monk', name: 'Monk', zh: '武僧' },
  1017: { class: 'Infernalist', name: 'Infernalist', zh: '狱囚' },
  1018: { class: 'Championscale', name: 'Championscale', zh: '冠军鳞' },
  1019: { class: 'Mercenary', name: 'Mercenary', zh: '佣兵' },
  1020: { class: 'Deadeye', name: 'Deadeye', zh: '死眼' },
  1021: { class: 'Chronomancer', name: 'Chronomancer', zh: '时空行者' },
  1022: { class: 'Huntress', name: 'Huntress', zh: '女猎手' },
  1023: { class: 'Deadeye', name: 'Deadeye', zh: '死眼' },
  1024: { class: 'Gemling Legionary', name: 'Gemling Legionary', zh: '宝石军团' },
  1025: { class: 'Huntress', name: 'Huntress', zh: '女猎手' }
};

// 中文职业名到Ninja职业的映射
const CLASS_MAP = {
  "女巫": "Witch", "Witch": "Witch",
  "游侠": "Ranger", "Ranger": "Ranger",
  "战士": "Warrior", "Warrior": "Warrior",
  "女术士": "Sorceress", "Sorceress": "Sorceress",
  "德鲁伊": "Druid", "Druid": "Druid",
  "僧侣": "Monk", "Monk": "Monk",
  "武僧": "Monk", "Monk": "Monk",
  "佣兵": "Mercenary", "Mercenary": "Mercenary",
  "女猎手": "Huntress", "Huntress": "Huntress",
  "狱囚": "Infernalist", "Infernalist": "Infernalist",
  "血法师": "Blood Mage", "Blood Mage": "Blood Mage",
  "死眼": "Deadeye", "Deadeye": "Deadeye",
  "泰坦": "Titan", "Titan": "Titan",
  "杀手": "Slayer", "Slayer": "Slayer",
  "风暴织者": "Stormweaver", "Stormweaver": "Stormweaver",
  "魔剑士": "Spellblade", "Spellblade": "Spellblade",
  "仪式师": "Ritualist", "Ritualist": "Ritualist",
  "冠军鳞": "Championscale", "Championscale": "Championscale",
  "时空行者": "Chronomancer", "Chronomancer": "Chronomancer",
  "宝石军团": "Gemling Legionary", "Gemling Legionary": "Gemling Legionary"
};

// 技能图标到名称的映射（从URL解析）
const SKILL_NAME_MAP = {
  "bloodchannel": "鲜血引导",
  "blankgem": "空槽位",
  "spellslingerweaponskill": "法术射击",
  "spellslinger": "法术射击",
  "elementalinvocationmetaskill": "元素祈命",
  "elementalinvocation": "元素祈命",
  "livingbombskill": "活性炸弹",
  "livingbomb": "活性炸弹",
  "castoncritmetaskill": "暴击施法",
  "castoncrit": "暴击施法",
  "castonfreeze": "冰冻施法",
  "castonblock": "格挡施法",
  "cometskill": "彗星",
  "comet": "彗星",
  "archmageskill": "大法师",
  "archmage": "大法师",
  "soulrending": "灵魂撕裂",
  "soulrend": "灵魂撕裂",
  "energysiphon": "能量虹吸",
  "frostbomb": "冰霜炸弹",
  "cremation": "火葬",
  "arcanebrand": "奥术烙印",
  "balllightning": "球状闪电",
  "arc": "电弧",
  "spark": "电光",
  "firestorm": "火焰风暴",
  "ice nova": "冰霜新星",
  "icenova": "冰霜新星",
  "freezingpulse": "冰霜脉冲",
  "incinerate": "焚烬",
  "lightningtrap": "闪电陷阱",
  "erexcia": "爆炸陷阱",
  "viperstrike": "毒蛇打击",
  "bladestorm": "刀锋风暴",
  "groundsmash": "碎地斩",
  "doubleslash": "双重打击",
  "leapslam": "跳跃打击",
  "crescentslash": "月牙斩",
  "lightningwave": "闪电波纹",
  "ancestralwarchief": "先祖呐喊",
  "frostbreath": "冰霜吐息",
  "baptism": "浸礼",
  "tempestbell": "暴风钟",
  "smokegrenade": "烟雾弹",
  "explosivetrap": "爆炸陷阱",
  "lightningarrow": "闪电箭矢",
  "shatteringsteel": "碎钢",
  "sunder": "粉碎",
  "boneshatter": "碎骨",
  "perforate": "穿刺",
  "reap": "收割",
  "bloodmage": "嗜血",
  "darkpact": "黑暗契约",
  "summon skeletons": "召唤骷髅",
  "raisezombie": "召唤僵尸",
  "spectre": "召唤幻影",
  "golem": "召唤魔像",
  "summonchaosgolem": "召唤混沌魔像",
  "summonflamegolem": "召唤火焰魔像",
  "summonicegolem": "召唤冰霜魔像",
  "summonstonegolem": "召唤石魔像",
  "summonlightninggolem": "召唤闪电魔像",
  // 残remnants技能
  "bloodremnants": "鲜血残响",
  "manaremnants": "魔力残响",
  "sorrecessenergyremnants": "能量残响",
  "energyremnants": "能量残响",
  "sorceressenergyremnants": "女巫能量残响",
  // 特殊技能
  "lineagearbiter": "血统仲裁者",
  "rejuvinatingremnants": "活力残响",
  "castonelementalailment": "元素异常施法",
  "castoncriticals": "暴击施法",
  "skeletalcleric": "骷髅牧师",
  "souloffering": "灵魂奉献",
  "elementalweakness": "元素弱点",
  "frostwall": "冰墙",
  "lightningrod": "避雷针",
  "stormblast": "风暴爆发",
  // 攻击技能
  "sunderground": "碎地",
  "earthshaker": "震地者",
  "groundsmash": "碎地斩",
  "heavy strike": "重击",
  "double": "双重",
  // 防御技能
  "steelslam": "钢铁之怒",
  "shieldwall": "盾墙",
  "irondeflection": "铁壁",
  "defiance": "抗拒",
  // 传承天赋
  "dialla": "黛拉",
  "witchclericskeleton": "女巫骷髅牧师",
  "witchcleric": "女巫牧师",
  "lineagetecrod": "血统技师",
  "witchpoweroffering": "女巫力量奉献",
  "lineagekulemakspire": "血统蜘蛛",
  "lineagemeatshield": "血统肉盾",
  "lineagedoedre": "血统毒藤",
  "witchdivinerstracking": "女巫追踪",
  "witchdiviner": "女巫占卜",
  "witchinvocation": "女巫祈命",
  "witchelementalist": "女巫元素使",
  "witchbones": "女巫骸骨"
};

// 辅助技能关键词（用于判断辅助宝石）
const SUPPORT_KEYWORDS = [
  'support', '辅助', '残片', '效能', '灌输', '觉醒', '灌注',
  '高效', '强化', '赋能', '急速', '范围', '连锁', '增效',
  'rushed', 'interlude', 'addedimpetus', 'inspiration',
  'lineage', 'lightningmastery', 'elementalmastery',
  'rapid', 'chain', 'empower', 'enhance', 'efficacy',
  'multicast', 'spellecho', 'spellcombustion', 'fastercasting'
];

// 支持宝石翻译映射
const SUPPORT_GEM_MAP = {
  'rushedremnantssupport': '疾速余波辅助',
  'interludesupport': '间奏辅助',
  'addedimpetussupport': '加速辅助',
  'inspirationsupport': '灵感辅助',
  'lightningmasterysupport': '闪电精通辅助',
  'elementalmasterysupport': '元素精通辅助',
  'concentratedeffectsupport': '集中效应辅助',
  'manatenancesupport': '维持辅助',
  'elementalfocussupport': '元素集中辅助',
  'multicastsupport': '多重施法辅助',
  'spellcombustionsupport': '法术燃烧辅助',
  'spellmulticastsupport': '法术连锁辅助',
  'spellrepeatsupport': '法术重复辅助',
  'increasedareadamagesupport': '范围伤害辅助',
  'increasedcritsuport': '暴击辅助',
  'increaseduration_support': '持续时间辅助',
  'fastercastingsupport': '快速施法辅助',
  'fasterattack_support': '快速攻击辅助',
  'fasterprojectiles_support': '快速投射辅助',
  'increasedprojectilespeed_support': '投射物速度辅助',
  'addfire_damage_support': '附加火焰伤害辅助',
  'addcold_damage_support': '附加冰冷伤害辅助',
  'addlightning_damage_support': '附加闪电伤害辅助',
  'addchaos_damage_support': '附加混沌伤害辅助',
  'addphysical_damage_support': '附加物理伤害辅助',
  'addelemental_damage_support': '附加元素伤害辅助',
  'penetrate resistances_support': '穿透抗性辅助',
  'knockback_support': '击退辅助',
  'pierce_support': '穿透辅助',
  'fork_support': '分叉辅助',
  'chaining_support': '连锁辅助',
  'homingsupport': '追踪辅助',
  'pointblank_support': '近战范围辅助',
  'brutality_support': '残暴辅助',
  'weaponseleasing_support': '武器释放辅助',
  'melee_splash_support': '近战溅射辅助',
  ' ancestralcall_support': '先祖呼唤辅助',
  'perforate_support': '穿刺辅助',
  'boneshatter_support': '碎骨辅助',
  'overwhelm_support': '压制辅助',
  'earthshakersupport': '震地辅助',
  'blood霰magessupport': '鲜血辅助',
  'darkpactsupport': '黑暗契约辅助',
  'soulrendingsupport': '灵魂撕裂辅助',
  'reapsupport': '收割辅助',
  'voidsiphonsupport': '虚空虹吸辅助',
  'arcanesurge_support': '奥术涌动辅助',
  'energysiphonsupport': '能量虹吸辅助',
  'frostdot': '冰霜dot',
  'combustion': '燃烧',
  'combustion_support': '燃烧辅助',
  'ignite_support': '点燃辅助',
  'bane_support': '祸根辅助',
  'despair_support': '绝望辅助',
  'enfeeble_support': '衰弱辅助',
  'vulnerability_support': '易伤辅助',
  'temporalchains_support': '时空锁链辅助',
  'poisonsupport': '中毒辅助',
  'bleed_support': '流血辅助',
  'wither_support': '枯萎辅助',
  'curselink_support': '诅咒链接辅助',
  'hexproofsupport': '抗诅咒辅助',
  'arcaneskill_sup': '奥术辅助',
  'cold_exposure_support': '冰冷暴露辅助',
  'fire_exposure_support': '火焰暴露辅助',
  'lightning_exposure_support': '闪电暴露辅助',
  'arrogance_support': '傲慢辅助',
  'lifyleech_support': '生命偷取辅助',
  'manaleech_support': '魔力偷取辅助',
  'physicleech_support': '物理偷取辅助',
  'elementalleech_support': '元素偷取辅助',
  'armoubreak_support': '破甲辅助',
  'suppress_support': '抑制辅助',
  'siegelementsupport': '元素印记辅助',
  'hex_support': '诅咒辅助',
  'efficacy_support': '效能辅助',
  'efficiency_support': '效率辅助',
  'intensity_support': '强度辅助',
  'duration_support': '持续时间辅助',
  'controlleddestruction_support': '受控毁灭辅助',
  'destruction_support': '毁灭辅助',
  'volatility_support': '波动辅助',
  'summon_phantasms_support': '召唤幻影辅助',
  'summon_reanimates_support': '召唤复生辅助',
  'summonflamegolemsupport': '召唤火焰魔像辅助',
  'summonstonegolemsupport': '召唤石魔像辅助',
  'summonicegolemsupport': '召唤冰霜魔像辅助',
  'summonlightninggolemsupport': '召唤闪电魔像辅助',
  'summonchaosgolemsupport': '召唤混沌魔像辅助',
  'summonsupportspectre': '召唤幻影辅助',
  'summonskeletonssupport': '召唤骷髅辅助',
  'raisezombiesupport': '召唤僵尸辅助',
  'meat_gaurd_support': '肉盾辅助',
  'defeneance_support': '防御辅助',
  'fortify_support': '护体辅助',
  'ironwood_support': '铁木辅助',
  'steelslam_support': '钢铁冲击辅助',
  'melee_damage_support': '近战伤害辅助',
  'damagelink_support': '伤害链接辅助'
};

// 从图标URL解析技能名称
function parseSkillFromUrl(url) {
  if (!url) return null;

  // 提取文件名
  const match = url.match(/\/([^\/]+)\.webp$/);
  if (!match) return null;

  const filename = match[1].toLowerCase();

  // 检查是否辅助技能
  const isSupport = SUPPORT_KEYWORDS.some(kw => filename.includes(kw)) || filename.includes('support');

  // 首先从支持宝石映射获取翻译
  for (const [key, name] of Object.entries(SUPPORT_GEM_MAP)) {
    if (filename.includes(key.toLowerCase())) {
      return { name, isSupport: true, url };
    }
  }

  // 再从技能映射获取
  for (const [key, name] of Object.entries(SKILL_NAME_MAP)) {
    if (filename.includes(key)) {
      return { name, isSupport: isSupport && !SUPPORT_GEM_MAP[key], url };
    }
  }

  // 从文件名推断
  let readableName = filename
    .replace(/skillgem|skill|gem$/gi, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/metaskill/gi, '')
    .replace(/new/gi, '')
    .replace(/2d/gi, '')
    .replace(/[\-_]/g, ' ')
    .replace(/support/gi, '辅助')
    .trim();

  // 首字母大写
  readableName = readableName.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return { name: readableName || filename, isSupport, url };
}

// 通过HTTPS获取API数据
function fetchApi(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'poe2.caimogu.cc',
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 获取BD列表
async function getBuildList() {
  try {
    const data = await fetchApi('/planner/bdlist?page=1&ps=20&keyword=&endgame=false&leveling=false&hc=false&ssf=false');
    return data.data?.items || [];
  } catch (e) {
    console.error('获取BD列表失败:', e.message);
    return [];
  }
}

// 根据cid获取职业信息
function getClassByCid(cid) {
  const info = CID_CLASS_MAP[cid] || CID_CLASS_MAP[1000];
  return {
    class: info.class,
    name: info.name,
    zh: info.zh
  };
}

// 解析详情页获取技能和装备
async function parseDetailPage(page, planid, buildInfo = {}) {
  const result = {
    skills: [],
    equipment: { core_uniques: [], rare_priority: [] },
    passive_tree: null,
    meta: {
      title: '',
      author: '',
      class: 'Witch',
      name: 'Witch',
      tags: [],
      season: ''
    },
    intro: {
      desc: '',
      pros: ['社区热门推荐', '经过玩家验证'],
      cons: []
    },
    source: {
      platform: 'caimogu',
      planid: planid,
      originalAuthor: '',
      updateTime: '',
      url: `https://poe2.caimogu.cc/planner#/plan/${planid}`
    }
  };

  // 从buildInfo获取职业信息
  if (buildInfo.cid) {
    const classInfo = getClassByCid(buildInfo.cid);
    result.meta.class = classInfo.class;
    result.meta.name = classInfo.name;
  }

  try {
    // 等待页面加载
    await page.waitForSelector('.cmg-skill-list, .intro--title', { timeout: 10000 });

    // 获取基本信息
    const info = await page.evaluate(() => {
      const title = document.querySelector('.intro--title')?.innerText?.trim() || '';
      const author = document.querySelector('.hover-click')?.innerText?.trim() || '';
      const time = document.querySelector('.colot-5')?.innerText?.trim() || '';

      // 获取职业图标
      const classImg = document.querySelector('.cmg-avatar img')?.src || '';
      let className = 'Druid';
      if (classImg.includes('witch') || classImg.includes('blood-mage') || classImg.includes('infernalist')) {
        className = 'Witch';
      } else if (classImg.includes('ranger') || classImg.includes('deadeye') || classImg.includes('huntress')) {
        className = 'Ranger';
      } else if (classImg.includes('warrior') || classImg.includes('titan') || classImg.includes('slayer')) {
        className = 'Warrior';
      } else if (classImg.includes('sorceress') || classImg.includes('stormweaver')) {
        className = 'Sorceress';
      } else if (classImg.includes('monk')) {
        className = 'Monk';
      } else if (classImg.includes('mercenary')) {
        className = 'Mercenary';
      } else if (classImg.includes('druid') || classImg.includes('ritualist')) {
        className = 'Druid';
      }

      // 获取标签
      const tagEls = document.querySelectorAll('.cmg-intro--tag');
      const tags = Array.from(tagEls).map(t => t.innerText?.trim()).filter(t => t);

      return { title, author, time, className, tags };
    });

    result.meta.title = info.title || '未命名BD';
    result.meta.author = info.author;
    // 只有当没有通过cid设置职业时才使用页面解析的职业
    if (!buildInfo.cid) {
      result.meta.class = info.className;
      result.meta.name = CLASS_MAP[info.className] || info.className;
    }
    result.meta.tags = info.tags || [];
    result.source.originalAuthor = info.author;

    // 解析时间
    const timeMatch = info.time?.match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})/);
    if (timeMatch) {
      result.source.updateTime = `${timeMatch[1]}年${timeMatch[2]}月${timeMatch[3]}日`;
    }

    // 获取技能图标
    const skillData = await page.evaluate(() => {
      const icons = [];
      const skillImgs = document.querySelectorAll('.cmg-skill-list img');
      skillImgs.forEach((img, i) => {
        if (img.src && !img.src.includes('blankgem') && !img.src.includes('data:')) {
          icons.push({ src: img.src, index: i });
        }
      });

      // 获取技能组标题
      const groups = [];
      const stepViews = document.querySelectorAll('.cmg-skill-step-view, [class*="skill-step"]');
      stepViews.forEach((view, i) => {
        const groupName = view.querySelector('.group-name, [class*="group"]')?.innerText?.trim() || `技能组${i + 1}`;
        groups.push({ index: i, name: groupName });
      });

      return { icons, groups };
    });

    // 解析技能
    const parsedSkills = [];
    let currentGroup = null;
    let groupIndex = 0;

    for (const icon of skillData.icons) {
      const parsed = parseSkillFromUrl(icon.src);
      if (parsed && parsed.name !== '空槽位') {
        if (parsed.isSupport) {
          // 辅助宝石添加到当前链接
          if (currentGroup) {
            currentGroup.supportSkills.push(parsed.name);
          }
        } else {
          // 主技能开始新组
          if (currentGroup && currentGroup.mainSkills.length > 0) {
            groupIndex++;
          }
          currentGroup = {
            groupName: `技能组 ${groupIndex + 1}`,
            groupIndex: groupIndex,
            mainSkills: [parsed.name],
            supportSkills: [],
            links: [{ name: parsed.name, isSupport: false }]
          };
          parsedSkills.push(currentGroup);
        }
      }
    }

    // 补充辅助技能到链接
    let linkIndex = 0;
    for (const group of parsedSkills) {
      for (const support of group.supportSkills) {
        group.links.push({ name: support, isSupport: true });
      }
    }

    result.skills = parsedSkills;

    // 生成简介
    if (result.meta.title) {
      result.intro.desc = `来自踩蘑菇网的热门BD「${result.meta.title}」，${result.meta.name}职业。`;
    }

    // 生成ID
    const idBase = result.meta.title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').substring(0, 10);
    result.id = `CaiMoGu_${idBase}_${planid}`;

    return result;

  } catch (e) {
    console.error('解析详情页失败:', e.message);
    return result;
  }
}

// 主爬虫函数
async function crawl() {
  console.log("🚀 踩蘑菇网BD完整数据爬虫 v2\n");
  console.log("=" .repeat(50));

  // 1. 获取BD列表
  console.log("\n1️⃣ 获取BD列表...");
  const buildList = await getBuildList();
  console.log(`   ✅ 获取到 ${buildList.length} 条BD`);

  if (buildList.length === 0) {
    console.error("❌ 无法获取BD列表");
    return [];
  }

  // 显示前5条
  buildList.slice(0, 5).forEach((b, i) => {
    console.log(`   ${i + 1}. ${b.title} (${b.planid})`);
  });

  // 2. 启动浏览器
  console.log("\n2️⃣ 启动浏览器...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 3000 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  const builds = [];

  try {
    // 3. 逐个抓取详情页
    console.log("\n3️⃣ 开始抓取详情页...");

    for (let i = 0; i < Math.min(20, buildList.length); i++) {
      const build = buildList[i];
      const planid = build.planid;

      console.log(`\n   [${i + 1}/20] ${build.title || planid}...`);

      try {
        // 直接导航到详情页
        await page.goto(`https://poe2.caimogu.cc/planner#/plan/${planid}`, {
          waitUntil: "networkidle0",
          timeout: 60000
        });

        // 等待页面渲染
        await new Promise(resolve => setTimeout(resolve, 8000));

        // 解析详情页，传入buildInfo用于获取职业
        const buildData = await parseDetailPage(page, planid, build);

        // 确保标题存在
        if (!buildData.meta.title && build.title) {
          buildData.meta.title = build.title;
        }

        // 添加到结果
        builds.push(buildData);
        console.log(`      ✅ 职业: ${buildData.meta.class}, 技能组: ${buildData.skills.length}`);

      } catch (e) {
        console.log(`      ❌ 抓取失败: ${e.message}`);
      }
    }

    console.log(`\n✅ 共抓取 ${builds.length} 条BD数据`);

    // 4. 保存数据
    const outputDir = path.join(__dirname, "../translated-data/release/miniprogram_data");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "community.json");
    fs.writeFileSync(outputPath, JSON.stringify(builds, null, 2));
    console.log(`\n💾 数据已保存: ${outputPath}`);

    // 5. 打印统计
    console.log("\n📊 数据统计:");
    console.log(`   总BD数: ${builds.length}`);
    const classStats = {};
    builds.forEach(b => {
      const cls = b.meta.class;
      classStats[cls] = (classStats[cls] || 0) + 1;
    });
    Object.entries(classStats).forEach(([cls, count]) => {
      console.log(`   ${cls}: ${count}条`);
    });

    // 技能统计
    const totalSkills = builds.reduce((sum, b) => sum + b.skills.length, 0);
    console.log(`   总技能组: ${totalSkills}`);

    // 6. 上传到OSS
    if (builds.length > 0 && OSS_CONFIG.accessKeyId) {
      console.log("\n4️⃣ 上传到OSS...");
      try {
        const OSS = require("ali-oss");
        const client = new OSS(OSS_CONFIG);
        await client.put("poe2-ladders/miniprogram_data/community.json", outputPath);
        console.log("   ✅ OSS上传成功!");
      } catch (e) {
        console.log("   ⚠️ OSS上传失败:", e.message);
      }
    }

    return builds;

  } catch (e) {
    console.error("❌ 爬虫失败:", e.message);
    await page.screenshot({ path: path.join(__dirname, "../crawl_error.png"), fullPage: false });
    throw e;
  } finally {
    await browser.close();
  }
}

// 运行
if (require.main === module) {
  crawl()
    .then(() => console.log("\n🎉 完成!"))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { crawl };
