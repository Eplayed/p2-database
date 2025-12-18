const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const envConfig = require('./env-config');

// 你的 OSS 配置 (实际使用建议放在环境变量或 gitignore 的文件里)
const OSS_CONFIG = {
    region: 'oss-cn-hongkong',
    bucket: '你的Bucket',
    accessKeyId: '你的AK',
    accessKeySecret: '你的SK'
};

// 简单的 OSS 上传封装 (如果你本地没装 ali-oss，请 npm install ali-oss)
// 这里为了演示，假设你已经安装了
let OSS;
try { OSS = require('ali-oss'); } catch(e) {}

async function uploadFile(client, localPath, remotePath) {
    if (!client) {
        console.log(`[模拟上传] ${localPath} -> ${remotePath}`);
        return;
    }
    try {
        console.log(`[上传中] ${path.basename(localPath)}...`);
        await client.put(remotePath, localPath);
        console.log(`   ✅ 成功: ${remotePath}`);
    } catch (e) {
        console.error(`   ❌ 失败: ${e.message}`);
    }
}

(async () => {
    console.log(`🚀 [OSS上传] 环境: ${envConfig.isProd ? 'Production' : 'Dev'}`);
    
    if (!OSS) {
        console.warn("⚠️ 未检测到 ali-oss 模块，将仅打印路径。请运行 npm install ali-oss");
    }
    const client = OSS ? new OSS(OSS_CONFIG) : null;
    const DATA_DIR = './data';

    // 1. 上传 all_ladders.json (轻量级列表)
    const laddersName = envConfig.getFileName('all_ladders');
    const localLadders = path.join(DATA_DIR, laddersName);
    if (fs.existsSync(localLadders)) {
        // 上传到 ossPath (例如 dev/all_ladders_dev.json)
        await uploadFile(client, localLadders, `${envConfig.ossPath}${laddersName}`);
    }

    // 2. 上传 classes.json
    const classesName = envConfig.getFileName('classes');
    const localClasses = path.join(DATA_DIR, classesName);
    if (fs.existsSync(localClasses)) {
        await uploadFile(client, localClasses, `${envConfig.ossPath}${classesName}`);
    }

    // 3. (高级) 拆分上传每个玩家的详情 JSON
    // 我们读取 full_data，然后把每个玩家拆出来单独存，这样小程序加载才快
    const fullDataName = envConfig.getFileName('all_data_full');
    const localFull = path.join(DATA_DIR, fullDataName);
    
    if (fs.existsSync(localFull)) {
        console.log('📦 正在拆分并上传玩家详情...');
        const fullData = JSON.parse(fs.readFileSync(localFull));
        
        for (const clsName in fullData.ladders) {
            const players = fullData.ladders[clsName];
            for (const p of players) {
                if (p.detail) {
                    // 文件名规则: players/账号_角色名.json
                    // 注意处理特殊字符
                    const safeName = `${p.account}_${p.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                    const pFileName = `${safeName}.json`;
                    const remotePPath = `${envConfig.ossPath}players/${pFileName}`;
                    
                    // 这里直接用 Buffer 上传，不存临时文件了
                    if (client) {
                        await client.put(remotePPath, Buffer.from(JSON.stringify(p.detail)));
                        console.log(`   ✅ 玩家详情: ${p.name}`);
                    } else {
                        console.log(`[模拟] 玩家详情 -> ${remotePPath}`);
                    }
                }
            }
        }
    }

    console.log('🎉 所有上传任务完成！');
})();