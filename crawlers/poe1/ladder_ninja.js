#!/usr/bin/env node

/**
 * 流放1 天梯 BD 抓取（poe.ninja 版）
 *
 * 为什么换源：国服官方天梯只有 282 个角色、赛季名还容易标错，而且单个角色常常只上报
 * 一两件装备（实测有个 6 孔弓上报 6 颗同名宝石），BD 页因此看着"不全"。
 * poe.ninja 同一个角色给 11 装备 + 5 药剂 + 19 珠宝 + 真实孔位宝石 + 94 个天赋节点，
 * 并且和通货是同一个服同一个联盟，不再出现"天梯旧赛季 + 行情新赛季"的错位。
 *
 * 产物拆成两层，避免首屏再拉 3.7MB：
 *   miniprogram_data/ladder_digest.json  列表摘要（不含装备/技能明细）
 *   miniprogram_data/poe1_builds/{id}.json  单个 BD 的完整详情，点开才拉
 *
 * 环境变量：
 *   POE1_NINJA_LEAGUE      指定联赛 slug，默认取 index-state 当前非硬核联赛
 *   POE1_NINJA_PER_CLASS   每个职业进摘要的名次数量，默认 10
 *   POE1_NINJA_DETAIL      每个职业抓完整详情的数量，默认等于 PER_CLASS
 *   POE1_NINJA_OUTPUT_DIR  输出目录（影子验证用，默认写 release）
 *   POE1_NINJA_GAME        输出到 dev 还是 release，默认 release
 */

const fs = require('fs')
const path = require('path')
const { searchBuilds, resolveLeague, getClassNames, getCharacter } = require('../shared/ninja/client')
const { passiveTreeHash, djb2Hash } = require('../shared/passiveTreeHash')
const {
  isSupportGem,
  translateProperties,
  translateClass,
  translateSkill,
  translateItemName,
  translateBaseItem,
  translateKeyPassive,
  translateStatText
} = require('./translations')

const ROOT = path.join(__dirname, '../..')
// dev 判定与其他环节（截图/检查/覆盖率/上传）保持一致，漏设一个变量就会写进不同目录
const env = (process.env.POE1_NINJA_GAME === 'dev' || process.env.NODE_ENV === 'dev') ? 'dev' : 'release'
const OUTPUT_DIR = process.env.POE1_NINJA_OUTPUT_DIR
  ? path.resolve(process.env.POE1_NINJA_OUTPUT_DIR)
  : path.join(ROOT, 'translated-data/poe1', env, 'miniprogram_data')
const BUILD_DIR_NAME = 'poe1_builds'
/**
 * 单条 BD 详情文件名，必须纯 ASCII。
 * poe.ninja 的角色名大量是俄文/韩文/中文，之前用 encodeURIComponent 命名，
 * 传到 OSS 后 %XX 会被解一次码，取回来 404（实测 162 条里 28 条点不开）。
 * 尾巴带整串 id 的哈希，避免不同角色清洗后撞成同一个文件。
 */
function detailFileName(id) {
  const slug = String(id)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72)
  return `${BUILD_DIR_NAME}/${slug}-${djb2Hash(id)}.json`
}
// 每职业 6 条：28 个职业约 168 条，摘要压到 1MB 上下（换源前是 3.7MB，且其中 206 条根本没有详情）。
// 想加样本量用 POE1_NINJA_PER_CLASS 覆盖，注意详情是按条串行抓的，翻倍就多花一倍时间。
const PER_CLASS = Number(process.env.POE1_NINJA_PER_CLASS || 6)
const DETAIL_PER_CLASS = Number(process.env.POE1_NINJA_DETAIL || PER_CLASS)
const REQUEST_GAP_MS = 120
// 角色原始详情本地缓存。上游详情接口限流很重（实测 Retry-After 到过 52 分钟），
// 而补译名、改字段映射这类事根本不需要重新联网：缓存命中就直接本地重算。
const RAW_CACHE_DIR = process.env.POE1_NINJA_RAW_CACHE_DIR
  ? path.resolve(process.env.POE1_NINJA_RAW_CACHE_DIR)
  : path.join(ROOT, 'translated-data/poe1/.ninja_raw_cache')
