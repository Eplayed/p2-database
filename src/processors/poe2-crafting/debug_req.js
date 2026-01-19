const fs = require('fs');

// 读取原始数据
const rawData = JSON.parse(fs.readFileSync('./data/crafting_db.json', 'utf8'));

console.log('🔍 正在检查装备属性结构...');

// 找几个有代表性的部位看看
const targets = ['Gloves', 'Body Armours', 'Helmets'];

targets.forEach(type => {
    // 找该类型的第一个装备
    const item = rawData.items.find(i => i.class === type);
    if (item) {
        console.log(`\n--- [${type}] 样本: ${item.name || item.chineseName} ---`);
        console.log('Keys:', Object.keys(item)); // 打印所有字段名
        console.log('Requirements:', JSON.stringify(item.requirements, null, 2)); // 打印需求字段
        
        // 看看有没有散落在顶层的属性字段
        console.log('Root Level Props:', {
            reqLevel: item.reqLevel,
            drop_level: item.drop_level,
            str: item.str,
            dex: item.dex,
            int: item.int,
            strength: item.strength,
            dexterity: item.dexterity,
            intelligence: item.intelligence
        });
    }
});