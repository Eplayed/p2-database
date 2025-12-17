const fs = require('fs');
const path = require('path');

// 获取项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..');

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

// 检查文件是否存在（支持相对路径）
function checkFile(filePath, description, useCurrentDir = false) {
    let fullPath;
    if (path.isAbsolute(filePath)) {
        fullPath = filePath;
    } else if (useCurrentDir) {
        fullPath = path.join(__dirname, filePath); // 使用当前脚本所在目录
    } else {
        fullPath = path.join(PROJECT_ROOT, filePath); // 使用项目根目录
    }
    
    if (fs.existsSync(fullPath)) {
        log(`✅ ${description}: 存在`, 'green');
        return true;
    } else {
        log(`❌ ${description}: 不存在`, 'red');
        return false;
    }
}

// 检查配置
function checkConfig() {
    const configPath = path.join(PROJECT_ROOT, 'oss-config.json');
    const localConfigPath = 'oss-config.json'; // 检查当前目录
    
    if (!fs.existsSync(configPath) && !fs.existsSync(localConfigPath)) {
        return false;
    }
    
    // 优先使用当前目录的配置，其次使用项目根目录的配置
    const configFile = fs.existsSync(localConfigPath) ? localConfigPath : configPath;
    
    // 使用useCurrentDir=true来检查当前目录的配置文件
    const isLocalConfig = configFile === localConfigPath;
    if (!checkFile(isLocalConfig ? 'oss-config.json' : 'oss-config.json', 'OSS配置文件', isLocalConfig)) {
        return false;
    }
    
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (config.accessKeyId === 'YOUR_ACCESS_KEY_ID' || 
            config.accessKeySecret === 'YOUR_ACCESS_KEY_SECRET') {
            log('⚠️  请在oss-config.json中填写有效的阿里云OSS凭证', 'yellow');
            return false;
        }
        log('✅ OSS配置有效', 'green');
        return true;
    } catch (error) {
        log('❌ OSS配置文件格式错误', 'red');
        return false;
    }
}