const USE_RAW_CACHE = process.env.POE1_NINJA_REFRESH_RAW !== '1'
// 跨快照宽限小时数：默认 0，也就是只认同一次快照的详情，日常发布照样拿新数据。
// 补译名、改字段映射时用 POE1_NINJA_RAW_STALE_HOURS=72 之类的值，就能完全不联网重算。
const RAW_STALE_HOURS = Number(process.env.POE1_NINJA_RAW_STALE_HOURS || 0)
let rawCacheHits = 0
let rawStaleHits = 0
// 国服玩家习惯看到的联盟中文名，poe.ninja 只给英文
const LEAGUE_DISPLAY_NAME_MAP = { Allflame: '永火之咒', Mirage: '沙海幻境' }
const FRAME_RARITY = { Unique: 10, Rare: 2, Magic: 1, Normal: 0, Gem: 0, Quest: 0 }

// poe.ninja 角色详情里部位写在 itemData.inventoryId 上，实测取值是
// Helm / BodyArmour / Gloves / Boots / Weapon(2) / Offhand(2) / Quiver / Amulet /
// Ring(2) / Belt / Trinket / Flask / PassiveJewels 这一组，不带空格。
const SLOT_BY_PREFIX = [
  [/^helm/i, '头部'],
  [/^body/i, '胸甲'],
  [/^gloves/i, '手套'],
  [/^boots/i, '鞋子'],
  [/^weapon/i, '武器'],
  [/^offhand/i, '副手'],
  [/^quiver/i, '箭袋'],
  [/^amulet/i, '项链'],
  [/^ring/i, '戒指'],
  [/^trinket/i, '饰品'],
  [/^belt|^inventory1$/i, '腰带'],
  [/^flask/i, '药剂'],
  [/^jewel|^passivejewel|^jewellery/i, '珠宝'],
  [/^oracle|^pantheon/i, '特殊'],
]

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function resolveSlot(inventoryId) {
  const raw = String(inventoryId || '')
  const matched = SLOT_BY_PREFIX.find(([pattern]) => pattern.test(raw))
  return matched ? matched[1] : '其他'
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * poe.ninja 的 properties 是 { name, values: [[文本, 类型]] } 结构，
 * 直接塞进翻译函数会得到 "[object Object]" 显示给玩家。
 * 这里先还原成 "名称: 数值" 的一行文字，名字形如 [A|B] 的取 B。
 */
function statLineToText(line) {
  if (typeof line === 'string') return line
  if (!line || typeof line !== 'object') return ''
  const rawName = String(line.name || '')
  const bracket = rawName.match(/^\[[^|]+\|([^\]]+)\]$/)
  const name = bracket ? bracket[1] : rawName
  const values = (Array.isArray(line.values) ? line.values : [])
    .map(value => (Array.isArray(value) ? value[0] : value))
    .filter(item => item !== undefined && item !== null && item !== '')
    .join(' ')
  if (!name) return values
  return values ? `${name}: ${values}` : name
}

function translateMods(list) {
  return (Array.isArray(list) ? list : [])
    .map(line => translateStatText(statLineToText(line)) || '')
    .filter(line => line && line !== '[object Object]')
}

