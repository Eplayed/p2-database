const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '../auto_browser/.env') });

// 与 POE2 上传保持一致：默认跳过"远端已经是这份内容"的文件（天赋树截图、剧情图一年都不变），
// 需要回到全量重传时用 OSS_FORCE_FULL_UPLOAD=1；OSS_UPLOAD_DRY_RUN=1 只统计不写。
const FORCE_FULL_UPLOAD = process.env.OSS_FORCE_FULL_UPLOAD === '1';
const DRY_RUN = process.env.OSS_UPLOAD_DRY_RUN === '1';

function localContentMd5(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

// 单文件 PUT 的 ETag 就是内容 MD5，两套前缀都对上才算真的不用传
async function remoteEtag(client, key) {
  try {
    const res = await client.head(key);
    const headers = (res && res.res && res.res.headers) || {};
    return String(headers.etag || '').replace(/"/g, '').toUpperCase();
  } catch (error) {
    return '';
  }
}

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const dataDir = path.join(__dirname, '../translated-data/poe1', env);
const prefix = `poe1-season/${env}/`;
const canonicalPrefix = `poe1/${env}/`;

const CONTENT_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

// 截图索引是本地跑批用的中间文件（记录"哪个角色的哪棵树拍过"），小程序不读，不发布
const SKIP_UPLOAD_FILES = ['miniprogram_data/passive-trees/index.json'];

function collectUploadFiles(dirPath, baseDir = dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).flatMap((name) => {
    if (name === '.DS_Store') return [];
    if (SKIP_UPLOAD_FILES.includes(path.relative(baseDir, path.join(dirPath, name)).split(path.sep).join('/'))) return [];
    const filePath = path.join(dirPath, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return collectUploadFiles(filePath, baseDir);
    const ext = path.extname(name).toLowerCase();
    if (!CONTENT_TYPES[ext]) return [];
    return [{
      filePath,
      relativePath: path.relative(baseDir, filePath).split(path.sep).join('/'),
      ext
    }];
  });
}

async function uploadPoe1Data() {
  if (!fs.existsSync(dataDir)) throw new Error(`数据目录不存在: ${dataDir}`);
  const client = new OSS({
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET
  });
  const miniprogramDir = path.join(dataDir, 'miniprogram_data');
  const files = collectUploadFiles(miniprogramDir);
  if (!files.length) throw new Error('没有可上传的 POE1 小程序数据');
  let uploaded = 0;
  let unchanged = 0;
  for (const file of files) {
    const remoteKey = `${prefix}miniprogram_data/${file.relativePath}`;
    const canonicalKey = `${canonicalPrefix}miniprogram_data/${file.relativePath}`;
    if (!FORCE_FULL_UPLOAD) {
      const md5 = localContentMd5(file.filePath);
      if (md5 && (await remoteEtag(client, remoteKey)) === md5 && (await remoteEtag(client, canonicalKey)) === md5) {
        unchanged += 1;
        continue;
      }
    }
    if (DRY_RUN) {
      uploaded += 1;
      continue;
    }
    const isJson = file.ext === '.json';
    const options = {
      headers: {
        'Content-Type': CONTENT_TYPES[file.ext],
        'Cache-Control': isJson && ['economy_digest.json', 'cn_economy_digest.json'].includes(file.relativePath)
          ? 'max-age=300'
          : 'max-age=900'
      }
    };
    await client.put(remoteKey, file.filePath, options);
    await client.put(canonicalKey, file.filePath, options);
    console.log(`   ✅ ${remoteKey}`);
    uploaded += 1;
  }
  if (!DRY_RUN) console.log(`   ✅ 已同步新命名空间: ${canonicalPrefix}`);
  console.log(`📊 POE1 ${DRY_RUN ? '试运行' : 'OSS 上传'}: 需传 ${uploaded} · 内容未变跳过 ${unchanged} / 共 ${files.length}`);
}

if (require.main === module) {
  uploadPoe1Data().catch((error) => {
    console.error('❌ POE1 OSS 上传失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { uploadPoe1Data };