// 执行命令（在项目根目录执行）
async function runCommand(command, description, useRoot = true) {
    log(`🔄 ${description}...`, 'blue');
    
    const { exec } = require('child_process');
    const execOptions = useRoot ? { cwd: PROJECT_ROOT } : {};
    
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
        
        // 实时输出日志
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
        // 1. 检查环境和配置
        log('\n📋 检查环境和配置...', 'blue');
        
        if (!checkFile('../package.json', '项目配置')) {
            log('❌ 请确保在正确的项目目录中执行此脚本', 'red');
            log(`   当前检测的项目根目录: ${PROJECT_ROOT}`, 'red');
            return;
        }
        
        if (forceRefresh || (!checkFile('../auto_browser/class_list.json', '职业列表文件') && !checkFile('../ladder/data/classes.json', 'ladder职业列表文件'))) {
            if (forceRefresh) {
                log('🔄 强制刷新：重新获取职业列表...', 'yellow');
            } else {
                log('⚠️  未找到职业列表，将尝试获取...', 'yellow');
            }
            await runCommand('node index.js', '获取职业列表', false);
        }
        
        if (!checkConfig()) {
            log('\n💡 请先配置阿里云OSS凭证后重新运行', 'yellow');
            log(`   编辑 ${path.join(PROJECT_ROOT, 'oss-config.json')} 文件，填入正确的凭证信息`, 'yellow');
            return;
        }
        
        // 检查是否已有数据文件（使用当前目录检查）
        const hasClassList = checkFile('class_list.json', '当前目录的职业列表', true);
        const hasAllLadders = checkFile('all_ladders.json', '当前目录的梯子数据', true);
        
        // 2. 获取梯子数据
        log('\n🔍 开始获取梯子数据...', 'blue');
        
        const hasAutoLadder = checkFile('auto_ladder.js', '自动梯子脚本', true);
        const hasFullCrawler = checkFile('auto_full_crawler.js', '完整爬虫脚本', true);
        
        if (forceRefresh) {
            log('🔄 强制刷新：重新获取梯子数据...', 'yellow');
        }
        
        // 决定使用哪种抓取方式
        if (hasFullCrawler && (forceRefresh || !checkFile('data/all_data_full.json', '完整数据文件', true))) {
            // 使用完整爬虫（抓取每个玩家的详细信息）
            log('📊 使用完整爬虫抓取详细数据（装备/技能/天赋图）...', 'cyan');
            await runCommand('node auto_full_crawler.js', '获取所有职业完整数据（auto_full_crawler.js）', false);
            
            // 将完整数据转换为标准格式
            await convertFullDataToStandard();
            
        } else if (hasAutoLadder && (forceRefresh || !checkFile('../all_ladders.json', '项目根目录的合并数据文件'))) {
            // 使用快速爬虫（只抓取Top 20玩家）
            log('📋 使用快速爬虫抓取Top 20数据...', 'cyan');
            await runCommand('node auto_ladder.js', '获取所有职业梯子数据（auto_ladder.js）', false);
            
        } else if (!hasAutoLadder) {
            await runCommand('node get_all_ladders.js', '获取所有职业梯子数据（get_all_ladders.js）');
        } else if (!forceRefresh) {
            log('✅ 梯子数据文件已存在，跳过获取', 'green');
        }
        
        // 检查是否成功生成all_ladders.json
        const hasLadderData = checkFile('../all_ladders.json', '项目根目录的合并数据文件') || 
                             checkFile('all_ladders.json', 'auto_browser目录的合并数据文件', true) ||
                             checkFile('data/all_data_full.json', '完整数据文件', true);
        
        if (!hasLadderData) {
            log('❌ 数据获取失败，请检查错误信息', 'red');
            return;
        }
        
        log('✅ 所有核心文件检查通过', 'green');
        
        // 3. 上传到OSS
        log('\n☁️  开始上传到阿里云OSS...', 'blue');
        await runCommand('node upload_to_oss.js', '上传数据到OSS', false);
        
        // 4. 生成报告
        log('\n📊 生成执行报告...', 'blue');
        const report = generateReport();
        
        log('\n🎉 执行完成！', 'green');
        log('='.repeat(60), 'green');
        
    } catch (error) {
        log('\n❌ 执行过程中发生错误:', 'red');
        log(error.message, 'red');
        log('\n💡 请检查错误信息并重试', 'yellow');
    }
}

// 将完整数据转换为标准格式
async function convertFullDataToStandard() {
    log('\n🔄 转换完整数据为标准格式...', 'blue');
    
    try {
        const fullDataPath = path.join(__dirname, 'data', 'all_data_full.json');
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
            
            // 生成标准格式的all_ladders.json
            const standardData = {
                updateTime: fullData.updateTime || new Date().toISOString(),
                totalClasses: Object.keys(standardLadders).length,
                totalPlayers: Object.values(standardLadders).reduce((sum, data) => sum + data.length, 0),
                classes: fullData.classes || [],
                ladders: standardLadders
            };
            
            const outputPath = path.join(__dirname, 'all_ladders.json');
            fs.writeFileSync(outputPath, JSON.stringify(standardData, null, 2));
            
            log(`✅ 数据转换完成: ${Object.keys(standardLadders).length} 个职业`, 'green');
            log(`   输出文件: all_ladders.json`, 'cyan');
            
        } else {
            log('❌ 未找到完整数据文件', 'red');
        }
        
    } catch (error) {
        log(`❌ 数据转换失败: ${error.message}`, 'red');
    }
}

