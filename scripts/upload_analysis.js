/**
 * 上传天梯分析与技能/装备查BD索引到 OSS
 */

const OSS = require('ali-oss')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../auto_browser/.env') })

const isProd = process.env.NODE_ENV === 'production'
const dataDir = path.join(__dirname, '..', 'translated-data', isProd ? 'release' : 'dev')

const client = new OSS({
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  bucket: process.env.OSS_BUCKET || 'poe2-all-class',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
})

const envPath = (process.env.OSS_PATH || (isProd ? 'release' : 'dev')).replace(/\/+$/, '')
const files = [
  {
    localPath: path.join(dataDir, 'ladder_analysis.json'),
    ossKey: `poe2-ladders/${envPath}/ladder_analysis.json`
  },
  {
    localPath: path.join(dataDir, 'miniprogram_data', 'ladder_build_index.json'),
    ossKey: `poe2-ladders/${envPath}/miniprogram_data/ladder_build_index.json`
  }
]

const buildDetailDir = path.join(dataDir, 'miniprogram_data', 'ladder_build_details')
if (fs.existsSync(buildDetailDir)) {
  for (const name of fs.readdirSync(buildDetailDir).filter(name => name.endsWith('.json'))) {
    files.push({
      localPath: path.join(buildDetailDir, name),
      ossKey: `poe2-ladders/${envPath}/miniprogram_data/ladder_build_details/${name}`
    })
  }
}

async function upload() {
  for (const file of files) {
    if (!fs.existsSync(file.localPath)) throw new Error(`找不到 ${file.localPath}`)
    console.log('  源文件:', file.localPath)
    console.log('  上传到 OSS:', file.ossKey)
    const result = await client.put(file.ossKey, file.localPath, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': file.ossKey.includes('/ladder_build_details/') ? 'max-age=3600' : 'max-age=300'
      }
    })
    console.log('  ✅ 上传成功:', result.url)
  }
}

if (require.main === module) {
  upload().catch(err => {
    console.error('❌ 上传失败:', err.message)
    process.exit(1)
  })
}

module.exports = { upload }
