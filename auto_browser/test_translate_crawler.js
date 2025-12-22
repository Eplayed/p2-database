const fs = require('fs');
const path = require('path');

// 加载翻译字典
let dictBase = {}, dictUnique = {}, dictGem = {};
try {
    const baseDataDir = path.join(__dirname, '../base-data/dist');
    dictBase = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_base.json'), 'utf8'));
    dictUnique = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_unique.json'), 'utf8'));
    dictGem = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_gem.json'), 'utf8'));
    console.log('✅ 翻译字典加载成功');
} catch (e) { 
    console.error('❌ 翻译字典加载失败', e); 
}

// 翻译函数
function translateItemName(itemName, baseType, frameType) {
    if (frameType === 3) { // 传奇物品
        const uniqueInfo = dictUnique[itemName];
        if (uniqueInfo) {
            return uniqueInfo.cn;
        }
        return itemName;
    } else { // 普通物品
        const baseEn = baseType || itemName;
        const cnBase = dictBase[baseEn];
        if (cnBase) {
            return (itemName && itemName !== baseEn) ? `${itemName} (${cnBase})` : cnBase;
        }
        return itemName;
    }
}

function translateGemName(gemName) {
    return dictGem[gemName] || gemName;
}

// 模拟数据进行翻译测试
function simulateTranslation() {
    console.log('🎯 模拟翻译测试...');
    
    // 模拟装备数据
    const mockEquipment = [
        {
            slot: 'Amulet',
            name: 'Crimson Amulet',
            baseType: 'Crimson Amulet',
            rarity: 0,
            frameType: 0
        },
        {
            slot: 'Body Armour',
            name: 'Brynhands Mark',
            baseType: 'Body Armour',
            rarity: 3,
            frameType: 3
        },
        {
            slot: 'Weapon',
            name: 'Exquisite Blade',
            baseType: 'Exquisite Blade',
            rarity: 0,
            frameType: 0
        }
    ];
    
    // 模拟技能数据
    const mockSkills = [
        {
            mainSkillName: 'Fireball',
            gems: [
                { name: 'Fireball', isSupport: false, level: 20 },
                { name: 'Increased Area of Effect', isSupport: true, level: 10 },
                { name: 'Elemental Focus', isSupport: true, level: 15 }
            ]
        },
        {
            mainSkillName: 'Freezing Pulse',
            gems: [
                { name: 'Freezing Pulse', isSupport: false, level: 18 },
                { name: 'Lesser Multiple Projectiles', isSupport: true, level: 8 }
            ]
        }
    ];
    
    // 翻译装备
    const translatedEquipment = mockEquipment.map(item => {
        const translatedName = translateItemName(item.name, item.baseType, item.frameType);
        let staticDesc = "";
        
        if (item.frameType === 3) {
            const uniqueInfo = dictUnique[item.name];
            if (uniqueInfo) {
                staticDesc = uniqueInfo.desc;
            }
        }
        
        return {
            slot: item.slot,
            name: translatedName,
            originalName: item.name,
            baseType: item.baseType,
            rarity: item.rarity,
            desc: staticDesc
        };
    });
    
    // 翻译技能
    const translatedSkills = mockSkills.map(skill => {
        const translatedGems = skill.gems.map(gem => ({
            name: translateGemName(gem.name),
            originalName: gem.name,
            isSupport: gem.isSupport,
            level: gem.level
        }));
        
        const mainGem = translatedGems.find(g => !g.isSupport) || translatedGems[0];
        const originalMainGem = skill.gems.find(g => !g.isSupport) || skill.gems[0];
        
        return {
            mainSkillName: mainGem ? mainGem.name : "未知技能",
            originalMainSkillName: originalMainGem ? originalMainGem.name : "Unknown Skill",
            gems: translatedGems
        };
    });
    
    // 模拟完整玩家数据
    const mockPlayerData = {
        info: {
            name: 'TestPlayer',
            class: 'Witch', 
            level: 85,
            account: 'testaccount',
            league: 'vaal'
        },
        equipment: translatedEquipment,
        skills: translatedSkills,
        keystones [],
        passiveTreeImage: null
    };
    
    return mockPlayerData;
}

// 创建输出目录和保存文件
function saveTranslatedData() {
    console.log('💾 保存翻译数据...');
    
    const outputDir = path.join(__dirname, '../translated-data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const playerData = simulateTranslation();
    
    // 保存玩家详情
    fs.writeFileSync(
        path.join(outputDir, 'test_player_translated.json'), 
        JSON.stringify(playerData, null, 2)
    );
    
    // 保存索引数据
    const indexData = {
        updateTime: new Date().toISOString(),
        testPlayer: {
            name: playerData.info.name,
            level: playerData.info.level,
            class: playerData.info.class,
            equipmentCount: playerData.equipment.length,
            skillCount: playerData.skills.length
        },
        translationInfo: {
            baseItemsCount: Object.keys(dictBase).length,
            uniqueItemsCount: Object.keys(dictUnique).length,
            gemsCount: Object.keys(dictGem).length,
            translatedAt: new Date().toISOString()
        }
    };
    
    fs.writeFileSync(
        path.join(outputDir, 'test_index_translated.json'), 
        JSON.stringify(indexData, null, 2)
    );
    
    console.log('✅ 翻译数据保存完成！');
    console.log(`📁 输出目录: ${outputDir}`);
    console.log('\n📊 翻译示例:');
    
    // 显示翻译示例
    playerData.equipment.forEach((item, i) => {
        console.log(`\n${i+1}. ${item.slot}:`);
        console.log(`   原名: ${item.originalName}`);
        console.log(`   译文: ${item.name}`);
        if (item.desc) {
            console.log(`   描述: ${item.desc.substring(0, 50)}...`);
        }
    });
    
    playerData.skills.forEach((skill, i) => {
        console.log(`\n技能组${i+1}:`);
        console.log(`   主技能: ${skill.mainSkillName} (${skill.originalMainSkillName})`);
        skill.gems.forEach((gem, j) => {
            const gemType = gem.isSupport ? '辅助' : '主动';
            console.log(`   ${j+1}. [${gemType}] ${gem.name} (${gem.originalName}) Lv.${gem.level}`);
        });
    });
}

// 运行测试
console.log('🚀 启动翻译爬虫测试');
saveTranslatedData();