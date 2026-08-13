const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '../auto_browser/.env') });

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

function collectUploadFiles(dirPath, baseDir = dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).flatMap((name) => {
    if (name === '.DS_Store') return [];
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
  for (const file of files) {
    const isJson = file.ext === '.json';
    const options = {
      headers: {
        'Content-Type': CONTENT_TYPES[file.ext],
        'Cache-Control': isJson && ['economy_digest.json', 'cn_economy_digest.json'].includes(file.relativePath)
          ? 'max-age=300'
          : 'max-age=900'
      }
    };
    await client.put(`${prefix}miniprogram_data/${file.relativePath}`, file.filePath, options);
    await client.put(`${canonicalPrefix}miniprogram_data/${file.relativePath}`, file.filePath, options);
    console.log(`   ✅ ${prefix}miniprogram_data/${file.relativePath}`);
  }
  console.log(`   ✅ 已同步新命名空间: ${canonicalPrefix}`);
  console.log(`📊 POE1 OSS 上传完成: ${files.length} 个文件`);
}

if (require.main === module) {
  uploadPoe1Data().catch((error) => {
    console.error('❌ POE1 OSS 上传失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { uploadPoe1Data };
