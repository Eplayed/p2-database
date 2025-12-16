const fs = require('fs');
const path = require('path');

// --- 配置路径 ---
const BASE_ITEM_DIR = './base-item'; // 你的基底文件夹
const UNIQUE_FILE = './unique_item.json';
const GEM_FILE = './gems.json';
// 如果你补抓了天赋，把路径加在这里
// const PASSIVE_FILE = './passives.json'; 

const OUTPUT_DIR = './dist'; // 输出目录

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// --- 1. 合并所有基底装备 (Base Items) ---
console.log('正在合并基底装备...');
let allBaseItems = {}; // 使用对象存储，Key=英文名，Value=中文名
// 这样做的好处是云函数查找时复杂度是 O(1)，速度极快

try {
    const files = fs.readdirSync(BASE_ITEM_DIR);
    files.forEach(file => {
        if (path.extname(file) === '.json') {
            const filePath = path.join(BASE_ITEM_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            
            content.forEach(item => {
                // 生成查找表： Key = 英文原名, Value = 中文名
                // 这里我们只存中文名，为了减小文件体积。
                // 如果你需要图片，可以存成 { cn: item.cn, img: item.img }
                if (item.en && item.cn) {
                    allBaseItems[item.en] = item.cn; 
                }
            });
        }
    });
    
    // 写入文件
    fs.writeFileSync(path.join(OUTPUT_DIR, 'dict_base.json'), JSON.stringify(allBaseItems));
    console.log(`✅ 基底合并完成，共 ${Object.keys(allBaseItems).length} 条数据。`);

} catch (err) {
    console.error('❌ 合并基底失败:', err);
}

// --- 2. 处理传奇装备 (Uniques) ---
console.log('正在处理传奇装备...');
let allUniques = {};

try {
    const content = JSON.parse(fs.readFileSync(UNIQUE_FILE, 'utf-8'));
    content.forEach(item => {
        if (item.en && item.cn) {
            // 传奇装备我们多存一个 desc (静态描述)，用于 V1 展示
            allUniques[item.en] = {
                cn: item.cn,
                desc: item.desc || "" // 防止没有描述报错
            };
        }
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'dict_unique.json'), JSON.stringify(allUniques));
    console.log(`✅ 传奇处理完成，共 ${Object.keys(allUniques).length} 条数据。`);
} catch (err) {
    console.error('❌ 处理传奇失败:', err);
}

// --- 3. 处理技能宝石 (Gems) ---
console.log('正在处理技能宝石...');
let allGems = {};

try {
    const content = JSON.parse(fs.readFileSync(GEM_FILE, 'utf-8'));
    content.forEach(item => {
        if (item.en && item.cn) {
            allGems[item.en] = item.cn;
        }
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'dict_gem.json'), JSON.stringify(allGems));
    console.log(`✅ 宝石处理完成，共 ${Object.keys(allGems).length} 条数据。`);
} catch (err) {
    console.error('❌ 处理宝石失败:', err);
}

console.log('🎉 所有数据准备就绪！请将 dist 文件夹内的文件上传到阿里云函数。');