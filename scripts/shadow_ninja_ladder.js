#!/usr/bin/env node

/**
 * poe2 榜单影子对比：用新的共用 ninja 客户端按 API 重算一份榜单，
 * 与线上正在使用的 all_ladders_translated.json 逐字段对比，只读不写、不上传。
 *
 * 用途：确认「抓榜单从 Puppeteer 迁到 API」不会改变玩家看到的内容。
 * 对比口径：每个职业的排名顺序、角色名、账号、等级。
 */

const fs = require('fs')
const path = require('path')
const { searchBuilds, resolveLeague } = require('../crawlers/shared/ninja/client')

const ROOT = path.join(__dirname, '..')
const GAME_ID = process.env.SHADOW_GAME || 'poe2'
const CURRENT_FILE = path.join(
  ROOT,
  'translated-data',
  GAME_ID === 'poe2' ? 'release' : path.join('poe1', 'release'),
  'all_ladders_translated.json'
)

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`文件不存在: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function normalize(value) {
  return String(value === undefined || value === null ? '' : value).trim()
}

/** 同一份数据里角色名可能带翻译差异，比对时以「账号+等级」为准，名字单独统计差异 */
function compareClass(className, expected, actual) {
  const issues = []
  const max = Math.max(expected.length, actual.length)
  for (let i = 0; i < max; i += 1) {
    const left = expected[i]
    const right = actual[i]
    if (!left) {
      issues.push({ rank: i + 1, type: '新增', detail: `${right.name} / ${right.account}` })
      continue
    }
    if (!right) {
      issues.push({ rank: i + 1, type: '缺失', detail: `${left.name} / ${left.account}` })
      continue
    }
    if (normalize(left.account) !== normalize(right.account)) {
      issues.push({
        rank: i + 1,
        type: '账号不同',
        detail: `现有 ${left.account} → API ${right.account}`
      })
    } else if (normalize(left.level) !== normalize(right.level)) {
      issues.push({
        rank: i + 1,
        type: '等级不同',
        detail: `${left.account} 现有 ${left.level} → API ${right.level}`
      })
    } else if (normalize(left.name) !== normalize(right.name)) {
      issues.push({
        rank: i + 1,
        type: '角色名不同',
        detail: `${left.account} 现有「${left.name}」→ API「${right.name}」`
      })
    }
  }
  return issues
}

async function main() {
  const current = readJson(CURRENT_FILE)
  const ladders = current.ladders || {}
  const classes = Object.keys(ladders)
  const info = await resolveLeague(GAME_ID)
  console.log(`影子对比 game=${GAME_ID} 联赛=${info.name}(${info.url}) version=${info.version}`)
  console.log(`现有产物: ${path.relative(ROOT, CURRENT_FILE)}，updateTime=${current.updateTime}，职业数=${classes.length}`)

  let sameCount = 0
  let diffCount = 0
  let orderOnlyCount = 0
  let memberDiffCount = 0
  const report = []

  for (const className of classes) {
    const expected = ladders[className] || []
    // 不传 sort：实测现有产物的顺序就是 API 默认顺序，加 sort=depth 反而对不上
    const result = await searchBuilds(GAME_ID, { info, clazz: className, limit: Math.max(expected.length, 1) })
    const actual = result.rows.slice(0, expected.length).map(row => ({
      account: row.account,
      name: row.name,
      level: Number(row.level) || 0
    }))
    const issues = compareClass(className, expected, actual)
    if (!issues.length) {
      sameCount += 1
      continue
    }
    diffCount += 1
    // 区分「只是名次浮动」和「人真的不一样」：前者是抓取时间差，后者才是语义差异
    const leftSet = new Set(expected.map(item => normalize(item.account)))
    const rightSet = new Set(actual.map(item => normalize(item.account)))
    const onlyLeft = Array.from(leftSet).filter(item => !rightSet.has(item))
    const onlyRight = Array.from(rightSet).filter(item => !leftSet.has(item))
    const kind = !onlyLeft.length && !onlyRight.length ? '顺序浮动' : '成员不同'
    orderOnlyCount += kind === '顺序浮动' ? 1 : 0
    memberDiffCount += kind === '成员不同' ? 1 : 0
    report.push({ className, kind, onlyLeft, onlyRight, expected: expected.length, actual: actual.length, issues })
  }

  console.log('\n===== 对比结果 =====')
  console.log(`完全一致职业: ${sameCount}/${classes.length}`)
  console.log(`有差异职业: ${diffCount}/${classes.length}（其中仅顺序浮动 ${orderOnlyCount}，成员真的不同 ${memberDiffCount}）`)
  const byType = {}
  report.forEach(item => item.issues.forEach(issue => {
    byType[issue.type] = (byType[issue.type] || 0) + 1
  }))
  console.log('差异类型统计:', JSON.stringify(byType))
  report.slice(0, 8).forEach(item => {
    console.log(`\n[${item.className}] ${item.kind} | 现有 ${item.expected} 人 / API ${item.actual} 人`)
    if (item.onlyLeft.length || item.onlyRight.length) {
      console.log(`   只在现有: ${item.onlyLeft.join(', ') || '无'} | 只在API: ${item.onlyRight.join(', ') || '无'}`)
    }
    item.issues.slice(0, 5).forEach(issue => console.log(`   #${issue.rank} ${issue.type}: ${issue.detail}`))
  })
  if (report.length > 8) console.log(`\n…另有 ${report.length - 8} 个职业存在差异`)
}

main().catch(error => {
  console.error('❌ 影子对比失败:', error.message)
  process.exitCode = 1
})
