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
// 样本过少时中位价会大幅跳动（实测 3 个样本能把完美工匠石报成 -70%），
// 这种"涨幅"是噪声，宁可不显示，也不能报给用户。
const MIN_PRICE_SAMPLES = 5
// 单日涨跌超过这个倍数基本不是行情而是挂单结构变了：DD373 的"中位单价"取的是
// 最便宜若干条挂单的中位数，而最便宜的往往是大包卖家（实测 10/4 崇高石 0.0014→0.006、
// 混沌石 0.0092→0.0299，十条最便宜挂单里有五条是同一价位的同规格大包）。
// 这种数字给玩家看是"+328%"，只会让人觉得数据在胡说，所以直接不比较。
const MAX_ABS_CHANGE_PERCENT = 50

// 只有核心通货给涨跌幅：这几个报价多、盘子大，日环比才有意义；
// 工匠石、棱镜、各类碎片精华的"最便宜挂单中位数"一天能翻几倍，报出来只会让人觉得数据在胡说。
// 与小程序行情页已有的高亮口径保持一致（cnMarket.js 的 HIGHLIGHT_IDS）。
const CORE_CURRENCY_IDS = {
  poe2: ['divine_orb', 'exalted_orb', 'chaos_orb', 'mirror_of_kalandra'],
  poe1: ['divine', 'chaos', 'exalted', 'mirror'],
}