// 生成执行报告
function generateReport() {
    const timestamp = new Date().toISOString();
    
    let report = {
        executionTime: timestamp,
        projectRoot: PROJECT_ROOT,
        files: {},
        summary: {
            success: true,
            totalFiles: 0,
            totalSize: 0
        }
    };
    
    // 检查各个文件
    const filesToCheck = [
        { path: 'all_ladders.json', desc: '项目根目录的合并数据文件' },
        { path: 'auto_browser/all_ladders.json', desc: 'auto_browser目录的合并数据文件' },
        { path: 'auto_browser/data/all_data_full.json', desc: '完整数据文件' },
        { path: 'auto_browser/data/classes.json', desc: '爬虫职业列表' },
        { path: 'ladder/data/classes.json', desc: 'ladder职业列表' },
        { path: 'auto_browser/class_list.json', desc: 'auto_browser职业列表' },
        { path: 'auto_browser/oss-config.json', desc: 'OSS配置' }
    ];
    
    filesToCheck.forEach(file => {
        // 特殊处理auto_browser目录下的文件
        const isAutoBrowserFile = file.path.startsWith('auto_browser/');
        const fullPath = isAutoBrowserFile ? 
            path.join(__dirname, file.path.replace('auto_browser/', '')) : // 使用当前目录
            path.join(PROJECT_ROOT, file.path); // 使用项目根目录
            
        if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            report.files[file.desc] = {
                exists: true,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                path: file.path
            };
            report.summary.totalFiles++;
            report.summary.totalSize += stats.size;
        } else {
            report.files[file.desc] = { exists: false };
            // 只有核心文件缺失才标记为失败
            if ((file.desc.includes('合并数据文件') && !file.desc.includes('完整数据文件')) || file.desc.includes('OSS配置')) {
                report.summary.success = false;
            }
        }
    });
    
    // 保存报告（在项目根目录）
    const reportFile = path.join(PROJECT_ROOT, `execution_report_${timestamp.slice(0, 10)}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    log(`📝 执行报告已保存: execution_report_${timestamp.slice(0, 10)}.json`, 'cyan');
    
    // 打印摘要
    log('\n📋 执行摘要:', 'cyan');
    log(`   执行时间: ${timestamp}`, 'cyan');
    log(`   成功状态: ${report.summary.success ? '✅' : '❌'}`, 'cyan');
    log(`   文件数量: ${report.summary.totalFiles}`, 'cyan');
    log(`   总大小: ${formatFileSize(report.summary.totalSize)}`, 'cyan');
    
    return report;
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 帮助信息
function showHelp() {
    log('📖 使用说明:', 'cyan');
    log('   node run_full_process.js           - 执行完整流程（增量更新）', 'white');
    log('   node run_full_process.js --force   - 强制刷新所有数据', 'white');
    log('   node run_full_process.js -h        - 显示帮助信息', 'white');
    log('\n🔧 完整流程包括:', 'cyan');
    log('   1. 检查环境配置', 'white');
    log('   2. 获取职业列表', 'white');
    log('   3. 获取梯子数据', 'white');
    log('      - 完整爬虫: 装备/技能/天赋图 + 详细信息', 'white');
    log('      - 快速爬虫: Top 20玩家基本信息', 'white');
    log('   4. 数据格式转换', 'white');
    log('   5. 上传到阿里云OSS', 'white');
    log('   6. 生成执行报告', 'white');
    log('\n📁 注意: 此脚本可在任何子目录中运行', 'yellow');
    log('   会自动检测项目根目录并在其中执行操作', 'yellow');
    log('\n📂 文件检测逻辑:', 'cyan');
    log('   - 优先使用 auto_browser/ 目录中的现有数据', 'white');
    log('   - 自动检测 class_list.json 和 all_ladders.json', 'white');
    log('   - 支持完整爬虫(详细数据)和快速爬虫(Top 20)', 'white');
    log('   - 完整爬虫: 装备/技能/天赋图Base64数据', 'white');
    log('   - 快速爬虫: 玩家基本信息', 'white');
    log('   - 支持强制刷新模式重新获取所有数据', 'white');
}

// 检查命令行参数
if (process.argv.includes('-h') || process.argv.includes('--help')) {
    showHelp();
} else {
    const forceRefresh = process.argv.includes('--force');
    main(forceRefresh).catch(console.error);
}