function mapItem(itemData, section, slot) {
  if (!itemData) return null
  const nameEn = itemData.name || itemData.baseType || ''
  const baseEn = itemData.baseType || ''
  const frameType = itemData.frameTypeId || ''
  const name = nameEn ? translateItemName(nameEn, baseEn, frameType) || nameEn : ''
  const baseType = baseEn ? translateBaseItem(baseEn) || baseEn : ''
  const typeLine = itemData.typeLine ? translateBaseItem(itemData.typeLine) || itemData.typeLine : ''
  const sockets = (Array.isArray(itemData.sockets) ? itemData.sockets : []).map((socket, index) => {
    const socketed = (Array.isArray(itemData.socketedItems) ? itemData.socketedItems : [])
      .find(gem => gem && Number(gem.socket) === index)
    const gemName = socketed ? socketed.baseType || socketed.name || '' : ''
    return {
      attr: socket.attr || socket.sColour || '',
      sColour: socket.sColour || socket.attr || '',
      group: toNumber(socket.group),
      linked: Boolean(socket.linkedGroup !== undefined || socket.group !== undefined),
      gem: gemName
        ? {
            name: translateSkill(gemName) || gemName,
            nameEn: gemName,
            icon: socketed.icon || '',
            level: toNumber(socketed.level)
          }
        : null
    }
  })
  return {
    slot,
    section,
    name: name || baseType || '未知装备',
    nameEn: nameEn || baseEn,
    typeLine: typeLine || baseType,
    typeLineEn: itemData.typeLine || baseEn,
    baseType: baseType || nameEn,
    baseTypeEn: baseEn || nameEn,
    rarity: FRAME_RARITY[frameType] === undefined ? toNumber(itemData.rarity) : FRAME_RARITY[frameType],
    icon: itemData.icon || '',
    corrupted: Boolean(itemData.corrupted),
    fractured: Boolean(itemData.fractured),
    sockets,
    properties: translateProperties(itemData.properties),
    implicitMods: translateMods(itemData.implicitMods),
    explicitMods: translateMods(itemData.explicitMods),
    craftedMods: translateMods(itemData.craftedMods),
    flavourText: Array.isArray(itemData.flavourText) ? itemData.flavourText.join(' ') : ''
  }
}

function collectGems(character) {
  const gems = []
  const seen = new Set()
  const groups = Array.isArray(character.skills) ? character.skills : []
  groups.forEach(group => {
    const list = Array.isArray(group.allGems) ? group.allGems : []
    list.forEach(gem => {
      const raw = gem && (gem.name || (gem.itemData && gem.itemData.baseType))
      if (!raw) return
      const translated = translateSkill(raw) || raw
      const key = `${translated}`
      if (seen.has(key)) return
      seen.add(key)
      gems.push({
        name: translated,
        nameEn: raw,
        icon: (gem.itemData && gem.itemData.icon) || '',
        level: toNumber(gem.level || (gem.itemData && gem.itemData.ilvl)),
        isSupport: isSupportGem(raw, translated)
      })
    })
  })
  return gems
}

function buildSkillGroups(character) {
  const groups = Array.isArray(character.skills) ? character.skills : []
  return groups.slice(0, 12).map((group, index) => ({
    id: `group-${index + 1}`,
    name: `链接 ${index + 1}`,
    slot: resolveSlot(group.itemSlot === undefined ? '' : `weapon${group.itemSlot}`),
    gems: (Array.isArray(group.allGems) ? group.allGems : []).slice(0, 8).map(gem => {
      const raw = (gem && (gem.name || (gem.itemData && gem.itemData.baseType))) || ''
      const translated = translateSkill(raw) || raw
      return {
        name: translated,
        nameEn: raw,
        icon: (gem.itemData && gem.itemData.icon) || '',
        isSupport: isSupportGem(raw, translated)
      }
    })
  }))
}

function buildStats(character) {
  const defensive = character.defensiveStats || {}
  const breakdowns = character.breakdowns || {}
  const stats = breakdowns.stats || {}
  const pick = (...keys) => {
    for (const key of keys) {
      const value = stats[key] !== undefined ? stats[key] : defensive[key]
      if (value !== undefined) return toNumber(value)
    }
    return 0
  }
  return {
    life: pick('life'),
    energyShield: pick('energyShield', 'energyshield'),
    mana: pick('mana'),
    armour: pick('armour'),
    evasion: pick('evasionRating', 'evasion'),
    movementSpeed: pick('movementSpeed'),
    dps: pick('totalDps', 'dps'),
    spellDps: pick('spellDps'),
    attackSpeed: pick('attackSpeed'),
    critChance: pick('critChance'),
    critMultiplier: pick('critMultiplier'),
    accuracy: pick('accuracy'),
    // 实测 poe.ninja 的抗性字段叫 fireResistance / chaosResistance…，
    // 之前按 fireResist 取一律取不到，小程序的抗性格子整排显示「-」
    fireResist: pick('fireResistance', 'fireResist'),
    coldResist: pick('coldResistance', 'coldResist'),
    lightningResist: pick('lightningResistance', 'lightningResist'),
    chaosResist: pick('chaosResistance', 'chaosResist')
  }
}