const GAMES = {
  poe2: {
    label: '流放之路2',
    dataDir: path.join(ROOT, 'translated-data', ENV_NAME),
    sourceRelative: path.join('miniprogram_data', 'cn_market_digest.json'),
    // DD373 国服：中位单价，人民币/个
    // 小程序行情页与关注页读的是这份，口径一并写进产物，前端不再靠猜
    marketScope: 'cn_rmb',
    unit: 'cny_per_unit',
    pickSource: digest => (Array.isArray(digest.items) ? digest.items : []),
    pickId: item => item.id,
    pickName: item => item.name || item.enName || '',
    pickEnName: item => item.enName || '',
    pickDisplay: item => item.displayValue || '',
    pickPrice: item => item.medianUnitPriceCny || item.bestUnitPriceCny || null,
    pickSample: item => (item.sampleSize === undefined || item.sampleSize === null ? null : numberOrNull(item.sampleSize)),
  },
  poe1: {
    label: '流放之路',
    dataDir: path.join(ROOT, 'translated-data', 'poe1', ENV_NAME),
    // 必须跟小程序 poe1 各页一致：首页换算条、行情页、关注页读的都是这份国际服行情。
    // 早前误用 cn_economy_digest（国服 DD373，id 前缀 dd373-），id 对不上导致涨幅恒为空。
    sourceRelative: path.join('miniprogram_data', 'economy_digest.json'),
    // poe1 以混沌石计价（国际服 poe.ninja）
    unit: 'chaos',
    marketScope: 'intl_chaos',
    // 技能天梯人数的日变化：来源是天梯摘要的 popularSkills（装备榜该产物里没有，暂不覆盖）
    usageSourceRelative: path.join('miniprogram_data', 'ladder_digest.json'),
    pickUsage: digest => (Array.isArray(digest.popularSkills) ? digest.popularSkills : [])
      .map(item => ({
        id: `skill:${item.name || item.nameEn || ''}`,
        type: 'skill',
        name: item.name || item.nameEn || '',
        icon: item.icon || '',
        count: numberOrNull(item.count) || 0,
      }))
      .filter(row => row.id !== 'skill:' && row.count > 0),
    pickSource: digest => (Array.isArray(digest.core) ? digest.core : []),
    pickId: item => item.id,
    pickName: item => item.name || item.nameEn || '',
    pickEnName: item => item.nameEn || '',
    pickDisplay: item => item.displayValue || '',
    pickPrice: item => item.chaosValue || null,
    // poe.ninja 无样本数概念，返回 undefined 表示未知，不参与门槛判定
    pickSample: () => undefined,
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

// 快照按"数据自身的日期"存，不按脚本运行日期：上游行情当天没刷新时（例如 poe1 那条链没跑），
// 按运行日期会写出一条重复的"今天"，明天再比就变成假的持平。
const sourceDateKey = (digest, fallbackKey) => {
  const raw = digest && (digest.updatedAt || digest.sourceUpdatedAt)
  const time = raw ? new Date(String(raw).replace(' ', 'T')).getTime() : NaN
  return Number.isFinite(time) ? localDateKey(new Date(time)) : fallbackKey
}

const buildGame = (gameId, snapshotStore, runDateKey) => {
  const game = GAMES[gameId]
  const sourcePath = path.join(game.dataDir, game.sourceRelative)
  const digest = readJson(sourcePath)
  if (!digest) throw new Error(`${gameId} 行情产物缺失：${sourcePath}`)
  const todayKey = sourceDateKey(digest, runDateKey)
  const coreIds = CORE_CURRENCY_IDS[gameId] || []

  const rows = game.pickSource(digest)
    .map(item => ({
      id: game.pickId(item),
      name: game.pickName(item),
      enName: game.pickEnName(item),
      displayValue: game.pickDisplay(item),
      price: numberOrNull(game.pickPrice(item)),
      sample: game.pickSample(item),
    }))
    .filter(row => row.id && row.name && row.price !== null && row.price > 0)
    // 核心通货排前面：否则条目一多，卡兰德魔镜这种会被截断截掉，
    // 而它恰恰是唯一必须带涨跌幅的那几个之一
    .sort((a, b) => Number(coreIds.includes(b.id)) - Number(coreIds.includes(a.id)))
    .slice(0, MAX_ITEMS)

  if (!rows.length) throw new Error(`${gameId} 行情条目为空，拒绝生成空产物覆盖线上`)

  const history = snapshotStore[gameId] || {}
  const previousDate = findPreviousDate(history, todayKey)
  const previousPrices = previousDate ? history[previousDate] || {} : {}

  const items = rows.map(row => {
    // 非核心通货仍然带现价（关注页要用），但不算涨跌幅
    if (!coreIds.includes(row.id)) {
      return { ...row, core: false, previousPrice: null, change1d: null, previousDate: previousDate || '' }
    }
    const rawPrev = previousPrices[row.id]
    // 兼容旧快照格式（纯数字 = 只有价格、没有样本数）
    const prev = typeof rawPrev === 'number' ? { p: rawPrev, s: null } : rawPrev || null
    const previousPrice = prev ? numberOrNull(prev.p) : null
    if (!previousPrice || previousPrice <= 0) {
      return { ...row, core: true, previousPrice: null, change1d: null, previousDate: previousDate || '' }
    }
    const enoughSample = (row.sample === null || row.sample === undefined || row.sample >= MIN_PRICE_SAMPLES)
      && (prev.s === null || prev.s === undefined || prev.s >= MIN_PRICE_SAMPLES)
    if (!enoughSample) {
      return {
        ...row,
        core: true,
        previousPrice,
        change1d: null,
        changeNote: '报价样本不足',
        previousDate,
      }
    }
    const changePercent = round(((row.price - previousPrice) / previousPrice) * 100)
    if (Math.abs(changePercent) > MAX_ABS_CHANGE_PERCENT) {
      // 疑似挂单结构变化造成的假波动，只保留现价，不报涨幅
      return {
        ...row,
        core: true,
        previousPrice,
        change1d: null,
        changeNote: '报价波动异常，暂不比较',
        previousDate,
      }
    }
    return {
      ...row,
      core: true,
      previousPrice,
      change1d: changePercent,
      previousDate,
    }
  })

  // 计算完再落今天的快照，保证前值不会变成自己
  history[todayKey] = items.reduce((acc, item) => {
    acc[item.id] = { p: item.price, s: item.sample }
    return acc
  }, {})
  const sortedDates = Object.keys(history).sort()
  while (sortedDates.length > 40) {
    delete history[sortedDates.shift()]
  }
  snapshotStore[gameId] = history

  // 技能天梯人数的日变化（有 usageSourceRelative 的游戏才做）
  let usage = []
  let usageReady = false
  if (game.usageSourceRelative) {
    const usageDigest = readJson(path.join(game.dataDir, game.usageSourceRelative))
    const usageRows = usageDigest ? game.pickUsage(usageDigest) : []
    // 天梯人数的日期跟价格分开：天梯摘要和行情摘要不一定同一次刷新
    const usageTodayKey = usageDigest ? sourceDateKey(usageDigest, todayKey) : todayKey
    const usageHistory = snapshotStore[`${gameId}_usage`] || {}
    const usagePrevDate = findPreviousDate(usageHistory, usageTodayKey)
    const usagePrev = usagePrevDate ? usageHistory[usagePrevDate] || {} : {}
    usage = usageRows.map(row => {
      const previousCount = numberOrNull(usagePrev[row.id])
      if (previousCount === null) {
        return { ...row, previousCount: null, deltaCount: null, changeLabel: '', previousDate: usagePrevDate || '' }
      }
      const delta = row.count - previousCount
      return {
        ...row,
        previousCount,
        deltaCount: delta,
        changeLabel: delta === 0 ? '' : `较昨日 ${delta > 0 ? '+' : ''}${delta} 位玩家`,
        previousDate: usagePrevDate,
      }
    })
    usageReady = usage.some(row => row.deltaCount !== null)
    usageHistory[usageTodayKey] = usageRows.reduce((acc, row) => {
      acc[row.id] = row.count
      return acc
    }, {})
    const usageDates = Object.keys(usageHistory).sort()
    while (usageDates.length > 40) {
      delete usageHistory[usageDates.shift()]
    }
    snapshotStore[`${gameId}_usage`] = usageHistory
  }

  const changeReady = items.some(item => item.change1d !== null) || usageReady
  return {
    payload: {
      schemaVersion: 1,
      game: gameId,
      gameName: game.label,
      env: ENV_NAME,
      unit: game.unit,
      marketScope: game.marketScope,
      updatedAt: new Date().toISOString(),
      sourceUpdatedAt: digest.updatedAt || '',
      items,
      usage,
      health: {
        itemCount: items.length,
        // 核心通货里今天真的算出涨跌幅的有几个，掉到 0 就说明行情源没刷新或口径变了
        coreChangeCount: items.filter(item => item.core && item.change1d !== null).length,
        usageCount: usage.length,
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
