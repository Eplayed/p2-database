const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');

// 从环境变量读取配置 (更安全)
const OSS_CONFIG = {
    region: process.env.OSS_REGION,             // 如 oss-cn-hongkong
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET
};

// 递归扫描文件
function getAllFiles(dirPath, arrayOfFiles) {
    if (!fs.existsSync(dirPath)) return [];
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

// 导出上传函数
// sourceDir: 爬虫生成的数据目录 (例如 /tmp/translated-data)
// targetPrefix: OSS 上的目标文件夹前缀 (例如 dev/ 或 release/)
module.exports = async function uploadToOss(sourceDir, targetPrefix = '') {
    console.log(`🚀 [OSS] 开始上传... 源: ${sourceDir} -> 目标: ${targetPrefix}`);
    
    if (!process.env.OSS_ACCESS_KEY_ID) {
        console.error("❌ [OSS] 缺少环境变量配置，跳过上传");
        return;
    }

    const client = new OSS(OSS_CONFIG);
    const files = getAllFiles(sourceDir);
    
    console.log(`   待上传文件数: ${files.length}`);
    let success = 0;

    for (const localPath of files) {
        // 计算相对路径： /tmp/translated-data/players/abc.json -> players/abc.json
        const relativePath = path.relative(sourceDir, localPath).split(path.sep).join('/');
        const remotePath = path.posix.join(targetPrefix, relativePath); // 组合 OSS 路径

        try {
            await client.put(remotePath, localPath);
            success++;
            // console.log(`   ✅ 上传: ${remotePath}`);
        } catch (e) {
            console.error(`   ❌ 失败: ${remotePath}`, e.message);
        }
    }
    console.log(`📊 [OSS] 上传完成: ${success}/${files.length}`);
};