const DAMAGE_TYPE_LABELS = {
  physical: '物理',
  lightning: '闪电',
  cold: '冰霜',
  fire: '火焰',
  chaos: '混沌'
}

/**
 * 面板要直接能读的数字。
 *
 * 角色详情的 breakdowns 里 DPS/暴击这些键是内部编号，解不出含义；
 * 而榜单行本身就是 poe.ninja 网页上显示的那份文本（"3.7M"、"76%"、"2.61"），
 * 拿来当展示值最不容易出错。这里只做搬运和伤害类型归并，不做任何换算。
 */
function buildHeadline(row) {
  if (!row) return null
  const mix = Object.keys(DAMAGE_TYPE_LABELS)
    .map(key => ({ key, value: toNumber(row[`dps.${key}`]) }))
    .filter(item => item.value > 0)
    .sort((left, right) => right.value - left.value)
  return {
    dps: String(row['dps.total'] || ''),
    attackSpeed: String(row['rate.total'] || ''),
    critChance: String(row['critchance.total'] || ''),
    critMultiplier: String(row['critmulti.total'] || ''),
    accuracy: String(row['hitchance.total'] || ''),
    effectiveHealthPool: String(row.ehp__str || ''),
    mainDamageType: mix.length ? DAMAGE_TYPE_LABELS[mix[0].key] : ''
  }
}

/** 读一个角色的原始详情，命中本地缓存就不请求上游 */
async function loadCharacterRaw(info, row) {
  // key 不带快照版本号：版本号一天滚好几次，带上它等于每天首次运行全部落空，
  // 而「补译名、改字段映射」根本不该联网。版本改存在文件里，读的时候再判断能不能用。
  const key = `${String(row.account).replace(/[^\w-]/g, '_')}_${String(row.name).replace(/[^\w-]/g, '_')}`.slice(0, 180)
  const file = path.join(RAW_CACHE_DIR, `${key}.json`)
  if (USE_RAW_CACHE && fs.existsSync(file)) {
    try {
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (entry && entry.payload) {
        const ageHours = entry.capturedAt ? (Date.now() - Date.parse(entry.capturedAt)) / 3600000 : Infinity
        const sameSnapshot = entry.version === info.version
        if (sameSnapshot || (RAW_STALE_HOURS > 0 && ageHours <= RAW_STALE_HOURS)) {
          rawCacheHits += 1
          if (!sameSnapshot) rawStaleHits += 1
          return { payload: entry.payload, fromCache: true }
        }
      }
    } catch (error) {
      console.warn(`      ⚠️ 原始缓存损坏，改为重新抓取 ${row.name}: ${error.message}`)
    }
  }
  const payload = await getCharacter('poe1', { info, account: row.account, name: row.name })
  try {
    fs.mkdirSync(RAW_CACHE_DIR, { recursive: true })
    fs.writeFileSync(file, JSON.stringify({
      version: info.version,
      capturedAt: new Date().toISOString(),
      payload
    }))
  } catch (error) {
    console.warn(`      ⚠️ 原始缓存写入失败（不影响产物）: ${error.message}`)
  }
  return { payload, fromCache: false }
}

/**
 * 上游给的是内部标识 "PassiveTree-3.29"，直接显示到界面上就是一串代码名。
 * 能认出「哪个版本的天赋树」就翻成人话，认不出就留空，让界面显示「天赋树」。
 */
function describePassiveTree(rawName) {
  const match = String(rawName || '').match(/^(?:PassiveTree|Tree)[-_ ](\d+\.\d+)/i)
  return match ? `${match[1]} 版天赋树` : ''
}

