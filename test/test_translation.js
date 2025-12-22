const fs = require('fs');
const path = require('path');

console.log('🧪 测试翻译功能...');

// 测试翻译字典加载
try {
    const baseDataDir = path.join(__dirname, 'base-data/dist');
    
    if (!fs.existsSync(baseDataDir)) {
        console.error('❌ base-data/dist 目录不存在');
        process.exit(1);
    }
    
    const dictBase = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_base.json'), 'utf8'));
    const dictUnique = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_unique.json'), 'utf8'));
    const dictGem = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'dict_gem.json'), 'utf8'));
    
    console.log('✅ 翻译字典加载成功');
    console.log(`📊 统计信息:`);
    console.log(`   - 基础物品: ${Object.keys(dictBase).length} 条`);
    console.log(`   - 传奇物品: ${Object.keys(dictUnique).length} 条`);
    console.log(`   - 技能宝石: ${Object.keys(dictGem).length} 条`);
    
    // 测试几个翻译
    console.log('\n🔍 翻译测试:');
    console.log(`Crimson Amulet -> ${dictBase['Crimson Amulet']}`);
    console.log(`Fireball -> ${dictGem['Fireball']}`);
    console.log(`Brynhands Mark -> ${dictUnique['Brynhands Mark']?.cn}`);
    
    // 创建输出目录
    const outputDir = path.join(__dirname, 'translated-data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`\n📁 创建输出目录: ${outputDir}`);
    }
    
    console.log('\n✅ 翻译功能测试完成！');
    
} catch (e) {
    console.error('❌ 测试失败:', e.message);
}