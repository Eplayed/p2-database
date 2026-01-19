const fs = require('fs');
const path = require('path');
const poe2ItemData_CN = require('./data-cn.js');
const poe2ItemData_EN = require('./data-us.js');

// 1. 请把你提供的 data_cn.js 和 data_en.js 内容完整粘贴到这里
// 或者从文件读取
// 假设这里是简化版的数据源（你需要把完整文件内容放在这，或者 require 进来）
// ---------------------------------------------------------------
// 模拟 require('data_cn.js')
// const poe2ItemData_CN = {
//     // ... 请把 data_cn.js 里的 poe2ItemData 对象完整粘贴到这里 ...
//     // 为了演示，我只放一部分
//     categories: { "基础": ["货币通货"], "传奇武器": ["长锋", "轻盾"] },
//     newAffixes: [
//         { mods: "of the Phantom", description: "+(31–33) 敏捷", type: "普通" },
//         { mods: "Amazon's", description: "+(451–550) 命中值", type: "普通" }
//     ]
// };

// // 模拟 require('data_en.js')
// const poe2ItemData_EN = {
//     // ... 请把 data_en.js 里的 poe2ItemData 对象完整粘贴到这里 ...
//     categories: { "Basic": ["craft Currency"], "Unique Weapons": ["Spears", "Bucklers"] },
//     newAffixes: [
//         { mods: "of the Phantom", description: "+(31–33) to Dexterity" },
//         { mods: "Amazon's", description: "+(451–550) to Accuracy Rating" }
//     ]
// };
// ---------------------------------------------------------------

const OUTPUT_DIR = './base-data/dist';
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function runExtraction() {
    console.log('🚀 开始提取翻译数据...');

    // --- 1. 提取物品基底 (Base Types) ---
    const dictBase = {};
    
    // 遍历 categories (结构: { "类别名": ["物品1", "物品2"] })
    // 我们假设中英文的 categories 结构是完全对齐的 (Key顺序一致，Value数组顺序一致)
    // 这是一个大胆的假设，但对于这种生成的数据通常成立
    
    const enKeys = Object.keys(poe2ItemData_EN.categories);
    const cnKeys = Object.keys(poe2ItemData_CN.categories);

    enKeys.forEach((enCat, index) => {
        const cnCat = cnKeys[index];
        const enItems = poe2ItemData_EN.categories[enCat];
        const cnItems = poe2ItemData_CN.categories[cnCat];

        if (enItems && cnItems && enItems.length === cnItems.length) {
            enItems.forEach((enItem, i) => {
                const cnItem = cnItems[i];
                if (enItem && cnItem) {
                    dictBase[enItem] = cnItem;
                }
            });
        }
    });
    
    // 补充 newCategories 里的数据
    const enNewKeys = Object.keys(poe2ItemData_EN.newCategories || {});
    const cnNewKeys = Object.keys(poe2ItemData_CN.newCategories || {});
    
    enNewKeys.forEach((enCat, index) => {
        const cnCat = cnNewKeys[index];
        const enItems = poe2ItemData_EN.newCategories[enCat];
        const cnItems = poe2ItemData_CN.newCategories[cnCat];
        
        if (enItems && cnItems) {
             enItems.forEach((enItem, i) => {
                const cnItem = cnItems[i];
                if (enItem && cnItem) dictBase[enItem] = cnItem;
            });
        }
    });

    console.log(`✅ 提取基底完成: ${Object.keys(dictBase).length} 条`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'dict_base.json'), JSON.stringify(dictBase, null, 2));


    // --- 2. 提取词缀 (Stats) ---
    // 结构: newAffixes: [ { mods: "of the Phantom", description: "..." } ]
    // 我们需要建立: 英文描述 -> 中文描述 的映射规则
    
    const dictStats = { keywords: {}, patterns: [] };
    const enAffixes = poe2ItemData_EN.newAffixes || [];
    const cnAffixes = poe2ItemData_CN.newAffixes || [];

    // 建立索引: modName -> cnDescription
    // 注意：有些 mod 名字一样但数值不同，我们主要提取“模式”
    const cnMap = new Map();
    cnAffixes.forEach(affix => {
        if(affix.mods && affix.description) {
            // 使用 mods 作为 key 来对齐
            cnMap.set(affix.mods, affix.description);
        }
    });

    enAffixes.forEach(enAffix => {
        const enDesc = enAffix.description;
        const cnDesc = cnMap.get(enAffix.mods);

        if (enDesc && cnDesc) {
            // 尝试提取正则模板
            // 英文: +(31–33) to Dexterity -> \+\([\d–]+\) to Dexterity
            // 中文: +(31–33) 敏捷 -> \+\([\d–]+\) 敏捷
            
            // 简单处理：把数值部分 (31-33) 替换为占位符 #
            const enTemplate = enDesc.replace(/\(.*\)/g, '#').replace(/\d+/g, '#');
            const cnTemplate = cnDesc.replace(/\(.*\)/g, '#').replace(/\d+/g, '#');
            
            // 如果模板不包含 #，说明是固定词缀，直接加关键词
            if (!enTemplate.includes('#')) {
                dictStats.keywords[enDesc] = cnDesc;
            } else {
                // 生成正则
                // 将 # 替换为 regex group
                const regexStr = enTemplate
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
                    .replace(/#/g, '([\\d\\.\\–\\-]+)'); // 匹配数值范围
                
                // 构造替换串
                let count = 0;
                const replaceStr = cnTemplate.replace(/#/g, () => {
                    count++;
                    return `$${count}`;
                });
                
                // 去重添加
                if (!dictStats.patterns.find(p => p.regex === regexStr)) {
                    dictStats.patterns.push({
                        regex: regexStr,
                        replace: replaceStr
                    });
                }
            }
        }
    });

    // 补充关键词：从 description 里提取属性名
    // 例如 " to Dexterity" -> " 敏捷"
    enAffixes.forEach((enAffix, i) => {
        const cnAffix = cnMap.get(enAffix.mods); // 获取对应的中文对象
        // 这里的 cnMap.get 返回的是 description 字符串，不是对象，无法直接取 simpledescription
        // 我们需要重新遍历 cnAffixes 找到对应的对象
        const cnObj = cnAffixes.find(c => c.mods === enAffix.mods);
        
        if (enAffix.simpledescription && cnObj && cnObj.simpledescription) {
             const enKey = enAffix.simpledescription.trim();
             const cnVal = cnObj.simpledescription.trim();
             if(enKey && cnVal) dictStats.keywords[enKey] = cnVal;
        }
    });

    console.log(`✅ 提取词缀完成: ${Object.keys(dictStats.keywords).length} 关键词, ${dictStats.patterns.length} 模板`);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'dict_stats.json'), JSON.stringify(dictStats, null, 2));

}

runExtraction();