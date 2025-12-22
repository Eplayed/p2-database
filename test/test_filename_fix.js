const fs = require('fs');
const path = require('path');

// 🔧 安全文件名生成函数 - 支持多语言
function generateSafeFileName(text, prefix = '') {
    if (!text) text = 'unknown';
    
    // 1. 规范化Unicode字符
    let normalized = text.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // 去除重音符号
        .replace(/[\u0430-\u044f]/g, c => 'cyril_' + (c.charCodeAt(0) - 0x0430)); // 西里尔字母转码
        .replace(/[\u0e00-\u0e7f]/g, c => 'thai_' + (c.charCodeAt(0) - 0x0e00));     // 泰文字符转码
        .replace(/[\uac00-\ud7a3]/g, c => 'kr_' + (c.charCodeAt(0) - 0xac00));          // 韩文字符转码
        .replace(/[\u0600-\u06ff]/g, c => 'ar_' + (c.charCodeAt(0) - 0x0600));          // 阿拉伯字符转码
    
    // 2. 只保留安全字符
    normalized = normalized
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 30); // 限制长度
    
    return prefix + normalized;
}

// 🔧 生成唯一文件名（避免重复）
function generateUniqueFileName(account, name, timestamp) {
    const safeAccount = generateSafeFileName(account);
    const safeName = generateSafeFileName(name);
    const timeHash = timestamp.toString().slice(-6);
    
    return `${timeHash}_${safeAccount}_${safeName}.json`;
}

console.log('🧪 测试多语言文件名生成...\n');

// 测试各种语言的account和name
const testCases = [
    { account: 'PlayerOne', name: 'CharacterName' },
    { account: '플레이어', name: '캐릭터' }, // 韩文
    { account: 'اللاعب', name: 'الشخصية' },   // 阿拉伯文  
    { account: 'ผู้เล่น', name: 'ตัวละคร' },   // 泰文
    { account: 'Игрок', name: 'Персонаж' },    // 西里尔文
    { account: '玩家123', name: '角色名' },    // 中文（虽然不应该出现，但测试一下）
    { account: '', name: 'EmptyAccount' },      // 空account
    { account: 'Account With Spaces', name: 'Name-With-Dashes' }, // 特殊符号
];

const outputDir = path.join(__dirname, 'translated-data');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const timestamp = Date.now();

console.log('📋 测试结果:');
testCases.forEach((testCase, index) => {
    const fileName = generateUniqueFileName(testCase.account, testCase.name, timestamp);
    
    console.log(`\n${index + 1}. 原始数据:`);
    console.log(`   Account: "${testCase.account}"`);
    console.log(`   Name: "${testCase.name}"`);
    console.log(`   生成文件名: ${fileName}`);
    
    // 创建测试文件
    const testData = {
        originalAccount: testCase.account,
        originalName: testCase.name,
        generatedFileName: fileName,
        timestamp: timestamp
    };
    
    fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(testData, null, 2));
});

console.log(`\n✅ 测试完成！生成了 ${testCases.length} 个测试文件`);
console.log(`📁 输出目录: ${outputDir}`);