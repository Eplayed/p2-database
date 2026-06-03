const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const envConfig = require('./env-config');

const OSS_CONFIG = {
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET
};

function getAllFiles(dirPath, arrayOfFiles) {
    if (!fs.existsSync(dirPath)) return [];
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function(file) {
        if (file === '.DS_Store') return;
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

function getJsonCacheControl(relativePath) {
    if (relativePath.endsWith('miniprogram_data/economy_digest.json')) return 'max-age=300';
    if (relativePath.endsWith('patch-0.5/version.json')) return 'max-age=300';
    if (relativePath.includes('patch-0.5/patch05_economy')) return 'max-age=300';
    if (relativePath.endsWith('patch-0.5/patch05_catalog.json')) return 'max-age=3600';
    return 'max-age=60';
}

module.exports = async function uploadAll() {
    console.log(`\n🚀 [OSS上传] 环境: ${envConfig.isProd ? 'production' : 'dev'}`);
    console.log(`   本地目录: ${envConfig.dataDir}`);
    console.log(`   OSS 路径: ${envConfig.ossPath}`);

    let client;
    try {
        client = new OSS(OSS_CONFIG);
    } catch (e) {
        console.error('❌ OSS 初始化失败:', e.message);
        return;
    }

    const DATA_DIR = envConfig.dataDir;
    if (!fs.existsSync(DATA_DIR)) {
        console.error('❌ 数据目录不存在，跳过上传');
        return;
    }

    const allFiles = getAllFiles(DATA_DIR);
    const filesToUpload = allFiles.filter(f => !f.includes('all_data_full') && !f.endsWith('economy_raw.json'));

    console.log(`   待上传: ${filesToUpload.length} 个文件`);

    let successCount = 0;
    for (const localPath of filesToUpload) {
        const relativePath = path.relative(DATA_DIR, localPath).split(path.sep).join('/');
        const remotePath = `${envConfig.ossPath}${relativePath}`;
        const ext = path.extname(localPath).toLowerCase();

        const options = {};

        // JSON 文件：设置缓存和 Content-Type
        if (ext === '.json') {
            options.headers = {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': getJsonCacheControl(relativePath),
            };
        }
        // JPG 文件（天赋树截图）
        else if (ext === '.jpg' || ext === '.jpeg') {
            options.headers = {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'max-age=86400',
            };
        }
        // WEBP 文件
        else if (ext === '.webp') {
            options.headers = {
                'Content-Type': 'image/webp',
                'Cache-Control': 'max-age=86400',
            };
        }
        else if (ext === '.png') {
            options.headers = {
                'Content-Type': 'image/png',
                'Cache-Control': 'max-age=86400',
            };
        }

        try {
            await client.put(remotePath, localPath, options);
            successCount++;
        } catch (e) {
            console.error(`   ❌ 失败: ${relativePath}`, e.message);
        }
    }

    // 小程序首页和市场页仍读取历史兼容路径，生产上传时保持同步。
    const economyPath = path.join(DATA_DIR, 'economy.json');
    if (envConfig.isProd && fs.existsSync(economyPath)) {
        try {
            await client.put('poe2-economy/economy.json', economyPath, {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'max-age=60',
                },
            });
            console.log('   ✅ 已同步兼容路径: poe2-economy/economy.json');
        } catch (e) {
            console.error('   ❌ 兼容路径同步失败: poe2-economy/economy.json', e.message);
        }
    }

    const economyDigestPath = path.join(DATA_DIR, 'miniprogram_data/economy_digest.json');
    if (envConfig.isProd && fs.existsSync(economyDigestPath)) {
        try {
            await client.put('poe2-economy/economy_digest.json', economyDigestPath, {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'max-age=300',
                },
            });
            console.log('   ✅ 已同步兼容路径: poe2-economy/economy_digest.json');
        } catch (e) {
            console.error('   ❌ 兼容路径同步失败: poe2-economy/economy_digest.json', e.message);
        }
    }

    console.log(`📊 上传完成: ${successCount}/${filesToUpload.length}`);
};
