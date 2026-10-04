const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const envConfig = require('./env-config');

// 已下架功能的历史产物（新闻流 2026-07-07 下架、0.5 资料 2026-07-06 下架）：
// 本地目录保留用于复盘，但不再每天跟着全量重传；小程序与看板都没有读它们的地方。
const SKIP_UPLOAD_DIRS = ['news_detail', 'patch-0.5', 'economy-history'];
// 怀疑 OSS 侧缺文件或被清空时，用 OSS_FORCE_FULL_UPLOAD=1 回到全量重传。
const FORCE_FULL_UPLOAD = process.env.OSS_FORCE_FULL_UPLOAD === '1';
// 只看会传哪些、传多少，不真的写 OSS。
const DRY_RUN = process.env.OSS_UPLOAD_DRY_RUN === '1';

const OSS_CONFIG = {
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET
};

function isSkippedDir(relativePath) {
    return SKIP_UPLOAD_DIRS.some(dir => relativePath === dir || relativePath.startsWith(`${dir}/`));
}

function localContentMd5(localPath) {
    return crypto.createHash('md5').update(fs.readFileSync(localPath)).digest('hex').toUpperCase();
}

// 单文件 PUT 的 ETag 就是内容 MD5，两边前缀都对上就说明远端已是这份内容，不必重传
async function remoteEtag(client, key) {
    try {
        const res = await client.head(key);
        const headers = (res && res.res && res.res.headers) || {};
        return String(headers.etag || '').replace(/"/g, '').toUpperCase();
    } catch (e) {
        return '';
    }
}

function getAllFiles(dirPath, arrayOfFiles) {
    if (!fs.existsSync(dirPath)) return [];
    let files = [];
    try {
        files = fs.readdirSync(dirPath);
    } catch (error) {
        if (error && error.code === 'ENOENT') return arrayOfFiles || [];
        throw error;
    }
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function(file) {
        if (file === '.DS_Store') return;
        const fullPath = path.join(dirPath, file);
        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (error) {
            if (error && error.code === 'ENOENT') return;
            throw error;
        }
        if (stat.isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

function getJsonCacheControl(relativePath) {
  if (relativePath.endsWith('miniprogram_data/economy_digest.json')) return 'max-age=300';
  if (relativePath.endsWith('miniprogram_data/international_market_catalog.json')) return 'max-age=300';
    if (relativePath.endsWith('miniprogram_data/cn_market_digest.json')) return 'max-age=60';
    if (relativePath.endsWith('miniprogram_data/daily_return_digest.json')) return 'max-age=300';
    if (relativePath.endsWith('miniprogram_data/follow_updates.json')) return 'max-age=300';
    if (relativePath.endsWith('miniprogram_data/ladder_build_index.json')) return 'max-age=300';
    if (relativePath.includes('miniprogram_data/ladder_build_details/')) return 'max-age=3600';
    if (relativePath.endsWith('miniprogram_data/problem_guides_manifest.json')) return 'max-age=300';
    if (relativePath.endsWith('miniprogram_data/problem_guides.json')) return 'max-age=43200';
    if (relativePath.endsWith('patch-0.5/version.json')) return 'max-age=300';
    if (relativePath.includes('patch-0.5/patch05_economy')) return 'max-age=300';
    if (relativePath.endsWith('patch-0.5/patch05_catalog.json')) return 'max-age=3600';
    return 'max-age=60';
}

function isMissingLocalFileError(error) {
    if (!error) return false;
    const message = String(error.message || '');
    return error.code === 'ENOENT' || message.includes('ENOENT') || message.includes('no such file or directory');
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
    const filesToUpload = allFiles.filter(f => {
        const relativePath = path.relative(DATA_DIR, f).split(path.sep).join('/');
        if (isSkippedDir(relativePath)) return false;
        return !relativePath.includes('all_data_full')
            && !relativePath.endsWith('economy_raw.json')
            && !relativePath.endsWith('cn_market_raw.json');
    });
    const skippedByDir = allFiles.length - filesToUpload.length;

    console.log(`   待检查: ${filesToUpload.length} 个文件（已排除历史下架目录 ${skippedByDir} 个）`);
    if (FORCE_FULL_UPLOAD) console.log('   模式: 全量重传（OSS_FORCE_FULL_UPLOAD=1）');
    if (DRY_RUN) console.log('   模式: 试运行，不会真的写入 OSS');

    let successCount = 0;
    let unchangedCount = 0;
    let failCount = 0;
    for (const localPath of filesToUpload) {
        const relativePath = path.relative(DATA_DIR, localPath).split(path.sep).join('/');
        const remotePath = `${envConfig.ossPath}${relativePath}`;
        const canonicalRemotePath = `poe2/${envConfig.isProd ? 'release' : 'dev'}/${relativePath}`;
        const ext = path.extname(localPath).toLowerCase();

        if (!fs.existsSync(localPath)) {
            console.warn(`   ⚠️  跳过已缺失文件: ${relativePath}`);
            continue;
        }

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

        if (!FORCE_FULL_UPLOAD) {
            let md5 = '';
            try {
                md5 = localContentMd5(localPath);
            } catch (e) {
                md5 = '';
            }
            if (md5) {
                const legacyEtag = await remoteEtag(client, remotePath);
                if (legacyEtag === md5 && (await remoteEtag(client, canonicalRemotePath)) === md5) {
                    unchangedCount += 1;
                    continue;
                }
            }
        }

        if (DRY_RUN) {
            successCount += 1;
            continue;
        }

        try {
            await client.put(remotePath, localPath, options);
            await client.put(canonicalRemotePath, localPath, options);
            successCount++;
        } catch (e) {
            if (isMissingLocalFileError(e)) {
                console.warn(`   ⚠️  跳过已变更/缺失文件: ${relativePath}`);
                continue;
            }
            failCount += 1;
            console.error(`   ❌ 失败: ${relativePath}`, e.message);
        }
    }

    // 小程序首页和市场页仍读取历史兼容路径，生产上传时保持同步。
    const economyPath = path.join(DATA_DIR, 'economy.json');
    if (envConfig.isProd && !DRY_RUN && fs.existsSync(economyPath)) {
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
    if (envConfig.isProd && !DRY_RUN && fs.existsSync(economyDigestPath)) {
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

    const cnMarketDigestPath = path.join(DATA_DIR, 'miniprogram_data/cn_market_digest.json');
    if (envConfig.isProd && !DRY_RUN && fs.existsSync(cnMarketDigestPath)) {
        try {
            await client.put('poe2-economy/cn_market_digest.json', cnMarketDigestPath, {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'max-age=60',
                },
            });
            console.log('   ✅ 已同步兼容路径: poe2-economy/cn_market_digest.json');
        } catch (e) {
            console.error('   ❌ 兼容路径同步失败: poe2-economy/cn_market_digest.json', e.message);
        }
    }

    if (!DRY_RUN) console.log(`   ✅ 已同步新命名空间: poe2/${envConfig.isProd ? 'release' : 'dev'}/`);
    console.log(`📊 ${DRY_RUN ? '试运行完成' : '上传完成'}: 需传 ${successCount} · 内容未变跳过 ${unchangedCount} · 失败 ${failCount} / 共 ${filesToUpload.length}`);
};
