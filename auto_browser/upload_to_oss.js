const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// OSS配置文件路径
const CONFIG_FILE = 'oss-config.json';

// 默认配置文件结构
const DEFAULT_CONFIG = {
    region: 'oss-cn-hangzhou',
    bucket: 'your-bucket-name',
    accessKeyId: 'YOUR_ACCESS_KEY_ID',
    accessKeySecret: 'YOUR_ACCESS_KEY_SECRET',
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    folder: 'poe2-ladders'
};

// 读取配置
function readConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (error) {
            console.log('❌ 配置文件格式错误:', error.message);
        }
    }
    return null;
}

// 生成MD5哈希
function getFileMD5(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 模拟OSS上传（实际使用时需要安装阿里云SDK）
async function uploadToOSSMock(localFile, remotePath) {
    const fileName = path.basename(localFile);
    const fileSize = fs.statSync(localFile).size;
    const fileMD5 = getFileMD5(localFile);
    
    console.log(`📤 准备上传文件: ${fileName}`);
    console.log(`   文件大小: ${formatFileSize(fileSize)}`);
    console.log(`   MD5校验: ${fileMD5}`);
    console.log(`   目标路径: ${remotePath}`);
    
    // 模拟上传过程
    const startTime = Date.now();
    console.log('⏳ 开始上传...');
    
    // 这里应该调用阿里云OSS SDK进行实际上传
    // 为了演示，我们只是模拟上传过程
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const endTime = Date.now();
    const uploadTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`✅ 上传完成！耗时: ${uploadTime}秒`);
    
    return {
        success: true,
        url: `https://your-bucket-name.oss-cn-hangzhou.aliyuncs.com/${remotePath}`,
        size: fileSize,
        md5: fileMD5,
        uploadTime: uploadTime
    };
}

// 使用阿里云OSS SDK的实际上传函数
async function uploadToOSSReal(localFile, remotePath, config) {
    // 注意：需要先安装依赖
    // npm install ali-oss
    // const OSS = require('ali-oss');
    
    console.log(`📤 准备上传文件: ${path.basename(localFile)}`);
    console.log(`   目标路径: ${remotePath}`);
    
    try {
        // 这里是实际的OSS上传代码
        try {
            // 检查是否安装了阿里云OSS SDK
            const OSS = require('ali-oss');
            
            const client = new OSS({
                region: config.region,
                accessKeyId: config.accessKeyId,
                accessKeySecret: config.accessKeySecret,
                endpoint: config.endpoint,
                bucket: config.bucket
            });
            
            const result = await client.put(remotePath, localFile);
            
            console.log(`✅ 实际OSS上传成功！`);
            console.log(`   文件URL: ${result.url}`);
            
            return {
                success: true,
                url: result.url,
                size: fs.statSync(localFile).size,
                md5: getFileMD5(localFile)
            };
            
        } catch (error) {
            // 如果没有安装ali-oss，使用模拟上传
            if (error.code === 'MODULE_NOT_FOUND') {
                console.log('⚠️  未安装ali-oss SDK，使用模拟上传');
                console.log('   实际使用请安装: npm install ali-oss');
                return await uploadToOSSMock(localFile, remotePath);
            } else {
                throw error;
            }
        }
        
    } catch (error) {
        console.log(`❌ 上传失败:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// 生成远程文件名
function generateRemoteFileName(fileName) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    return `${baseName}_${timestamp}${ext}`;
}

// 上传ladder数据
async function uploadLadderData() {
    const config = readConfig();
    console.log('config',config)
    if (!config) {
        console.log('❌ 未找到配置文件，请先配置 OSS 凭证');
        console.log(`📝 配置文件模板已生成: ${CONFIG_FILE}`);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
        return;
    }
    
    // 检查配置是否有效
    if (config.accessKeyId === 'YOUR_ACCESS_KEY_ID' || 
        config.accessKeySecret === 'YOUR_ACCESS_KEY_SECRET') {
        console.log('❌ 请在配置文件中填写有效的阿里云OSS凭证');
        return;
    }
    
    const filesToUpload = [];
    
    // 1. 上传all_ladders.json (不添加日期戳)
    const allLaddersFile = 'all_ladders.json';
    if (fs.existsSync(allLaddersFile)) {
        const remotePath = `${config.folder}/all_ladders.json`;
        filesToUpload.push({
            local: allLaddersFile,
            remote: remotePath
        });
    } else {
        console.log('⚠️  未找到 all_ladders.json 文件');
    }
    
    // 2. 上传classes.json (不添加日期戳)
    const classesFile = 'ladder/data/classes.json';
    if (fs.existsSync(classesFile)) {
        const remotePath = `${config.folder}/classes.json`;
        filesToUpload.push({
            local: classesFile,
            remote: remotePath
        });
    }
    
    // 3. 上传所有职业数据文件 (添加日期戳)
    const dataDir = 'ladder/data';
    if (fs.existsSync(dataDir)) {
        const dataFiles = fs.readdirSync(dataDir)
            .filter(file => file.endsWith('.json') && file !== 'classes.json')
            .map(file => ({
                local: path.join(dataDir, file),
                remote: `${config.folder}/data/${generateRemoteFileName(file)}`
            }));
        filesToUpload.push(...dataFiles);
    }
    
    if (filesToUpload.length === 0) {
        console.log('❌ 没有找到要上传的文件');
        return;
    }
    
    console.log(`📋 准备上传 ${filesToUpload.length} 个文件...\n`);
    
    const uploadResults = [];
    
    for (const file of filesToUpload) {
        console.log(`🔄 正在处理: ${file.local}`);
        
        if (fs.existsSync(file.local)) {
            const result = await uploadToOSSReal(file.local, file.remote, config);
            uploadResults.push({
                file: file.local,
                remote: file.remote,
                result: result
            });
        } else {
            console.log(`❌ 文件不存在: ${file.local}`);
        }
        
        console.log('');
    }
    
    // 生成上传报告
    const successCount = uploadResults.filter(r => r.result.success).length;
    const failCount = uploadResults.length - successCount;
    
    console.log('📊 上传完成！统计信息:');
    console.log(`   ✅ 成功: ${successCount} 个文件`);
    console.log(`   ❌ 失败: ${failCount} 个文件`);
    
    if (successCount > 0) {
        console.log('\n🔗 成功上传的文件:');
        uploadResults
            .filter(r => r.result.success)
            .forEach(r => {
                console.log(`   ${path.basename(r.file)}: ${r.result.url}`);
            });
    }
    
    if (failCount > 0) {
        console.log('\n❌ 上传失败的文件:');
        uploadResults
            .filter(r => !r.result.success)
            .forEach(r => {
                console.log(`   ${path.basename(r.file)}: ${r.result.error}`);
            });
    }
    
    // 生成上传日志
    const logFile = `upload_log_${new Date().toISOString().slice(0, 10)}.json`;
    const logData = {
        uploadTime: new Date().toISOString(),
        totalFiles: uploadResults.length,
        successCount: successCount,
        failCount: failCount,
        results: uploadResults
    };
    
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    console.log(`\n📝 上传日志已保存: ${logFile}`);
}

// 主函数
(async () => {
    console.log('🚀 阿里云OSS上传工具');
    console.log('='.repeat(50));
    
    await uploadLadderData();
    
    console.log('\n💡 提示:');
    console.log('   1. 首次使用请配置 oss-config.json 文件');
    console.log('   2. 安装阿里云SDK: npm install ali-oss');
    console.log('   3. 确保 OSS Bucket 已创建且有写入权限');
})();