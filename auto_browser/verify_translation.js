const fs = require('fs');
const dictBase = JSON.parse(fs.readFileSync('../base-data/dist/dict_base.json', 'utf8'));
const dictUnique = JSON.parse(fs.readFileSync('../base-data/dist/dict_unique.json', 'utf8'));
const dictStats = JSON.parse(fs.readFileSync('../base-data/dist/dict_stats.json', 'utf8'));

console.log('=== 翻译字典测试 ===');
console.log('\n基础物品翻译:');
console.log('Prismatic Ring =>', dictBase['Prismatic Ring']);
console.log('Imperial Greathelm =>', dictBase['Imperial Greathelm']);
console.log('Massive Mitts =>', dictBase['Massive Mitts']);
console.log('Tasalian Greaves =>', dictBase['Tasalian Greaves']);
console.log('Gold Amulet =>', dictBase['Gold Amulet']);

console.log('\n传奇物品翻译 (The Three Dragons):', dictUnique['The Three Dragons'] ? dictUnique['The Three Dragons'].cn : 'NOT FOUND');

console.log('\n词缀模式数量:', dictStats.patterns ? dictStats.patterns.length : 0);
console.log('\n新增词缀模式示例 (最后3个):');
if (dictStats.patterns) {
  const lastPatterns = dictStats.patterns.slice(-3);
  lastPatterns.forEach((p, i) => {
    console.log('  ' + (dictStats.patterns.length - 2 + i) + '.', p.regex.substring(0, 60) + '...');
  });
}

console.log('\n✅ 翻译字典加载正常!');
