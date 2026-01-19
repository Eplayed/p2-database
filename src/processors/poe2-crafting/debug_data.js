const fs = require('fs');

// 读取你的数据文件
const rawData = JSON.parse(fs.readFileSync('./data/crafting_db.json', 'utf8'));

console.log('=== 1. 检查数据源结构 ===');
console.log('根节点字段:', Object.keys(rawData));

// 检查词缀池的字段名
const affixKey = rawData.newAffixes ? 'newAffixes' : (rawData.affixes ? 'affixes' : 'mods');
console.log(`\n=== 2. 检查词缀池 (${affixKey}) ===`);

if (rawData[affixKey] && rawData[affixKey].length > 0) {
    const sampleMod = rawData[affixKey][100]; // 随便取第100个看看
    console.log('样本词缀结构:', JSON.stringify(sampleMod, null, 2));
    
    if (!sampleMod.spawn_weights) {
        console.error('❌ 警告：词缀中找不到 spawn_weights 字段！');
    }
} else {
    console.error('❌ 错误：找不到词缀数据！');
}

console.log('\n=== 3. 检查物品基底 (items) ===');
if (rawData.items && rawData.items.length > 0) {
    // 找一个有代表性的装备，比如"光辉战铠"或者"生锈的剑"
    const sampleItem = rawData.items.find(i => i.tags && i.tags.length > 0) || rawData.items[0];
    console.log('样本物品结构:', JSON.stringify(sampleItem, null, 2));
    
    if (!sampleItem.tags) {
        console.error('❌ 警告：物品中找不到 tags 字段！匹配将无法进行。');
    } else {
        console.log('该物品的 Tags:', sampleItem.tags);
    }
    
    // 检查分类字段
    console.log('分类字段 (category):', sampleItem.category);
    console.log('分类字段 (type):', sampleItem.type);
} else {
    console.error('❌ 错误：找不到物品数据！');
}