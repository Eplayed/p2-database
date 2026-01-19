const fs = require('fs');
const path = require('path');

const DATA_FILE = './data/crafting_db.json';
const OUTPUT_DIR = './miniprogram_data';
const IMAGE_BASE_URL = 'https://www.poe2ggg.com/';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
if (!fs.existsSync(path.join(OUTPUT_DIR, 'mods'))) fs.mkdirSync(path.join(OUTPUT_DIR, 'mods'));

const rawData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// 1. 加载字典
let dictBase = {};
try {
    const dictPath = path.join(__dirname, '../../common/dictionaries/dist/dict_base.json');
    if (fs.existsSync(dictPath)) dictBase = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
} catch (e) {}

// --- 名字关键词推断规则 (针对中文名优化) ---
const KEYWORD_MAP = {
    // 力量 (红)
    'Str': [
        'Plate', 'Cuirass', 'Greathelm', 'Greaves', 'Gauntlets', 'Mitts', 'Sabatons', 'Tower Shield', 'Maul',
        '战铠', '胸甲', '巨盔', '胫甲', '手甲', '护手', '战靴', '塔盾', '巨锤', '锁甲' // 增加中文关键词
    ],
    // 敏捷 (绿)
    'Dex': [
        'Leather', 'Vest', 'Coat', 'Jacket', 'Hood', 'Cap', 'Wraps', 'Bracers', 'Boots', 'Sandals', 'Targe', 'Buckler',
        '皮甲', '背心', '外套', '外衣', '兜帽', '便帽', '裹手', '护腕', '长靴', '鞋履', '圆盾', '轻盾', '锁甲' // 锁甲通常是力敏或敏智
    ],
    // 智慧 (蓝)
    'Int': [
        'Robe', 'Raiment', 'Crown', 'Circlet', 'Tiara', 'Slippers', 'Shoes', 'Gloves', 'Cuffs', 'Focus',
        '长袍', '之衣', '束衣', '王冠', '头冠', '冠冕', '便鞋', '手套', '袖带', '法器'
    ]
};

function inferSuffix(item) {
    // 优先用英文名推断，如果没有则用中文名
    const text = (item.englishName || item.name || "").toLowerCase();
    const cnText = (item.chineseName || item.name || "");

    const check = (list) => list.some(k => text.includes(k.toLowerCase()) || cnText.includes(k));

    let isStr = check(KEYWORD_MAP.Str);
    let isDex = check(KEYWORD_MAP.Dex);
    let isInt = check(KEYWORD_MAP.Int);

    // 特殊修正：锁甲 (Mail) 通常是 力敏 (StrDex)
    if (text.includes('mail') || cnText.includes('锁甲')) {
        isStr = true;
        isDex = true;
    }

    if (isStr && isDex) return '_StrDex';
    if (isStr && isInt) return '_StrInt';
    if (isDex && isInt) return '_DexInt';
    if (isStr) return '_Str';
    if (isDex) return '_Dex';
    if (isInt) return '_Int';
    return ''; 
}

