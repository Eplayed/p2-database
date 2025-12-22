const fs = require('fs');
const path = require('path');

console.log('🧪 测试简化文件名生成...\n');

// 🔧 安全文件名生成函数 - 支持多语言
function generateSafeFileName(text, prefix = '') {
    if (!text) text = 'unknown';
    
    // 简化策略：直接将非安全字符替换为下划线，并添加前缀标识语言类型
    let normalized = text;
    let langPrefix = '';
    
    // 检测主要语言类型
    if (/[\uac00-\ud7af]/.test(text)) {
        langPrefix = 'kr_'; // 韩文
    } else if (/[\u0600-\u06ff]/.test(text)) {
        langPrefix = 'ar_'; // 阿拉伯文
    } else if (/[\u0e00-\u0e7f]/.test(text)) {
        langPrefix = 'th_'; // 泰文
    } else if (/[\u0400-\u04ff]/.test(text)) {
        langPrefix = 'ru_'; // 西里尔文
    } else if (/[\u4e00-\u9fff]/.test(text)) {
        langPrefix = 'cn_'; // 中文
    } else {
        langPrefix = 'en_'; // 英文/其他
    }
    
    // 创建安全字符串：使用简化版本
    const simpleHash = text.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return c.toLowerCase(); // A-Z
        if (code >= 97 && code <= 122) return c; // a-z
        if (code >= 48 && code <= 57) return c; // 0-9
        return 'x'; // 其他字符用x代替
    }).join('').substring(0, 10);
    
    const fullSafe = (langPrefix + simpleHash)
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    
    return prefix + fullSafe;
}

// 🔧 生成唯一文件名
function generateUniqueFileName(account, name, timestamp) {
    const safeAccount = generateSafeFileName(account);
    const safeName = generateSafeFileName(name);
    const timeHash = timestamp.toString().slice(-6);
    
    return `${timeHash}_${safeAccount}_${safeName}.json`;
}

// 测试各种语言的account和name
const testCases = [
    { account: 'PlayerOne', name: 'CharacterName', desc: '英文' },
    { account: '플레이어', name: '캐릭터', desc: '韩文' }, 
    { account: 'اللاعب', name: 'الشخصية', desc: '阿拉伯文' },   
    { account: 'ผู้เล่น', name: 'ตัวละคร', desc: '泰文' },   
    { account: 'Игрок', name: 'Персонаж', desc: '西里尔文' },    
    { account: '', name: 'EmptyAccount', desc: '空account' },      
    { account: 'Account With Spaces', name: 'Name-With-Dashes', desc: '特殊符号' }, 
];

const timestamp = Date.now();
const outputDir = path.join(__dirname, 'translated-data');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('📋 测试结果:');
testCases.forEach((testCase, index) => {
    const fileName = generateUniqueFileName(testCase.account, testCase.name, timestamp);
    
    console.log(`\n${index + 1}. ${testCase.desc}:`);
    console.log(`   Account: "${testCase.account}"`);
    console.log(`   Name: "${testCase.name}"`);
    console.log(`   文件名: ${fileName}`);
    
    // 创建测试文件
    const testData = {
        description: testCase.desc,
        originalAccount: testCase.account,
        originalName: testCase.name,
        generatedFileName: fileName,
        timestamp: timestamp
    };
    
    fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(testData, null, 2));
});

console.log(`\n✅ 测试完成！生成了 ${testCases.length} 个测试文件`);
console.log(`📁 输出目录: ${outputDir}`);