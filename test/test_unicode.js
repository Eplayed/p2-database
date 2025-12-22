const fs = require('fs');
const path = require('path');

console.log('🧪 测试Unicode处理...');

// 测试各种字符
const testStrings = [
    'PlayerOne',                    // 英文
    '플레이어',                      // 韩文
    'اللاعب',                       // 阿拉伯文
    'ผู้เล่น',                     // 泰文
    'Игрок',                        // 西里尔文
];

testStrings.forEach((str, i) => {
    console.log(`\n${i+1}. 原始: "${str}"`);
    
    // 测试normalize
    try {
        const normalized = str.normalize('NFD');
        console.log(`   normalize: "${normalized}"`);
    } catch(e) {
        console.log(`   normalize error: ${e.message}`);
    }
    
    // 测试charCodeAt
    for (let j = 0; j < Math.min(str.length, 3); j++) {
        const char = str[j];
        const code = char.charCodeAt(0);
        console.log(`   字符[${j}]: "${char}" -> ${code} (0x${code.toString(16)})`);
    }
});

console.log('\n✅ Unicode测试完成');