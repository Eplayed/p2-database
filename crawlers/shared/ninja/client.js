/**
 * poe.ninja 共用客户端：联赛解析、榜单 search、字典、角色详情。
 * poe1 与 poe2 用同一套实现，差异见 ./games.js。
 *
 * 取代此前 crawlers/ninja-ladder/ninja_api.js 里那条已经失效的
 * `/api/builds/{id}/overview` JSON 端点（实测两个游戏都返回 404，
 * fetchPlayerList() 拿到 0 条）。
 */

const { decodeSearch, decodeDictionary } = require('./proto')
const { getGame } = require('./games')

const USER_AGENT = 'poe-season-helper/1.0'
const REQUEST_TIMEOUT_MS = 20000
const RETRY = 3
const dictionaryCache = new Map()
const indexStateCache = new Map()

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function request(url, { json = true } = {}) {
  let lastError = null
  for (let attempt = 0; attempt < RETRY; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
      return json ? await response.json() : Buffer.from(await response.arrayBuffer())
    } catch (error) {
      clearTimeout(timer)
      lastError = error
      await wait(400 * (attempt + 1))
    }
  }
  throw lastError || new Error(`请求失败: ${url}`)
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
  if (!hash) return { id: '', values: [], properties: {} }
  const key = `${gameId}:${hash}`
  if (dictionaryCache.has(key)) return dictionaryCache.get(key)
  const game = getGame(gameId)
  const buffer = await request(`${game.apiBase}/builds/dictionary/${hash}`, { json: false })
  const dict = decodeDictionary(buffer)
  dictionaryCache.set(key, dict)
  return dict
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
 * @param {{league?: string, clazz?: string, type?: string, limit?: number, info?: Object}} options
 * @returns {Promise<{total: number, rows: Array<Object>, league: Object, columns: string[]}>}
 */
async function searchBuilds(gameId, options = {}) {
  const game = getGame(gameId)
  const info = options.info || (await resolveLeague(gameId, { league: options.league }))
  const type = options.type || 'exp'
  const params = [`overview=${encodeURIComponent(info.snapshotName)}`, `type=${encodeURIComponent(type)}`]
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
  return { total: decoded.total, rows, league: info, columns: decoded.columns.map(column => column.id) }
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

/** 单个角色的完整详情（装备/技能/天赋/防御/DPS），返回 JSON */
async function getCharacter(gameId, { account, name, league, info } = {}) {
  const game = getGame(gameId)
  const target = info || (await resolveLeague(gameId, { league }))
  const url = `${game.apiBase}/builds/${target.version}/character?account=${encodeURIComponent(account)}&name=${encodeURIComponent(name)}&overview=${encodeURIComponent(target.snapshotName)}`
  return request(url)
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
  pickLeague,
  resolveLeague,
  getDictionary,
  searchBuilds,
  getCharacter,
  getEconomy
}