function mapCharacterToBuild(character, meta) {
  const accountRaw = character.account || meta.account || ''
  const name = character.name || meta.name || ''
  const classNameEn = character.ascendancyClassName || character.class || meta.class || ''
  const gems = collectGems(character)
  const mainGem = gems.find(gem => !gem.isSupport) || gems[0] || null
  // 部位优先用 itemData.inventoryId；entry.itemSlot 是数字枚举，直接拿去匹配前缀会全部落到「其他」
  const slotOf = entry => resolveSlot((entry && entry.itemData && entry.itemData.inventoryId) || (entry && entry.itemSlot))
  const equipment = (Array.isArray(character.items) ? character.items : [])
    .map(entry => mapItem(entry.itemData, '装备', slotOf(entry)))
    .filter(Boolean)
  const flasks = (Array.isArray(character.flasks) ? character.flasks : [])
    .map(entry => mapItem(entry.itemData, '药剂', slotOf(entry)))
    .filter(Boolean)
  const jewels = (Array.isArray(character.jewels) ? character.jewels : [])
    .map(entry => mapItem(entry.itemData, '珠宝', slotOf(entry)))
    .filter(Boolean)
  const keyPassives = (Array.isArray(character.keyStones) ? character.keyStones : []).slice(0, 12).map(keystone => ({
    name: translateKeyPassive(keystone.name) || keystone.name,
    nameEn: keystone.name,
    icon: keystone.icon || ''
  }))

  return {
    id: `${accountRaw.replace(/[#\s]/g, '_')}-${name}`,
    rank: meta.rank,
    classRank: meta.rank,
    character: name,
    account: accountRaw,
    level: toNumber(character.level || meta.level),
    className: translateClass(classNameEn) || classNameEn,
    classNameEn,
    baseClassNameEn: character.baseClass || '',
    leagueName: meta.leagueName,
    mainSkill: mainGem ? mainGem.name : '',
    mainSkillEn: mainGem ? mainGem.nameEn : '',
    mainSkillIcon: mainGem ? mainGem.icon : '',
    skills: gems.filter(gem => !gem.isSupport).slice(0, 6).map(gem => gem.name),
    skillGems: gems.slice(0, 18),
    skillGroups: buildSkillGroups(character),
    keyPassives,
    stats: buildStats(character),
    headline: buildHeadline(meta.row),
    summary: `${meta.leagueName} 天梯 ${classNameEn} 第 ${meta.rank} 名`,
    sourceUrl: `https://poe.ninja/poe1/builds/${meta.leagueUrl}/character/${encodeURIComponent(accountRaw)}/${encodeURIComponent(name)}`,
    equipment,
    flasks,
    jewels,
    itemCount: equipment.length + flasks.length + jewels.length,
    detailAvailable: true,
    detailSections: ['装备', '技能', '天赋'],
    passiveNodeCount: Array.isArray(character.passiveSelection) ? character.passiveSelection.length : 0,
    // 天赋树指纹：截图步骤靠它判断"这棵树和上次一样"，从而跳过开浏览器
    passiveTreeHash: passiveTreeHash(character),
    passiveTreeName: describePassiveTree(character.passiveTreeName),
    passiveTreeUrl: '',
    // 天赋树截图由 capture_passive_trees 那一步补，这里先留空，不写假引用
    passiveTreeImage: '',
    hasPathOfBuilding: Boolean(character.pathOfBuildingExport),
    // 上游数据新鲜度：poe.ninja 记录角色最后一次上传 BD 的时间，可以直接给玩家看
    buildUpdatedUtc: character.updatedUtc || '',
    lastSeenUtc: character.lastSeenUtc || '',
    secondaryAscendancy: character.secondaryAscendancyClassName
      ? translateClass(character.secondaryAscendancyClassName)
      : ''
  }
}

// 摘要里只保留列表页真正要用的字段：词条明细（properties/mods/sockets）、药剂、珠宝、
// 关键天赋、面板数值全部放进 poe1_builds/{id}.json，玩家点进 BD 详情才拉。
// 装备与技能名必须留在摘要里——天梯页的「装备查 BD / 技能查 BD」索引是前端从 builds 算出来的。
// skillGems 不放：技能索引只读 skills + skillGroups，留一份等于同一批名字存两遍。
const LIGHT_ITEM_FIELDS = ['slot', 'name', 'nameEn', 'typeLine', 'rarity', 'icon']
const LIGHT_GEM_FIELDS = ['name', 'nameEn', 'icon', 'isSupport']

function pickFields(record, fields) {
  const output = {}
  fields.forEach(field => {
    const value = record ? record[field] : undefined
    output[field] = value === undefined ? '' : value
  })
  return output
}

