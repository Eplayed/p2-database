#!/usr/bin/env node

/**
 * 生成小程序首页「今日换算」用的通货日涨幅。
 *
 * 做法：每天把当前行情价存一份按日快照（同一天多次运行只保留最后一次），
 * 再拿"最近一个早于今天的快照"作前值算 change1d。
 *
 * 约束：
 * - 快照只写 dashboard/runtime/（该目录 git 忽略、且不在任何上传白名单里），不会进 OSS、不会入库。
 * - 产物是各游戏独立的新文件 currency_daily_change.json，不改动任何既有 JSON 结构。
 * - 行情条目为空时直接失败退出，避免用空数据覆盖线上产物。
 * - 首日没有前值时 change1d 为 null，由前端显示"暂无对比"，不编造数字。
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ENV_NAME = process.env.NODE_ENV === 'dev' ? 'dev' : 'release'
// 可用环境变量改快照位置，便于在不污染正式快照的前提下验证涨幅算法
const SNAPSHOT_FILE = process.env.CURRENCY_SNAPSHOT_FILE
  ? path.resolve(process.env.CURRENCY_SNAPSHOT_FILE)
  : path.join(ROOT, 'dashboard', 'runtime', 'currency-daily-snapshot.json')
const OUTPUT_NAME = 'currency_daily_change.json'
const MAX_ITEMS = 6

const GAMES = {
  poe2: {
    label: '流放之路2',
    dataDir: path.join(ROOT, 'translated-data', ENV_NAME),
    sourceRelative: path.join('miniprogram_data', 'cn_market_digest.json'),
    // DD373 国服：中位单价，人民币/个
    unit: 'cny_per_unit',
    pickSource: digest => (Array.isArray(digest.items) ? digest.items : []),
    pickId: item => item.id,
    pickName: item => item.name || item.enName || '',
    pickEnName: item => item.enName || '',
    pickDisplay: item => item.displayValue || '',
    pickPrice: item => item.medianUnitPriceCny || item.bestUnitPriceCny || null,
  },
  poe1: {
    label: '流放之路',
    dataDir: path.join(ROOT, 'translated-data', 'poe1', ENV_NAME),
    sourceRelative: path.join('miniprogram_data', 'cn_economy_digest.json'),
    // 国服行情：以混沌石计
    unit: 'chaos',
    pickSource: digest => (Array.isArray(digest.core) ? digest.core : []),
    pickId: item => item.id,
    pickName: item => item.name || item.nameEn || '',
    pickEnName: item => item.nameEn || '',
    pickDisplay: item => item.displayValue || '',
    pickPrice: item => item.chaosValue || null,
  },
}

const readJson = filePath => {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    console.error(`[currency-daily] 读取失败 ${filePath}: ${error.message}`)
    return null
  }
}

const writeJson = (filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

const numberOrNull = value => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const round = (value, precision = 2) => {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const localDateKey = date => {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

// 只取早于今天的最近一个日期作为"昨日"，中间断档时自动回退到更早的一天
const findPreviousDate = (history, todayKey) => {
  const dates = Object.keys(history || {})
    .filter(key => key !== todayKey && /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort()
  return dates.length ? dates[dates.length - 1] : ''
}

const buildGame = (gameId, snapshotStore, todayKey) => {
  const game = GAMES[gameId]
  const sourcePath = path.join(game.dataDir, game.sourceRelative)
  const digest = readJson(sourcePath)
  if (!digest) throw new Error(`${gameId} 行情产物缺失：${sourcePath}`)

  const rows = game.pickSource(digest)
    .map(item => ({
      id: game.pickId(item),
      name: game.pickName(item),
      enName: game.pickEnName(item),
      displayValue: game.pickDisplay(item),
      price: numberOrNull(game.pickPrice(item)),
    }))
    .filter(row => row.id && row.name && row.price !== null && row.price > 0)
    .slice(0, MAX_ITEMS)

  if (!rows.length) throw new Error(`${gameId} 行情条目为空，拒绝生成空产物覆盖线上`)

  const history = snapshotStore[gameId] || {}
  const previousDate = findPreviousDate(history, todayKey)
  const previousPrices = previousDate ? history[previousDate] || {} : {}

  const items = rows.map(row => {
    const previousPrice = numberOrNull(previousPrices[row.id])
    if (!previousPrice || previousPrice <= 0) {
      return { ...row, previousPrice: null, change1d: null, previousDate: previousDate || '' }
    }
    return {
      ...row,
      previousPrice,
      change1d: round(((row.price - previousPrice) / previousPrice) * 100),
      previousDate,
    }
  })

  // 计算完再落今天的快照，保证前值不会变成自己
  history[todayKey] = items.reduce((acc, item) => {
    acc[item.id] = item.price
    return acc
  }, {})
  const sortedDates = Object.keys(history).sort()
  while (sortedDates.length > 40) {
    delete history[sortedDates.shift()]
  }
  snapshotStore[gameId] = history

  const changeReady = items.some(item => item.change1d !== null)
  return {
    payload: {
      schemaVersion: 1,
      game: gameId,
      gameName: game.label,
      env: ENV_NAME,
      unit: game.unit,
      updatedAt: new Date().toISOString(),
      sourceUpdatedAt: digest.updatedAt || '',
      items,
      health: {
        itemCount: items.length,
        snapshotDays: sortedDates.length,
        previousDate: previousDate || '',
        changeReady,
      },
    },
    outputPath: path.join(game.dataDir, 'miniprogram_data', OUTPUT_NAME),
  }
}

const main = () => {
  const todayKey = localDateKey(new Date())
  const snapshotStore = readJson(SNAPSHOT_FILE) || {}
  const requested = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
  const gameIds = requested.length ? requested : Object.keys(GAMES)

  gameIds.forEach(gameId => {
    if (!GAMES[gameId]) {
      console.error(`[currency-daily] 未知游戏: ${gameId}`)
      process.exitCode = 1
      return
    }
    try {
      const { payload, outputPath } = buildGame(gameId, snapshotStore, todayKey)
      writeJson(SNAPSHOT_FILE, snapshotStore)
      writeJson(outputPath, payload)
      const summary = payload.items
        .map(item => `${item.name} ${item.change1d === null ? '-' : `${item.change1d > 0 ? '+' : ''}${item.change1d}%`}`)
        .join(' | ')
      console.log(
        `[currency-daily] ${gameId} 写入 ${path.relative(ROOT, outputPath)}` +
        `（${payload.health.itemCount} 项，前值日 ${payload.health.previousDate || '无'}，涨幅可用 ${payload.health.changeReady ? '是' : '否'}）`
      )
      console.log(`[currency-daily] ${gameId} ${summary}`)
    } catch (error) {
      console.error(`[currency-daily] ${gameId} 失败: ${error.message}`)
      process.exitCode = 1
    }
  })
}

main()
