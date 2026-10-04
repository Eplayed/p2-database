#!/usr/bin/env node

/**
 * 流放1 天梯产物发布前检查（只读，不改任何文件）。
 *
 * 为什么需要：天梯换源到 poe.ninja 后，首屏摘要和单角色详情拆成了两类文件。
 * 摘要少了详情不影响列表页，但会让点进 BD 的玩家看到空壳；详情文件写坏了
 * 列表页又一切正常。上传前必须两边都验一遍，而不是只看 JSON 能不能解析。
 *
 * 用法：
 *   node scripts/check_poe1_ladder_output.js            # 检查 release
 *   node scripts/check_poe1_ladder_output.js --env=dev  # 检查 dev
 *   POE1_LADDER_DIR=/tmp/poe1-shadow/miniprogram_data node scripts/check_poe1_ladder_output.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const envArg = process.argv.find((arg) => arg.startsWith('--env='))
const ENV_NAME = envArg ? envArg.split('=')[1] : process.env.NODE_ENV === 'dev' ? 'dev' : 'release'
const DATA_DIR = process.env.POE1_LADDER_DIR || path.join(ROOT, 'translated-data', 'poe1', ENV_NAME, 'miniprogram_data')
const DIGEST_FILE = path.join(DATA_DIR, 'ladder_digest.json')
// 首屏摘要要能在弱网下快速打开；超过这个体积说明详情字段又混回摘要里了
const MAX_DIGEST_KB = Number(process.env.POE1_LADDER_MAX_KB || 900)
const MAX_BUILD_KB = Number(process.env.POE1_LADDER_BUILD_MAX_KB || 200)
const STALE_WARN_HOURS = Number(process.env.POE1_LADDER_STALE_HOURS || 30)

const REQUIRED_BUILD_FIELDS = ['id', 'rank', 'character', 'account', 'level', 'className', 'leagueName', 'detailFile']
const REQUIRED_DETAIL_FIELDS = ['id', 'character', 'equipment', 'skillGroups', 'stats']

const problems = []
const warnings = []

function fail(message) {
  problems.push(message)
}

function warn(message) {
  warnings.push(message)
}

function readJsonFile(file) {
  const text = fs.readFileSync(file, 'utf8')
  return JSON.parse(text)
}

function sizeInKb(file) {
  return Math.round(fs.statSync(file).size / 1024)
}

function checkDigest() {
  if (!fs.existsSync(DIGEST_FILE)) {
    fail(`缺少天梯摘要: ${DIGEST_FILE}`)
    return null
  }
  let digest
  try {
    digest = readJsonFile(DIGEST_FILE)
  } catch (error) {
    fail(`天梯摘要不是合法 JSON: ${error.message}`)
    return null
  }

  if (!digest.league || !digest.league.url) fail('摘要缺少 league.url，小程序赛季标注会空')
  if (!digest.league || !digest.league.displayName) fail('摘要缺少 league.displayName，玩家会看到英文赛季名')
  if (!Number(digest.totalCharacters)) fail('摘要 totalCharacters 为 0，疑似上游榜单为空')
  if (!Array.isArray(digest.builds) || !digest.builds.length) {
    fail('摘要 builds 为空，禁止发布')
    return null
  }
  if (!Array.isArray(digest.popularSkills) || !digest.popularSkills.length) warn('摘要没有热门技能，技能查 BD 会是空的')

  const updatedAt = Date.parse(digest.updatedAt || '')
  if (!Number.isFinite(updatedAt)) {
    fail(`摘要 updatedAt 不可解析: ${digest.updatedAt}`)
  } else if ((Date.now() - updatedAt) / 3600000 > STALE_WARN_HOURS) {
    warn(`摘要已经 ${(String(Math.round((Date.now() - updatedAt) / 3600000) * 10) / 10).toFixed(1)} 小时没更新`)
  }

  const kb = sizeInKb(DIGEST_FILE)
  if (kb > MAX_DIGEST_KB) {
    warn(`摘要体积 ${kb} KB 超过 ${MAX_DIGEST_KB} KB，首屏会明显变慢（详情字段可能没拆干净）`)
  }

  const missingTranslation = digest.builds.filter((build) => build.className && !/[\u4e00-\u9fa5]/.test(String(build.className)))
  if (missingTranslation.length) {
    warn(`${missingTranslation.length} 条 BD 的职业名没有中文: ${missingTranslation.slice(0, 3).map((b) => b.className).join(', ')}`)
  }
  return digest
}

function checkBuilds(digest) {
  let withDetailFile = 0
  let inlineDetail = 0
  digest.builds.forEach((build, index) => {
    REQUIRED_BUILD_FIELDS.forEach((field) => {
      if (build[field] === undefined || build[field] === null || build[field] === '') {
        // detailFile 允许为空：只上榜、没抓详情的角色本来就没有详情
        if (field === 'detailFile') return
        fail(`摘要第 ${index + 1} 条 (${build.character || build.id || '?'}) 缺少 ${field}`)
      }
    })
    if (build.detailFile) withDetailFile += 1
    else if (Array.isArray(build.equipment) && build.equipment.length) inlineDetail += 1
  })
  return { withDetailFile, inlineDetail }
}

function checkDetailFiles(digest) {
  const builds = digest.builds.filter((build) => build.detailFile)
  if (!builds.length) {
    warn('摘要里没有任何 detailFile，BD 详情页只能显示榜单基本信息')
    return { checked: 0, missing: 0, emptyEquipment: 0, oversized: 0 }
  }
  let missing = 0
  let broken = 0
  let emptyEquipment = 0
  let oversized = 0
  builds.forEach((build) => {
    const file = path.join(DATA_DIR, build.detailFile)
    if (!fs.existsSync(file)) {
      missing += 1
      fail(`详情文件不存在: ${build.detailFile}`)
      return
    }
    let detail
    try {
      detail = readJsonFile(file)
    } catch (error) {
      broken += 1
      fail(`详情文件解析失败 ${build.detailFile}: ${error.message}`)
      return
    }
    REQUIRED_DETAIL_FIELDS.forEach((field) => {
      if (detail[field] === undefined) fail(`详情 ${build.detailFile} 缺少字段 ${field}`)
    })
    if (!Array.isArray(detail.equipment) || !detail.equipment.length) emptyEquipment += 1
    const kb = sizeInKb(file)
    if (kb > MAX_BUILD_KB) oversized += 1
    if (detail.id && detail.id !== build.id) fail(`详情 id 与摘要不一致: ${detail.id} vs ${build.id}`)
  })
  if (missing) fail(`${missing} 个详情文件缺失，点进这些 BD 会看到空详情`)
  if (emptyEquipment) warn(`${emptyEquipment}/${builds.length} 个详情没有任何装备，可能是上游未上传构建`)
  if (oversized) warn(`${oversized} 个详情文件超过 ${MAX_BUILD_KB} KB`)
  return { checked: builds.length - missing - broken, missing, emptyEquipment, oversized }
}

function main() {
  console.log(`检查流放1 天梯产物: ${DATA_DIR}`)
  const digest = checkDigest()
  if (digest) {
    const buildCheck = checkBuilds(digest)
    const detailCheck = checkDetailFiles(digest)
    console.log(
      `  摘要 ${digest.builds.length} 条（带详情指针 ${buildCheck.withDetailFile}，旧格式内联 ${buildCheck.inlineDetail}）` +
        `，详情校验通过 ${detailCheck.checked}/${detailCheck.missing + detailCheck.checked}`
    )
  }

  warnings.forEach((message) => console.warn(`⚠️  ${message}`))
  problems.forEach((message) => console.error(`❌ ${message}`))

  if (problems.length) {
    console.error(`\n❌ 发布前检查未通过: ${problems.length} 个错误，${warnings.length} 个提醒`)
    process.exitCode = 1
    return
  }
  console.log(`\n✅ 发布前检查通过（${warnings.length} 个提醒）`)
}

main()
