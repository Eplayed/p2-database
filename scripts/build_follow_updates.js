#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ENV_NAME = process.env.NODE_ENV === 'dev' ? 'dev' : 'release'
const DATA_DIR = path.join(ROOT, 'translated-data', ENV_NAME)
const OUTPUT_DIR = path.join(DATA_DIR, 'miniprogram_data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'follow_updates.json')
const OSS_BASE = 'https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com'
const REMOTE_PREVIOUS_URL = `${OSS_BASE}/poe2-ladders/${ENV_NAME}/miniprogram_data/follow_updates.json`

const readJson = (filePath, fallback) => {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return fallback
  }
}

const numberOrNull = value => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const round = (value, precision = 1) => {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const classSummary = classes => (Array.isArray(classes) ? classes : [])
  .slice(0, 3)
  .map(item => ({
    name: item.name || '',
    displayName: item.displayName || item.name || '',
    count: numberOrNull(item.count) || 0,
  }))
  .filter(item => item.name)

const makeLadderChange = (item, previousItem) => {
  const currentCount = numberOrNull(item.count)
  const previousCount = numberOrNull(previousItem && previousItem.metrics && previousItem.metrics.count)
  if (currentCount === null || previousCount === null || currentCount === previousCount) return null

  const delta = currentCount - previousCount
  return {
    kind: 'ladder',
    deltaCount: delta,
    label: `较上次 ${delta > 0 ? '+' : ''}${delta} 位玩家`,
  }
}

const makeMarketChange = (item, previousItem) => {
  const currentPrice = numberOrNull(item.bestUnitPriceCny)
  const previousPrice = numberOrNull(previousItem && previousItem.metrics && previousItem.metrics.pricePerUnit)
  if (!currentPrice || !previousPrice) return null

  const deltaPercent = round(((currentPrice - previousPrice) / previousPrice) * 100)
  if (!deltaPercent) return null
  return {
    kind: 'market',
    deltaPercent,
    label: `价格较上次 ${deltaPercent > 0 ? '+' : ''}${deltaPercent}%`,
  }
}

const createLadderItems = (type, sourceItems, previousItems) => {
  const previousById = new Map((Array.isArray(previousItems) ? previousItems : []).map(item => [item.id, item]))
  return (Array.isArray(sourceItems) ? sourceItems : [])
    .filter(item => item && item.id && item.name)
    .map(item => {
      const previousItem = previousById.get(`${type}:${item.id}`)
      const keyword = item.originalName || item.name
      const noun = type === 'skill' ? '天梯玩家使用' : '天梯玩家装备'
      return {
        id: `${type}:${item.id}`,
        type,
        title: item.name,
        originalName: item.originalName || '',
        icon: item.icon || '',
        subtitle: `${item.count || 0} 位${noun}`,
        route: `/pages-sub/ladder-analysis/index?tab=${type}&keyword=${encodeURIComponent(keyword)}`,
        classes: classSummary(item.classes),
        representative: item.representative || null,
        metrics: {
          count: numberOrNull(item.count) || 0,
          percent: numberOrNull(item.percent) || 0,
        },
        change: makeLadderChange(item, previousItem),
      }
    })
}

const createMarketItems = (sourceItems, previousItems) => {
  const previousById = new Map((Array.isArray(previousItems) ? previousItems : []).map(item => [item.id, item]))
  return (Array.isArray(sourceItems) ? sourceItems : [])
    .filter(item => item && item.id && item.name && Number(item.bestUnitPriceCny) > 0)
    .map(item => {
      const previousItem = previousById.get(`economy:${item.id}`)
      const price = numberOrNull(item.bestUnitPriceCny)
      return {
        id: `economy:${item.id}`,
        type: 'economy',
        title: item.name,
        originalName: item.enName || '',
        icon: item.icon || '',
        subtitle: `${price} 米粒/个`,
        route: '/pages-sub/market/index?tab=cn',
        metrics: {
          pricePerUnit: price,
          unitsPerMili: numberOrNull(item.bestUnitPerCny),
        },
        change: makeMarketChange(item, previousItem),
      }
    })
}

const buildFollowUpdates = ({ ladderBuildIndex = {}, cnMarket = {}, previousDigest = {} }) => {
  const previousItems = Array.isArray(previousDigest.items) ? previousDigest.items : []
  const previousByType = type => previousItems.filter(item => item && item.type === type)
  const hasSkills = Array.isArray(ladderBuildIndex.skills) && ladderBuildIndex.skills.length > 0
  const hasEquipment = Array.isArray(ladderBuildIndex.equipment) && ladderBuildIndex.equipment.length > 0
  const hasMarket = Array.isArray(cnMarket.items) && cnMarket.items.length > 0
  const items = [
    ...(hasSkills ? createLadderItems('skill', ladderBuildIndex.skills, previousItems) : previousByType('skill')),
    ...(hasEquipment ? createLadderItems('equipment', ladderBuildIndex.equipment, previousItems) : previousByType('equipment')),
    ...(hasMarket ? createMarketItems(cnMarket.items, previousItems) : previousByType('economy')),
  ]

  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    sourceUpdatedAt: {
      ladder: ladderBuildIndex.updatedAt || '',
      cnMarket: cnMarket.updatedAt || '',
    },
    items,
  }
}

const readPreviousRemote = async () => {
  if (typeof fetch !== 'function') return {}
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(REMOTE_PREVIOUS_URL, { signal: controller.signal })
    if (!response.ok) return {}
    return await response.json()
  } catch (error) {
    console.warn(`未读取到上一版关注摘要，将跳过本次变化比较: ${error.message}`)
    return {}
  } finally {
    clearTimeout(timeout)
  }
}

const buildFromCurrentData = async () => {
  const localPrevious = readJson(OUTPUT_FILE, null)
  const previousDigest = localPrevious || await readPreviousRemote()
  const digest = buildFollowUpdates({
    ladderBuildIndex: readJson(path.join(OUTPUT_DIR, 'ladder_build_index.json'), {}),
    cnMarket: readJson(path.join(OUTPUT_DIR, 'cn_market_digest.json'), {}),
    previousDigest,
  })
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(digest, null, 2))
  console.log('🔔 我的关注变化摘要已生成')
  console.log(`   环境: ${ENV_NAME}`)
  console.log(`   可关注项: ${digest.items.length}`)
  console.log(`   本次有变化: ${digest.items.filter(item => item.change).length}`)
  console.log(`   输出: ${path.relative(ROOT, OUTPUT_FILE)}`)
  return digest
}

if (require.main === module) {
  buildFromCurrentData().catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = {
  buildFollowUpdates,
  createLadderItems,
  createMarketItems,
  makeLadderChange,
  makeMarketChange,
  buildFromCurrentData,
}
