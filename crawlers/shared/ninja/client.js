/**
 * poe.ninja 共用客户端：联赛解析、榜单 search、字典、角色详情。
 * poe1 与 poe2 用同一套实现，差异见 ./games.js。
 *
 * 取代此前 crawlers/ninja-ladder/ninja_api.js 里那条已经失效的
 * `/api/builds/{id}/overview` JSON 端点（实测两个游戏都返回 404，
 * fetchPlayerList() 拿到 0 条）。
 */

const { decodeSearch, decodeNdicNames } = require('./proto')
const { getGame } = require('./games')

const USER_AGENT = 'poe-season-helper/1.0'
const REQUEST_TIMEOUT_MS = 20000
const RETRY = 4
// poe.ninja 前面的 Cloudflare 对角色详情接口限流很紧（HTTP 429 / error code 1015）。
// 实测并发或连续快请求会成批失败，所以这里串行化并留最小间隔，而不是靠多试几次硬闯。
const MIN_REQUEST_INTERVAL_MS = Number(process.env.NINJA_REQUEST_INTERVAL_MS || 1200)
// Retry-After 超过这个时长说明已经进入长冷却，重试没有意义，交给调用方停手
const FAST_STOP_AFTER_SECONDS = 5
const dictionaryCache = new Map()
const indexStateCache = new Map()
let lastRequestAt = 0
let requestChain = Promise.resolve()

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 全局串行 + 限速：同一时刻只允许一个请求在飞，且两次请求至少间隔 MIN_REQUEST_INTERVAL_MS */
function throttle(task) {
  const run = requestChain.then(async () => {
    const elapsed = Date.now() - lastRequestAt
    if (elapsed < MIN_REQUEST_INTERVAL_MS) await wait(MIN_REQUEST_INTERVAL_MS - elapsed)
    try {
      return await task()
    } finally {
      lastRequestAt = Date.now()
    }
  })
  // 单次失败不能卡死整条队列
  requestChain = run.catch(() => {})
  return run
}

/**
 * 抓一个 URL。
 * 命中 poe.ninja 的 Cloudflare 限流（HTTP 429）时不再盲目重试：
 * 响应头里的 Retry-After 实测可以到 3000 秒以上，继续打只会把封禁时间往后推。
 * 这时直接抛出带 retryAfter 的错误，让调用方停止整轮抓取。
 */
async function request(url, { json = true, headers = {} } = {}) {
  return throttle(async () => {
    let lastError = null
    for (let attempt = 0; attempt < RETRY; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': USER_AGENT, ...headers },
          signal: controller.signal
        })
        clearTimeout(timer)
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after')) || 0
          if (retryAfter > FAST_STOP_AFTER_SECONDS * 60) {
            const error = new Error(`上游限流，需要等待 ${Math.round(retryAfter / 60)} 分钟: ${url}`)
            error.retryAfter = retryAfter
            error.rateLimited = true
            throw error
          }
          lastError = new Error(`HTTP 429 ${url}`)
          lastError.rateLimited = true
          await wait(Math.min(retryAfter * 1000 || 0, 3000 * Math.pow(2, attempt)) || 3000 * Math.pow(2, attempt))
          continue
        }
        if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
        return json ? await response.json() : Buffer.from(await response.arrayBuffer())
      } catch (error) {
        clearTimeout(timer)
        if (error.rateLimited) throw error
        lastError = error
        await wait(400 * (attempt + 1))
      }
    }
    throw lastError || new Error(`请求失败: ${url}`)
  })
}

/** index-state 里含各联赛的 version（builds 接口路径里要用），每天变化，不能写死 */
async function getIndexState(gameId, { force = false } = {}) {
  const game = getGame(gameId)
  if (!force && indexStateCache.has(game.id)) return indexStateCache.get(game.id)
  const state = await request(`${game.apiBase}/data/index-state`)
  indexStateCache.set(game.id, state)
  return state
}

/**
 * 选联赛：优先指定 slug，其次取第一个非硬核条目。
 * @returns {{url: string, name: string, snapshotName: string, version: string}}
 */
