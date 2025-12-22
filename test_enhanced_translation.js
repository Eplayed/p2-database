const fs = require('fs');
const path = require('path');

// 加载翻译字典
let dictBase = {}, dictUnique = {}, dictGem = {};

try {
  const baseDataDir = path.join(__dirname, 'base-data/dist');
  dictBase = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_base.json'), 'utf8'));
  dictUnique = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_unique.json'), 'utf8'));
  dictGem = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_gem.json'), 'utf8'));
  console.log('✅ 翻译字典加载成功');
} catch (e) {
  console.error('❌ 翻译字典加载失败:', e.message);
  process.exit(1);
}

// 增强版翻译函数
function translateItemName(itemName, baseType, frameType) {
  if (frameType === 3) {
    // 传奇物品
    const uniqueInfo = dictUnique[itemName];
    if (uniqueInfo) {
      return uniqueInfo.cn;
    }
    
    // 如果找不到精确匹配，尝试模糊匹配
    for (const [key, value] of Object.entries(dictUnique)) {
      if (key.toLowerCase().includes(itemName.toLowerCase()) || 
          itemName.toLowerCase().includes(key.toLowerCase())) {
        return value.cn;
      }
    }
    
    return itemName;
  } else {
    // 普通物品翻译
    
    // 1. 尝试精确匹配
    let cnBase = dictBase[baseType] || dictBase[itemName];
    
    if (!cnBase) {
      // 2. 通过关键词推断物品类型
      const itemTypeMap = {
        'Belt': ['腰带', '腰带的'],
        'Amulet': ['护身符', '护符'],
        'Ring': ['戒指'],
        'Boots': ['靴子', '靴'],
        'Gloves': ['手套'],
        'Charm': ['护符', '符文'],
        'Helm': ['头盔', '帽'],
        'Chest': ['胸甲', '上衣'],
        'Shield': ['盾牌', '盾'],
        'Sword': ['剑'],
        'Axe': ['斧'],
        'Mace': ['锤', '权杖'],
        'Bow': ['弓'],
        'Staff': ['法杖', '杖'],
        'Wand': ['法杖', '魔杖'],
      };
      
      // 检查itemName中的关键词
      for (const [englishType, chineseTypes] of Object.entries(itemTypeMap)) {
        if (itemName.toLowerCase().includes(englishType.toLowerCase())) {
          // 找到对应的中文翻译
          const baseExamples = Object.keys(dictBase).filter(key => 
            key.toLowerCase().includes(englishType.toLowerCase())
          );
          if (baseExamples.length > 0) {
            cnBase = dictBase[baseExamples[0]];
            console.log(`    🎯 匹配关键词: ${englishType} → ${baseExamples[0]} → ${cnBase}`);
            break;
          }
        }
      }
      
      // 如果还是没找到，尝试特定的物品名称映射
      if (!cnBase) {
        const specialMap = {
          'Harness': '腰带',
          'Hoof': '靴子', 
          'Coil': '戒指',
          'Touch': '手套',
          'Charm': '护符',
          'Maelström': '漩涡护符'
        };
        
        for (const [specialKey, chineseTranslation] of Object.entries(specialMap)) {
          if (itemName.toLowerCase().includes(specialKey.toLowerCase())) {
            cnBase = chineseTranslation;
            console.log(`    🎯 特殊映射: ${specialKey} → ${chineseTranslation}`);
            break;
          }
        }
      }
    }
    
    // 3. 如果还没找到，尝试模糊匹配
    if (!cnBase) {
      for (const [key, value] of Object.entries(dictBase)) {
        if (key.toLowerCase().includes(itemName.toLowerCase()) || 
            itemName.toLowerCase().includes(key.toLowerCase()) ||
            (baseType && (key.toLowerCase().includes(baseType.toLowerCase()) || 
                          baseType.toLowerCase().includes(key.toLowerCase())))) {
          cnBase = value;
          break;
        }
      }
    }
    
    if (cnBase) {
      // 构建最终翻译：物品前缀 + 基础类型
      const prefix = itemName.split(' ')[0]; // 取第一个词作为前缀
      if (prefix && cnBase && !cnBase.includes(prefix)) {
        // 如果有前缀且前缀不在翻译中，添加前缀
        return `${itemName} (${cnBase})`;
      }
      return cnBase || itemName;
    }
    
    // 如果都没找到，返回原始名称
    return itemName;
  }
}

function translateGemName(gemName) {
  return dictGem[gemName] || gemName;
}

// 测试翻译
console.log('\n🧪 测试改进后的翻译功能...\n');

const testItems = [
  { name: 'Glyph Harness', rarity: 2 },
  { name: 'Woe Hoof', rarity: 2 },
  { name: 'Pain Coil', rarity: 2 },
  { name: 'Rage Touch', rarity: 2 },
  { name: 'Maelström Charm', rarity: 2 },
];

console.log('🛡️ 装备翻译测试:');
testItems.forEach((item, index) => {
  const translated = translateItemName(item.name, null, item.rarity);
  console.log(`${index + 1}. ${item.name} → ${translated}`);
});

console.log('\n💎 技能宝石翻译测试:');
const testGems = ['Mace Strike', 'Rageforged II', 'Efficiency I'];
testGems.forEach((gem, index) => {
  const translated = translateGemName(gem);
  console.log(`${index + 1}. ${gem} → ${translated}`);
});

console.log('\n✅ 改进后的翻译功能测试完成');