// --- 核心配置：定义每个子类的显示名称和排序 ---
const SUB_CATEGORY_META = {
    // 头盔
    'Helmets': { name: '头盔', sort: 1 },
    'Helmets_Str': { name: '头盔🔴', sort: 2 },
    'Helmets_Dex': { name: '头盔⚡', sort: 3 },
    'Helmets_Int': { name: '头盔🔵', sort: 4 },
    'Helmets_StrDex': { name: '头盔🔴⚡', sort: 5 },
    'Helmets_StrInt': { name: '头盔🔴🔵', sort: 6 },
    'Helmets_DexInt': { name: '头盔⚡🔵', sort: 7 },
    
    // 服装
    'Body Armours': { name: '服装', sort: 1 },
    'Body Armours_Str': { name: '服装🔴', sort: 2 },
    'Body Armours_Dex': { name: '服装⚡', sort: 3 },
    'Body Armours_Int': { name: '服装🔵', sort: 4 },
    'Body Armours_StrDex': { name: '服装🔴⚡', sort: 5 },
    'Body Armours_StrInt': { name: '服装🔴🔵', sort: 6 },
    'Body Armours_DexInt': { name: '服装⚡🔵', sort: 7 },

    // 手套
    'Gloves': { name: '手套', sort: 1 },
    'Gloves_Str': { name: '手套🔴', sort: 2 },
    'Gloves_Dex': { name: '手套⚡', sort: 3 },
    'Gloves_Int': { name: '手套🔵', sort: 4 },
    'Gloves_StrDex': { name: '手套🔴⚡', sort: 5 },
    'Gloves_StrInt': { name: '手套🔴🔵', sort: 6 },
    'Gloves_DexInt': { name: '手套⚡🔵', sort: 7 },

    // 鞋子
    'Boots': { name: '鞋子', sort: 1 },
    'Boots_Str': { name: '鞋子🔴', sort: 2 },
    'Boots_Dex': { name: '鞋子⚡', sort: 3 },
    'Boots_Int': { name: '鞋子🔵', sort: 4 },
    'Boots_StrDex': { name: '鞋子🔴⚡', sort: 5 },
    'Boots_StrInt': { name: '鞋子🔴🔵', sort: 6 },
    'Boots_DexInt': { name: '鞋子⚡🔵', sort: 7 },

    // 盾牌
    'Shields': { name: '盾牌', sort: 1 },
    'Shields_Str': { name: '盾🔴', sort: 2 },
    'Shields_Dex': { name: '盾⚡', sort: 3 },
    'Shields_Int': { name: '盾🔵', sort: 4 },
    'Shields_StrDex': { name: '盾🔴⚡', sort: 5 },
    'Shields_StrInt': { name: '盾🔴🔵', sort: 6 },
    'Shields_DexInt': { name: '盾⚡🔵', sort: 7 },
    
    // 其他常规分类
    'Claws': { name: '爪子', sort: 10 },
    'Daggers': { name: '匕首', sort: 1 },
    'Wands': { name: '法杖', sort: 5 },
    'One Hand Swords': { name: '单手剑', sort: 4 },
    'One Hand Axes': { name: '单手斧', sort: 3 },
    'One Hand Maces': { name: '单手锤', sort: 2 },
    'Sceptres': { name: '权杖', sort: 7 },
    'Spears': { name: '长锋', sort: 8 },
    'Flails': { name: '链锤', sort: 6 },
    'Bows': { name: '弓', sort: 2 },
    'Staves': { name: '长杖', sort: 9 },
    'Two Hand Swords': { name: '双手剑', sort: 6 },
    'Two Hand Axes': { name: '双手斧', sort: 5 },
    'Two Hand Maces': { name: '双手锤', sort: 4 },
    'Quarterstaves': { name: '细杖', sort: 7 },
    'Crossbows': { name: '十字弓', sort: 3 },
    'Traps': { name: '陷阱', sort: 8 },
    'Talismans': { name: '魔符', sort: 1 },
    'Quivers': { name: '箭袋', sort: 1 },
    'Foci': { name: '法器', sort: 2 },
    'Bucklers': { name: '轻盾', sort: 3 },
    'Amulets': { name: '项链', sort: 1 },
    'Rings': { name: '戒指', sort: 2 },
    'Belts': { name: '腰带', sort: 3 },
    'Jewels': { name: '珠宝', sort: 1 },
};

console.log('🚀 [V11.0] 开始重组数据...');

const hierarchy = {};
// 定义大类及其包含的原始 Class 前缀
const BROAD_CATEGORIES = {
    '单手武器': ['Claws', 'Daggers', 'Wands', 'One Hand', 'Sceptres', 'Spears', 'Flails'],
    '双手武器': ['Bows', 'Staves', 'Two Hand', 'Quarterstaves', 'Crossbows', 'Traps', 'Talismans', 'FishingRods'],
    '副手': ['Shields', 'Quivers', 'Foci', 'Bucklers'],
    '头盔': ['Helmets'],
    '服装': ['Body Armours'],
    '手套': ['Gloves'],
    '鞋子': ['Boots'],
    '饰品': ['Amulets', 'Rings', 'Belts'],
    '珠宝': ['Jewels']
};

// 初始化
Object.keys(BROAD_CATEGORIES).forEach(key => hierarchy[key] = {});

