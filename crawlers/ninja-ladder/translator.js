/**
 * 翻译模块 - 使用 base-data/dist/ 字典翻译玩家数据
 */

const fs = require('fs');
const path = require('path');

// 加载翻译字典
const DICT_DIR = path.join(__dirname, '../../base-data/dist');

let dictBase = {};
let dictGem = {};
let dictUnique = {};

function loadDicts() {
  try {
    const basePath = path.join(DICT_DIR, 'dict_base.json');
    if (fs.existsSync(basePath)) {
      dictBase = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    }

    const gemPath = path.join(DICT_DIR, 'dict_gem.json');
    if (fs.existsSync(gemPath)) {
      dictGem = JSON.parse(fs.readFileSync(gemPath, 'utf8'));
    }

    const uniquePath = path.join(DICT_DIR, 'dict_unique.json');
    if (fs.existsSync(uniquePath)) {
      dictUnique = JSON.parse(fs.readFileSync(uniquePath, 'utf8'));
    }

    console.log(`   📖 字典加载: base=${Object.keys(dictBase).length}, gem=${Object.keys(dictGem).length}, unique=${Object.keys(dictUnique).length}`);
  } catch (e) {
    console.warn('   ⚠️ 字典加载失败:', e.message);
  }
}

// 首次加载
loadDicts();

/**
 * 翻译物品名称
 */
function translateItemName(itemName, baseType, frameType) {
  if (!itemName) return itemName;

  // 传奇物品 (frameType === 3)
  if (frameType === 3) {
    const uniqueInfo = dictUnique[itemName];
    if (uniqueInfo) {
      return typeof uniqueInfo === 'string' ? uniqueInfo : (uniqueInfo.cn || itemName);
    }
    // 模糊匹配
    for (const [key, value] of Object.entries(dictUnique)) {
      if (key.toLowerCase() === itemName.toLowerCase()) {
        return typeof value === 'string' ? value : (value.cn || itemName);
      }
    }
    return itemName;
  }

  // 普通物品 - 翻译基底类型
  const searchName = baseType || itemName;
  if (dictBase[searchName]) return dictBase[searchName];

  // 模糊匹配
  for (const [key, value] of Object.entries(dictBase)) {
    if (key.toLowerCase() === searchName.toLowerCase()) {
      return value;
    }
  }

  return itemName;
}

/**
 * 翻译技能宝石名称
 */
function translateGemName(gemName) {
  if (!gemName) return gemName;
  if (dictGem[gemName]) return dictGem[gemName];

  // 模糊匹配
  for (const [key, value] of Object.entries(dictGem)) {
    if (key.toLowerCase() === gemName.toLowerCase()) {
      return value;
    }
  }

  return gemName;
}

/**
 * 翻译完整的玩家数据
 */
function translatePlayer(rawData, playerMeta) {
  const result = {
    info: {
      name: rawData.name || playerMeta.name,
      class: rawData.class || playerMeta.class,
      level: rawData.level || playerMeta.level,
      account: rawData.account || playerMeta.account,
      league: rawData.league || '',
    },
    equipment: (rawData.items || []).map(item => {
      const i = item.itemData || item;
      const originalName = i.name || i.baseType || '';
      const translatedName = translateItemName(i.name, i.baseType, i.frameType);

      // 处理镶嵌宝石
      const socketedGems = (i.socketedItems || []).map(gem => {
        const gemName = gem.name || gem.typeLine || '';
        return {
          name: translateGemName(gemName),
          originalName: gemName,
          icon: gem.icon,
          isSupport: gem.support,
        };
      });

      return {
        slot: item.inventoryId,
        name: translatedName,
        originalName,
        baseType: i.baseType || '',
        icon: i.icon,
        rarity: i.frameType,
        desc: (i.explicitMods || []).join('\n'),
        gems: socketedGems,
      };
    }),
    skills: (rawData.skills || []).map(s => ({
      gems: (s.allGems || []).map(g => {
        const originalName = g.name || '';
        return {
          name: translateGemName(originalName),
          originalName,
          icon: g.itemData?.icon,
          isSupport: g.itemData?.support,
        };
      }),
    })),
    keystones: (rawData.keystones || []).map(ks => {
      // 提取 icon 相对路径
      let iconPath = ks.icon || '';
      if (iconPath.startsWith('http')) {
        const match = iconPath.match(/\/passives\/([^?]+)/i);
        if (match) iconPath = `passives/${match[1]}`;
      }
      return {
        name: ks.name,
        originalName: ks.name,
        icon: iconPath,
      };
    }),
  };

  return result;
}

module.exports = { translatePlayer, translateItemName, translateGemName, loadDicts };
