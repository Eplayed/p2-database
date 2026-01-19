const fs = require('fs');
const path = require('path');
const envConfig = require('../../../config/env-config');
const OSSManager = require('../../common/oss/OSSManager');

// 获取项目根目录 (p2-database root)
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// 简单的颜色输出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 执行命令
async function runCommand(command, description) {
    log(`🔄 ${description}...`, 'blue');
    
    const { exec } = require('child_process');
    const execOptions = { cwd: __dirname }; // 在当前目录 (src/crawlers/poe2-ladder) 执行
    
    return new Promise((resolve, reject) => {
        const process = exec(command, execOptions, (error, stdout, stderr) => {
            if (error) {
                log(`❌ ${description}失败`, 'red');
                log(stderr, 'red');
                reject(error);
            } else {
                log(`✅ ${description}完成`, 'green');
                resolve(stdout);
            }
        });
        
        process.stdout.on('data', (data) => {
            console.log(data.toString().trim());
        });
    });
}

// 主流程
async function main(forceRefresh = false) {
    log('🚀 PoE2 Ladder 数据获取与上传自动化脚本', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`📁 项目根目录: ${PROJECT_ROOT}`, 'blue');
    
    if (forceRefresh) {
        log('🔄 强制刷新模式：将重新获取所有数据', 'yellow');
    }
    
    try {
        // 1. 检查配置
        log('\n📋 检查环境和配置...', 'blue');
        
        const ossConfigPath = path.join(PROJECT_ROOT, 'config/oss-config.json');
        let ossConfig = {};
        if (fs.existsSync(ossConfigPath)) {
            try {
                ossConfig = JSON.parse(fs.readFileSync(ossConfigPath, 'utf8'));
                log('✅ OSS配置文件已加载', 'green');
            } catch (e) {
                log('❌ OSS配置文件格式错误', 'red');
            }
        } else {
             log('⚠️ 未找到 config/oss-config.json，将尝试使用环境变量', 'yellow');
        }

        // 确保数据目录存在
        if (!fs.existsSync(envConfig.dataDir)) {
            fs.mkdirSync(envConfig.dataDir, { recursive: true });
        }

        // 2. 获取职业列表
        const classListPath = path.join(envConfig.dataDir, envConfig.getFileName('class_list'));
        if (forceRefresh || !fs.existsSync(classListPath)) {
             await runCommand('node index.js', '获取职业列表');
        }

        // 3. 获取梯子数据
        const allDataFullFileName = envConfig.getFileName('all_data_full');
        const fullDataPath = path.join(envConfig.dataDir, allDataFullFileName);

        if (forceRefresh || !fs.existsSync(fullDataPath)) {
             log('📊 使用完整爬虫抓取详细数据...', 'cyan');
             await runCommand('node auto_full_crawler.js', '获取完整数据');
             await convertFullDataToStandard();
        } else {
             log('✅ 数据文件已存在，跳过爬取', 'green');
        }

        // 4. 上传到OSS
        log('\n☁️  开始上传到阿里云OSS...', 'blue');
        const ossManager = new OSSManager(ossConfig);
        await ossManager.uploadDir(envConfig.dataDir, envConfig.ossPath, (f) => !f.includes('all_data_full'));

        log('\n🎉 执行完成！', 'green');

    } catch (error) {
        log('\n❌ 执行过程中发生错误:', 'red');
        log(error.message, 'red');
    }
}

async function convertFullDataToStandard() {
    log('\n🔄 转换完整数据为标准格式...', 'blue');
    try {
        const allDataFullFileName = envConfig.getFileName('all_data_full');
        const fullDataPath = path.join(envConfig.dataDir, allDataFullFileName);
        
        if (fs.existsSync(fullDataPath)) {
            const fullData = JSON.parse(fs.readFileSync(fullDataPath, 'utf8'));
            
            // 转换为标准格式
            const standardLadders = {};
            if (fullData.ladders) {
                Object.entries(fullData.ladders).forEach(([className, players]) => {
                    standardLadders[className] = players.map(player => ({
                        rank: player.rank || 1,
                        name: player.name || '',
                        level: player.info?.level || 1,
                        class: className,
                        account: player.info?.account || '',
                        linkUrl: player.link || ''
                    }));
                });
            }
            
            const standardData = {
                updateTime: fullData.updateTime || new Date().toISOString(),
                totalClasses: Object.keys(standardLadders).length,
                totalPlayers: Object.values(standardLadders).reduce((sum, data) => sum + data.length, 0),
                classes: fullData.classes || [],
                ladders: standardLadders
            };

            const allLaddersFileName = envConfig.getFileName('all_ladders');
            const outputPath = path.join(envConfig.dataDir, allLaddersFileName);
            fs.writeFileSync(outputPath, JSON.stringify(standardData, null, 2));
            log(`✅ 数据转换完成: ${allLaddersFileName}`, 'green');
        }
    } catch (error) {
        log(`❌ 数据转换失败: ${error.message}`, 'red');
    }
}

if (process.argv.includes('-h') || process.argv.includes('--help')) {
    console.log("Usage: node run_full_process.js [--force]");
} else {
    const forceRefresh = process.argv.includes('--force');
    main(forceRefresh).catch(console.error);
}