rawData.items.forEach(item => {
    const itemClass = item.class;
    if (!itemClass) return;
    if (item.category && item.category.includes('传奇')) return;

    // 1. 确定大类 (Broad Category)
    let broadName = null;
    for (const [bName, prefixes] of Object.entries(BROAD_CATEGORIES)) {
        if (prefixes.some(p => itemClass.startsWith(p))) {
            broadName = bName;
            break;
        }
    }
    if (!broadName) return; // 未知分类跳过

    // 2. 确定细分 Key
    // 对于防具，我们需要计算后缀
    let subKey = itemClass;
    if (['Helmets', 'Body Armours', 'Gloves', 'Boots', 'Shields'].includes(itemClass)) {
        subKey = itemClass + inferSuffix(item);
    }

    // 3. 获取子类元数据
    let meta = SUB_CATEGORY_META[subKey];
    // 兜底：如果细分Key没配置(极少情况)，回退到原始Key配置
    if (!meta) meta = SUB_CATEGORY_META[itemClass];
    if (!meta) return;

    // 4. 存入结构
    if (!hierarchy[broadName][subKey]) {
        hierarchy[broadName][subKey] = {
            name: meta.name,
            category: subKey, // 文件名
            sort: meta.sort,
            icon: "",
            items: []
        };
    }

    let icon = item.imagePath || item.icon || "";
    if (icon && !icon.startsWith('http')) icon = IMAGE_BASE_URL + icon;
    if (!hierarchy[broadName][subKey].icon && icon) hierarchy[broadName][subKey].icon = icon;

    const name = item.chineseName || item.simplechineseName || item.name || item.englishName;
    const level = item.reqLevel || item.drop_level || 0;
    
    hierarchy[broadName][subKey].items.push({
        name: name,
        enName: item.englishName || item.name,
        level: level,
        itemLevel: 100,
        requirements: `Lv.${level}`,
        icon: icon,
        category: subKey
    });
});

// 转换输出
const finalBases = [];
// 按照大类定义顺序输出
Object.keys(BROAD_CATEGORIES).forEach(broadName => {
    const subCats = hierarchy[broadName];
    const subList = Object.values(subCats).sort((a, b) => a.sort - b.sort);
    
    if (subList.length > 0) {
        subList.forEach(sub => sub.items.sort((a, b) => b.level - a.level));
        finalBases.push({ name: broadName, list: subList });
    }
});

fs.writeFileSync(path.join(OUTPUT_DIR, 'bases.json'), JSON.stringify(finalBases));
console.log(`✅ bases.json 生成完毕`);

// --- 词缀文件生成 ---
console.log('📦 正在生成词缀文件...');
const modsByClass = {};

if (rawData.newAffixes) {
    rawData.newAffixes.forEach(affix => {
        if (!affix.class) return;
        const rawClass = affix.class;
        
        // 找到所有以此 rawClass 开头的配置 Key
        // 例如 rawClass="Helmets", 匹配 "Helmets", "Helmets_Str"...
        const targetKeys = Object.keys(SUB_CATEGORY_META).filter(k => k.startsWith(rawClass));
        
        if (targetKeys.length === 0) return;

        targetKeys.forEach(targetKey => {
            if (!modsByClass[targetKey]) modsByClass[targetKey] = { prefixes: [], suffixes: [] };
            
            const cleanMod = {
                name: affix.simpledescription || affix.mods,
                desc: affix.description,
                level: affix.reqLevel || 0,
                tier: affix.tier,
                weight: parseInt(affix.weight || "0"),
                group: affix.family || "Unknown"
            };
            
            if (affix.affixType === '前綴') modsByClass[targetKey].prefixes.push(cleanMod);
            else if (affix.affixType === '後綴') modsByClass[targetKey].suffixes.push(cleanMod);
        });
    });
}

for (const [cls, data] of Object.entries(modsByClass)) {
    if (SUB_CATEGORY_META[cls]) {
        const safeName = cls.replace(/[^a-zA-Z0-9_]/g, '');
        fs.writeFileSync(path.join(OUTPUT_DIR, 'mods', `mods_${safeName}.json`), JSON.stringify(data));
    }
}
console.log('✅ 词缀文件生成完毕！');