function pickLeague(state, wantedUrl) {
  const versions = Array.isArray(state.snapshotVersions) ? state.snapshotVersions : []
  const isCore = item => !/hardcore|\bhc\b|ssf|ruthless/i.test(`${item.url || ''} ${item.name || ''}`)
  const candidates = versions.filter(item => item && item.version)
  const chosen =
    candidates.find(item => wantedUrl && item.url === wantedUrl && isCore(item)) ||
    candidates.find(item => wantedUrl && item.url === wantedUrl) ||
    candidates.find(item => isCore(item)) ||
    candidates[0]
  if (!chosen) throw new Error('index-state 中没有可用的联赛版本')
  return {
    url: chosen.url,
    name: chosen.name || chosen.url,
    snapshotName: chosen.snapshotName || chosen.url,
    version: chosen.version
  }
}

async function resolveLeague(gameId, { league } = {}) {
  const game = getGame(gameId)
  const state = await getIndexState(gameId)
  try {
    return pickLeague(state, league || game.fallbackLeague)
  } catch (error) {
    // 兜底：老联赛 slug 变了也要能跑，取任意一条
    return pickLeague(state)
  }
}

/** 拉一个字典（列里存的是下标，要靠它还原成名称），进程内缓存 */
async function getDictionary(gameId, hash) {
  if (!hash) return []
  const key = `${gameId}:${hash}`
  if (dictionaryCache.has(key)) return dictionaryCache.get(key)
  const game = getGame(gameId)
  const buffer = await request(`${game.apiBase}/builds/dictionary/${hash}`, { json: false })
  const names = decodeNdicNames(buffer)
  dictionaryCache.set(key, names)
  return names
}

/**
 * 列里存的是字符串或数字；数字列（class / skills / keypassives 等）是字典下标，
 * 而字典响应是 "NDIC" 魔数的自定义二进制、不是 protobuf。
 * 本客户端刻意不去解它：榜单按职业逐个查询时职业本来就是已知值（由调用方传 clazz 回填），
 * 技能与装备名称在角色详情 character 的 JSON 里是明文，不需要字典。
 */
function columnValue(column, index) {
  if (column.strings.length) return column.strings[index] === undefined ? '' : column.strings[index]
  if (column.numbers.length) return column.numbers[index] === undefined ? null : column.numbers[index]
  return ''
}

/**
 * 抓榜单。
 * @param {string} gameId 'poe1' | 'poe2'
 * @param {{league?: string, clazz?: string, type?: string, sort?: string, limit?: number, info?: Object}} options
 * @returns {Promise<{total: number, rows: Array<Object>, league: Object, columns: string[]}>}
 */
async function searchBuilds(gameId, options = {}) {
  const game = getGame(gameId)
  const info = options.info || (await resolveLeague(gameId, { league: options.league }))
  const type = options.type || 'exp'
  const params = [`overview=${encodeURIComponent(info.snapshotName)}`, `type=${encodeURIComponent(type)}`]
  // 排序键要和现有产物一致，否则同一批人会以不同顺序上榜，diff 出来全是假差异
  if (options.sort) params.push(`sort=${encodeURIComponent(options.sort)}`)
  if (options.clazz) params.push(`class=${encodeURIComponent(options.clazz)}`)
  if (options.limit) params.push(`limit=${encodeURIComponent(options.limit)}`)
  const url = `${game.apiBase}/builds/${info.version}/search?${params.join('&')}`
  const decoded = decodeSearch(await request(url, { json: false }))

  const rowCount = decoded.columns.reduce((max, column) => Math.max(max, column.strings.length, column.numbers.length), 0)
  const rows = []
  for (let index = 0; index < rowCount; index += 1) {
    const row = {}
    decoded.columns.forEach(column => {
      const value = columnValue(column, index)
      if (value !== '' && value !== undefined && value !== null) row[column.id] = value
    })
    // 数字列（职业/技能）是 NDIC 字典下标，本客户端不解它：按职业查询时职业是已知输入，直接覆盖
    if (options.clazz) row.class = options.clazz
    if (row.name || row.account) rows.push(row)
  }
  // search 端点会忽略 limit，永远返回 100 行。不截断的话 dev 冒烟和
  // 「每个职业只看前几名」的场景会真的去抓 100 份角色详情，白白跑十几分钟。
  if (options.limit && rows.length > options.limit) rows.length = options.limit
  return {
    total: decoded.total,
    rows,
    league: info,
    columns: decoded.columns.map(column => column.id),
    dictionaries: decoded.dictionaries || []
  }
}

