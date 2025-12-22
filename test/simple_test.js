const fs = require('fs');
const path = require('path');

console.log('🧪 测试翻译功能...');

try {
    const baseDataDir = path.join(__dirname, 'base-data/dist');
    const dictBase = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_base.json'), 'utf8'));
    const dictGem = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_gem.json'), 'utf8'));
    
    console.log('✅ 字典加载成功');
    console.log('Crimson Amulet -> ' + dictBase['Crimson Amulet']);
    console.log('Fireball -> ' + dictGem['Fireball']);
    
    const outputDir = path.join(__dirname, 'translated-data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(outputDir, 'test.json'), JSON.stringify({test: '成功'}, null, 2));
    console.log('✅ 测试完成');
    
} catch (e) {
    console.error('❌ 失败:', e.message);
}