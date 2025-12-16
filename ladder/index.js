const fs = require('fs');
const path = require('path');

// 模拟阿里云FC的request对象
function createMockRequest(queryString = null, path = null, pathParameters = null) {
    return {
        queryString: queryString,
        path: path,
        pathParameters: pathParameters
    };
}

// 模拟阿里云FC的context对象
function createMockContext() {
    return {};
}

// 导入FC函数
const getClassesHandler = require('./fc-get-classes.js').handler;
const getClassByNameHandler = require('./fc-get-class-by-name.js').handler;

// 测试函数
async function testHandlers() {
    console.log('🚀 开始测试API接口...\n');

    // 测试1: 获取所有职业数据
    console.log('📋 测试1: 获取所有职业数据 (get-classes)');
    try {
        const request1 = createMockRequest();
        const context1 = createMockContext();
        const result1 = await getClassesHandler(request1, context1);
        
        console.log(`状态码: ${result1.statusCode}`);
        if (result1.statusCode === 200) {
            const data = JSON.parse(result1.body);
            console.log(`✅ 成功获取 ${data.count} 个职业数据`);
            console.log(`职业列表: ${data.data.map(c => c.name).join(', ')}`);
        } else {
            console.log(`❌ 失败: ${result1.body}`);
        }
    } catch (error) {
        console.log(`❌ 错误: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');

    // 测试2: 通过query string获取Shaman数据
    console.log('🧙 测试2: 通过query string获取Shaman数据');
    try {
        const request2 = createMockRequest({ name: 'Shaman' });
        const context2 = createMockContext();
        const result2 = await getClassByNameHandler(request2, context2);
        
        console.log(`状态码: ${result2.statusCode}`);
        if (result2.statusCode === 200) {
            const data = JSON.parse(result2.body);
            console.log(`✅ 成功获取Shaman数据: ${data.count} 条记录`);
            console.log(`前3名玩家: ${data.data.slice(0, 3).map(p => `${p.rank}. ${p.name} (Lv.${p.level})`).join(', ')}`);
        } else {
            console.log(`❌ 失败: ${result2.body}`);
        }
    } catch (error) {
        console.log(`❌ 错误: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');

    // 测试3: 通过path参数获取Pathfinder数据
    console.log('🏹 测试3: 通过path参数获取Pathfinder数据');
    try {
        const request3 = createMockRequest(null, '/Pathfinder', { name: 'Pathfinder' });
        const context3 = createMockContext();
        const result3 = await getClassByNameHandler(request3, context3);
        
        console.log(`状态码: ${result3.statusCode}`);
        if (result3.statusCode === 200) {
            const data = JSON.parse(result3.body);
            console.log(`✅ 成功获取Pathfinder数据: ${data.count} 条记录`);
            console.log(`前3名玩家: ${data.data.slice(0, 3).map(p => `${p.rank}. ${p.name} (Lv.${p.level})`).join(', ')}`);
        } else {
            console.log(`❌ 失败: ${result3.body}`);
        }
    } catch (error) {
        console.log(`❌ 错误: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');

    // 测试4: 获取包含空格的职业名 (Blood Mage)
    console.log('🩸 测试4: 获取包含空格的职业名 (Blood Mage)');
    try {
        const request4 = createMockRequest({ name: 'Blood Mage' });
        const context4 = createMockContext();
        const result4 = await getClassByNameHandler(request4, context4);
        
        console.log(`状态码: ${result4.statusCode}`);
        if (result4.statusCode === 200) {
            const data = JSON.parse(result4.body);
            console.log(`✅ 成功获取Blood Mage数据: ${data.count} 条记录`);
            console.log(`前3名玩家: ${data.data.slice(0, 3).map(p => `${p.rank}. ${p.name} (Lv.${p.level})`).join(', ')}`);
        } else {
            console.log(`❌ 失败: ${result4.body}`);
        }
    } catch (error) {
        console.log(`❌ 错误: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');

    // 测试5: 获取不存在的职业
    console.log('❌ 测试5: 获取不存在的职业');
    try {
        const request5 = createMockRequest({ name: 'NonExistentClass' });
        const context5 = createMockContext();
        const result5 = await getClassByNameHandler(request5, context5);
        
        console.log(`状态码: ${result5.statusCode}`);
        if (result5.statusCode === 404) {
            const data = JSON.parse(result5.body);
            console.log(`✅ 正确处理不存在的职业`);
            console.log(`可用职业: ${data.availableClasses.join(', ')}`);
        } else {
            console.log(`❌ 未正确处理: ${result5.body}`);
        }
    } catch (error) {
        console.log(`❌ 错误: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');

    // 测试6: 不提供name参数
    console.log('⚠️  测试6: 不提供name参数');
    try {
        const request6 = createMockRequest();
        const context6 = createMockContext();
        const result6 = await getClassByNameHandler(request6, context6);
        
        console.log(`状态码: ${result6.statusCode}`);
        if (result6.statusCode === 400) {
            console.log(`✅ 正确处理缺少参数的情况`);
        } else {
            console.log(`❌ 未正确处理: ${result6.body}`);
        }
    } catch (error) {
        console.log(`❌ 错误: ${error.message}`);
    }

    console.log('\n🎉 测试完成!');
}

// 检查数据文件是否存在
function checkDataFiles() {
    const dataDir = path.join(__dirname, 'data');
    const requiredFiles = ['classes.json'];
    
    console.log('📁 检查数据文件...');
    
    for (const file of requiredFiles) {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
            console.log(`✅ ${file} 存在`);
        } else {
            console.log(`❌ ${file} 不存在`);
            return false;
        }
    }
    
    // 列出所有职业数据文件
    const classFiles = fs.readdirSync(dataDir)
        .filter(file => file.endsWith('.json') && file !== 'classes.json')
        .map(file => file.replace('.json', ''));
    
    console.log(`📊 找到 ${classFiles.length} 个职业数据文件: ${classFiles.join(', ')}`);
    return true;
}

// 主函数
async function main() {
    console.log('🔧 阿里云FC API接口测试程序');
    console.log('='.repeat(50));
    
    if (!checkDataFiles()) {
        console.log('❌ 数据文件检查失败，退出测试');
        return;
    }
    
    console.log();
    await testHandlers();
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    testHandlers,
    checkDataFiles,
    createMockRequest,
    createMockContext
};