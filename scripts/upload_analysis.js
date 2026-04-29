/**
 * 上传 ladder_analysis.json 到 OSS
 */

const OSS = require('ali-oss')
const fs = require('fs')
const path = require('path')

const client = new OSS({
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  bucket: process.env.OSS_BUCKET || 'poe2-all-class',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
})

// OSS 路径：poe2-ladders/release/ladder_analysis.json
const envPath = (process.env.OSS_PATH || 'release/').replace(/\/+$/, '')
const ossKey = `poe2-ladders/${envPath}/ladder_analysis.json`
const localPath = path.join(__dirname, '..', 'ladder_analysis.json')

async function upload() {
  if (!fs.existsSync(localPath)) {
    console.error('错误：找不到', localPath)
    process.exit(1)
  }

  console.log('上传到 OSS:', ossKey)
  const result = await client.put(ossKey, localPath)
  console.log('✅ 上传成功:', result.url)
}

upload().catch(err => {
  console.error('❌ 上传失败:', err.message)
  process.exit(1)
})