function summarizeBuild(build) {
  // 技能组在详情里是按链接组存的，同一个宝石会在多个组里重复出现；
  // 而前端「技能查 BD」索引是按宝石名去重的，重复项一点用没有，却占了摘要一半以上体积。
  // 所以摘要里压成一组去重后的宝石，索引结果不变。
  const uniqueGems = []
  const seenGems = new Set()
  ;(Array.isArray(build.skillGroups) ? build.skillGroups : []).forEach(group => {
    ;(Array.isArray(group.gems) ? group.gems : []).forEach(gem => {
      const light = pickFields(gem, LIGHT_GEM_FIELDS)
      const key = light.name || light.nameEn
      if (!key || seenGems.has(key)) return
      seenGems.add(key)
      uniqueGems.push(light)
    })
  })
  return {
    id: build.id,
    rank: build.rank,
    classRank: build.classRank,
    character: build.character,
    account: build.account,
    level: build.level,
    className: build.className,
    classNameEn: build.classNameEn,
    leagueName: build.leagueName,
    mainSkill: build.mainSkill,
    mainSkillEn: build.mainSkillEn,
    mainSkillIcon: build.mainSkillIcon,
    skills: build.skills,
    equipment: (Array.isArray(build.equipment) ? build.equipment : []).map(item => pickFields(item, LIGHT_ITEM_FIELDS)),
    skillGroups: uniqueGems.length ? [{ slot: '技能', gems: uniqueGems }] : [],
    itemCount: build.itemCount,
    detailAvailable: build.noDetail ? false : true,
    detailFile: build.noDetail ? '' : detailFileName(build.id),
    buildUpdatedUtc: build.buildUpdatedUtc
  }
}

function buildPopularSkills(builds) {
  const counter = new Map()
  builds.forEach(build => {
    const name = build.mainSkill || build.mainSkillEn
    if (!name) return
    const record = counter.get(name) || { name, nameEn: build.mainSkillEn, icon: build.mainSkillIcon, count: 0 }
    record.count += 1
    counter.set(name, record)
  })
  return Array.from(counter.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, 12)
    .map(item => ({ ...item, id: `skill:${item.name}`, type: 'skill' }))
}

