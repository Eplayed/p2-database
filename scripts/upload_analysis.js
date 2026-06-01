/**
 * 上传 ladder_analysis.json 到 OSS
 * 读取 translated-data/{env}/ladder_analysis.json
 */

const OSS = require('ali-oss')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../auto_browser/.env') })

const isProd = process.env.NODE_ENV === 'production'
const dataDir = path.join(__dirname, '..', 'translated-data', isProd ? 'release' : 'dev')
const localPath = path.join(dataDir, 'ladder_analysis.json')

const client = new OSS({
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  bucket: process.env.OSS_BUCKET || 'poe2-all-class',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
})

// OSS 路径：poe2-ladders/{env}/ladder_analysis.json
const envPath = (process.env.OSS_PATH || (isProd ? 'release' : 'dev')).replace(/\/+$/, '')
const ossKey = `poe2-ladders/${envPath}/ladder_analysis.json`

async function upload() {
  if (!fs.existsSync(localPath)) {
    console.error('错误：找不到', localPath)
    process.exit(1)
  }

  console.log('  源文件:', localPath)
  console.log('  上传到 OSS:', ossKey)
  const result = await client.put(ossKey, localPath)
  console.log('  ✅ 上传成功:', result.url)
}

if (require.main === module) {
  upload().catch(err => {
    console.error('❌ 上传失败:', err.message)
    process.exit(1)
  })
}

module.exports = { upload }