/**
 * 某联赛可选的职业名。
 * 榜单里的职业列存的是 NDIC 字典下标，而字典不是 protobuf、页面又已改成客户端渲染，
 * 所以职业名单由 games.js 显式维护；这里只做去空与去重。
 * @returns {string[]}
 */
function listClasses(gameId) {
  const game = getGame(gameId)
  return Array.from(new Set((game.classes || []).filter(Boolean)))
}

/**
 * 从榜单响应自带的 class 字典里取职业名单。
 *
 * 为什么不能用写死的名单：字典里除了进阶（Deadeye、Occultist…）还有
 * 还没选进阶的角色所属的基础职业（Marauder、Witch…），漏掉这部分人实测
 * 会少掉约四分之一的天梯角色，而且新赛季加新进阶时写死名单不会自己跟上。
 * 解不出来（NDIC 布局变了）就退回写死名单，并让调用方的覆盖率检查报警。
 *
 * @returns {Promise<{names: string[], fromApi: boolean}>}
 */
async function getClassNames(gameId, { info } = {}) {
  const target = info || (await resolveLeague(gameId))
  try {
    const listed = await searchBuilds(gameId, { info: target, limit: 1 })
    const ref = (listed.dictionaries || []).find(item => item.id === 'class')
    if (!ref) throw new Error('榜单响应里没有 class 字典引用')
    const names = await getDictionary(gameId, ref.hash)
    const unique = Array.from(new Set(names.filter(Boolean)))
    if (!unique.length) throw new Error('class 字典解出 0 个职业')
    return { names: unique, fromApi: true }
  } catch (error) {
    console.warn(`[ninja] 职业字典解析失败，退回写死名单: ${error.message}`)
    return { names: listClasses(gameId), fromApi: false }
  }
}

/** 单个角色的完整详情（装备/技能/天赋/防御/DPS），返回 JSON */
async function getCharacter(gameId, { account, name, league, info } = {}) {
  const game = getGame(gameId)
  const target = info || (await resolveLeague(gameId, { league }))
  const url = `${game.apiBase}/builds/${target.version}/character?account=${encodeURIComponent(account)}&name=${encodeURIComponent(name)}&overview=${encodeURIComponent(target.snapshotName)}`
  // 详情接口限流最严，带上页面 Referer 更接近真实浏览行为
  const referer = `${game.apiBase.replace('/api', '')}/${target.url}/character/${encodeURIComponent(account)}/${encodeURIComponent(name)}`
  return request(url, { headers: { referer } })
}

/** 经济数据：两个游戏同一个端点，只差前缀与分类名 */
async function getEconomy(gameId, { league, type } = {}) {
  const game = getGame(gameId)
  const state = await getIndexState(gameId)
  const leagues = Array.isArray(state.economyLeagues) ? state.economyLeagues : []
  const wanted = leagues.find(item => league && item.url === league) || leagues[0]
  if (!wanted) throw new Error('index-state 中没有经济联赛列表')
  const url = `${game.apiBase}/economy/exchange/current/overview?league=${encodeURIComponent(wanted.name)}&type=${encodeURIComponent(type)}`
  return { payload: await request(url), league: wanted }
}

module.exports = {
  getIndexState,
  listClasses,
  getClassNames,
  pickLeague,
  resolveLeague,
  getDictionary,
  searchBuilds,
  getCharacter,
  getEconomy
}