async function main() {
  const league = process.env.POE1_NINJA_LEAGUE || undefined
  const info = await resolveLeague('poe1', { league })
  const leagueName = LEAGUE_DISPLAY_NAME_MAP[info.name] || info.name
  // 职业名单来自榜单自带的 class 字典：写死的名单会漏掉没选进阶的角色（实测少 25% 人）
  let classes = (await getClassNames('poe1', { info })).names
  // 只想快速验证一个职业时用它，不必等整轮 28 个职业跑完
  const only = (process.env.POE1_NINJA_CLASSES || '').split(',').map(item => item.trim()).filter(Boolean)
  if (only.length) classes = classes.filter(name => only.includes(name))
  console.log(`[poe1-ladder] 联赛 ${info.name}(${info.url}) 显示名 ${leagueName} version=${info.version}`)
  console.log(`[poe1-ladder] 职业 ${classes.length} 个，每职业摘要 ${PER_CLASS} 名、详情 ${DETAIL_PER_CLASS} 名`)

  fs.mkdirSync(path.join(OUTPUT_DIR, BUILD_DIR_NAME), { recursive: true })

  const leagueTotal = (await searchBuilds('poe1', { info, limit: 1 })).total || 0
  const summaries = []
  const classStats = []
  let detailFailed = 0

  for (const className of classes) {
    const listed = await searchBuilds('poe1', { info, clazz: className, limit: Math.max(PER_CLASS, DETAIL_PER_CLASS) })
    const picked = listed.rows.slice(0, Math.max(PER_CLASS, DETAIL_PER_CLASS))
    classStats.push({ name: className, nameEn: className, total: listed.total, fetched: picked.length })
    console.log(`   ${className.padEnd(16)} 榜单 ${String(listed.total).padStart(6)} 人，取 ${picked.length} 人`)

    for (let index = 0; index < picked.length; index += 1) {
      const row = picked[index]
      if (index >= DETAIL_PER_CLASS) {
        summaries.push(summarizeBuild({
          id: `${String(row.account || '').replace(/[#\s]/g, '_')}-${row.name}`,
          rank: index + 1,
          classRank: index + 1,
          character: row.name,
          account: row.account,
          level: toNumber(row.level),
          className: translateClass(className) || className,
          classNameEn: className,
          leagueName,
          mainSkill: '',
          mainSkillEn: '',
          mainSkillIcon: '',
          skills: [],
          itemCount: 0,
          passiveNodeCount: 0,
          buildUpdatedUtc: '',
          stats: {},
          // 只上榜、没抓详情的角色不写 detailFile，前端点了会 404
          noDetail: true
        }))
        continue
      }
      try {
        const { payload: character } = await loadCharacterRaw(info, row)
        const build = mapCharacterToBuild(character, {
          rank: index + 1,
          account: row.account,
          name: row.name,
          level: row.level,
          class: className,
          row,
          leagueName,
          leagueUrl: info.url
        })
        fs.writeFileSync(
          path.join(OUTPUT_DIR, detailFileName(build.id)),
          // 缩进版会胖三成以上，这是给手机读的，直接压成一行
          `${JSON.stringify(build)}\n`,
          'utf8'
        )
        summaries.push(summarizeBuild(build))
      } catch (error) {
        // 上游进入限流冷却时立刻停手：继续打只会延长封禁，
        // 而且半套产物传上去会覆盖线上完整数据。
        if (error.rateLimited) throw error
        detailFailed += 1
        console.warn(`      ⚠️ ${row.account}/${row.name} 详情抓取失败: ${String(error.message).slice(0, 70)}`)
      }
      await wait(REQUEST_GAP_MS)
    }
    await wait(REQUEST_GAP_MS)
  }

  const totalCharacters = classStats.reduce((sum, item) => sum + item.total, 0)
  if (!only.length && leagueTotal && totalCharacters < leagueTotal * 0.95) {
    // 职业名单写死在 games.js，上游加新职业时这里先响，而不是静默漏掉一批玩家
    console.warn(
      `   ⚠️ 职业名单可能过期：已覆盖 ${totalCharacters}/${leagueTotal}，` +
        `请检查 crawlers/shared/ninja/games.js 的 poe1.classes`
    )
  }
  const digest = {
    schemaVersion: '3',
    updatedAt: new Date().toISOString(),
    source: 'poe.ninja',
    league: { name: info.name, url: info.url, displayName: leagueName, snapshotName: info.snapshotName },
    snapshotName: info.url,
    totalCharacters,
    classes: classStats,
    builds: (() => {
      // 榜单是按职业分别取前几名的，直接沿用职业内名次会出现一排「第 1 名」。
      // rank 改成整份摘要里的唯一序号（玩家看到的是列表顺序），职业内名次留在 classRank。
      const ordered = summaries.sort((left, right) => left.classRank - right.classRank)
      ordered.forEach((build, index) => {
        build.rank = index + 1
      })
      return ordered
    })(),
    popularSkills: buildPopularSkills(summaries)
  }

  if (!summaries.length) throw new Error('未抓到任何角色，拒绝写出空产物')

  fs.writeFileSync(path.join(OUTPUT_DIR, 'ladder_digest.json'), `${JSON.stringify(digest)}\n`, 'utf8')
  const digestBytes = fs.statSync(path.join(OUTPUT_DIR, 'ladder_digest.json')).size
  console.log(`[poe1-ladder] 摘要 ${summaries.length} 条，${(digestBytes / 1024).toFixed(0)} KB；详情失败 ${detailFailed} 个`)
  console.log(`[poe1-ladder] 原始详情缓存命中 ${rawCacheHits}/${summaries.length}${rawStaleHits ? `（其中跨快照 ${rawStaleHits}）` : ''}`)
  console.log(`[poe1-ladder] 输出目录: ${OUTPUT_DIR}`)
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ 流放1 天梯抓取失败:', error.message)
    process.exitCode = 1
  })
}

module.exports = { summarizeBuild, buildPopularSkills, mapCharacterToBuild }
