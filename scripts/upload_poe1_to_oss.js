const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '../auto_browser/.env') });

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const dataDir = path.join(__dirname, '../translated-data/poe1', env);
const prefix = `poe1-season/${env}/`;

async function uploadPoe1Data() {
  if (!fs.existsSync(dataDir)) throw new Error(`数据目录不存在: ${dataDir}`);
  const client = new OSS({
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET
  });
  const files = fs.readdirSync(path.join(dataDir, 'miniprogram_data'))
    .filter((file) => file.endsWith('.json'));
  if (!files.length) throw new Error('没有可上传的 POE1 小程序数据');
  for (const file of files) {
    const localPath = path.join(dataDir, 'miniprogram_data', file);
    await client.put(`${prefix}miniprogram_data/${file}`, localPath, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': file === 'economy_digest.json' ? 'max-age=300' : 'max-age=900'
      }
    });
    console.log(`   ✅ ${prefix}miniprogram_data/${file}`);
  }
  console.log(`📊 POE1 OSS 上传完成: ${files.length} 个文件`);
}

if (require.main === module) {
  uploadPoe1Data().catch((error) => {
    console.error('❌ POE1 OSS 上传失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { uploadPoe1Data };
