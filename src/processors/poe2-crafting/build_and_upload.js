const fs = require('fs');
const path = require('path');
const OSSManager = require('../../common/oss/OSSManager');

async function buildAndUpload() {
    console.log('🚀 开始构建和上传流程...\n');

    // 步骤1: 执行数据处理
    console.log('📦 步骤1: 执行数据处理...');
    try {
        // 执行 process_craft_data.js
        await new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const processCraft = spawn('node', [path.join(__dirname, 'process_craft_data.js')], {
                stdio: 'inherit',
                cwd: __dirname
            });
            
            processCraft.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`数据处理失败，退出码: ${code}`));
                }
            });
            
            processCraft.on('error', reject);
        });
        console.log('✅ 数据处理完成\n');
    } catch (error) {
        console.error('❌ 数据处理失败:', error.message);
        return false;
    }

    // 步骤2: 检查输出文件
    const outputDir = path.join(__dirname, 'miniprogram_data');
    if (!fs.existsSync(outputDir)) {
        console.error('❌ 输出目录不存在，无法上传');
        return false;
    }

    // 检查关键文件
    const basesFile = path.join(outputDir, 'bases.json');
    if (!fs.existsSync(basesFile)) {
        console.error('❌ bases.json 不存在，可能数据处理失败');
        return false;
    }

    console.log('✅ 输出文件检查通过\n');

    // 步骤3: 上传到 OSS
    console.log('☁️ 步骤3: 上传到 OSS...');
    try {
        // 尝试加载全局配置
        const globalConfigPath = path.resolve(__dirname, '../../../config/oss-config.json');
        let ossConfig = {};
        if (fs.existsSync(globalConfigPath)) {
            ossConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
        }
        
        const ossManager = new OSSManager(ossConfig);
        
        // 确定远程前缀
        // 优先使用 config 中的 folder，否则默认为 'poe2'
        const folder = ossConfig.folder || 'poe2';
        const remotePrefix = `${folder}/miniprogram_data/`;
        
        const successCount = await ossManager.uploadDir(outputDir, remotePrefix, (f) => !f.includes('all_data_full'));
        
        if (successCount > 0) {
            console.log('\n🎉 构建和上传流程完成！');
            console.log(`📊 数据已上传到 OSS prefix: ${remotePrefix}`);
            return true;
        } else {
            console.log('\n⚠️ 上传部分失败或无文件，请检查错误信息');
            return false;
        }
    } catch (error) {
        console.error('❌ OSS 上传失败:', error.message);
        return false;
    }
}

// 如果直接运行此文件
if (require.main === module) {
    buildAndUpload().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(err => {
        console.error('❌ 流程执行失败:', err);
        process.exit(1);
    });
}

module.exports = buildAndUpload;