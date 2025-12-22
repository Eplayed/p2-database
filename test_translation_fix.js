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

// 翻译函数
function translateItemName(itemName, baseType, frameType) {
  if (frameType === 3) {
    // 传奇物品
    const uniqueInfo = dictUnique[itemName];
    if (uniqueInfo) {
      return uniqueInfo.cn;
    }
    return itemName;
  } else {
    // 普通物品
    const baseEn = baseType || itemName;
    const cnBase = dictBase[baseEn];
    if (cnBase) {
      return itemName && itemName !== baseEn
        ? `${itemName} (${cnBase})`
        : cnBase;
    }
    return itemName;
  }
}

function translateGemName(gemName) {
  return dictGem[gemName] || gemName;
}

// 测试现有数据中的翻译
console.log('\n🧪 测试现有数据翻译功能...\n');

const playersDir = path.join(__dirname, 'translated-data/players');
const files = fs.readdirSync(playersDir);

if (files.length === 0) {
  console.log('❌ 没有找到玩家数据文件');
  process.exit(1);
}

const testFile = files[0];
const playerData = JSON.parse(fs.readFileSync(path.join(playersDir, testFile), 'utf8'));

console.log(`📋 测试文件: ${testFile}`);
console.log(`👤 玩家: ${playerData.info.name}`);

console.log('\n🛡️ 装备翻译测试:');
playerData.equipment.slice(0, 5).forEach((item, index) => {
  const translated = translateItemName(item.name, item.baseType, item.rarity);
  console.log(`${index + 1}. ${item.name} → ${translated}`);
});

if (playerData.skills && playerData.skills.length > 0) {
  console.log('\n💎 技能宝石翻译测试:');
  playerData.skills[0].gems.slice(0, 3).forEach((gem, index) => {
    const translated = translateGemName(gem.name);
    console.log(`${index + 1}. ${gem.name} → ${translated}`);
  });
}

console.log('\n✅ 翻译功能测试完成');
console.log('💡 现在重新运行 translate_crawler.js 即可获得翻译后的数据');