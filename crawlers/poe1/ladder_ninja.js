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
const {
  translateClass,
  translateSkill,
  translateItemName,
  translateBaseItem,
  translateKeyPassive,
  translateStatText
} = require('./translations')

const ROOT = path.join(__dirname, '../..')
const env = process.env.POE1_NINJA_GAME === 'dev' ? 'dev' : 'release'
const OUTPUT_DIR = process.env.POE1_NINJA_OUTPUT_DIR
  ? path.resolve(process.env.POE1_NINJA_OUTPUT_DIR)
  : path.join(ROOT, 'translated-data/poe1', env, 'miniprogram_data')
const BUILD_DIR_NAME = 'poe1_builds'
// 每职业 6 条：28 个职业约 168 条，摘要压到 1MB 上下（换源前是 3.7MB，且其中 206 条根本没有详情）。
// 想加样本量用 POE1_NINJA_PER_CLASS 覆盖，注意详情是按条串行抓的，翻倍就多花一倍时间。
const PER_CLASS = Number(process.env.POE1_NINJA_PER_CLASS || 6)
const DETAIL_PER_CLASS = Number(process.env.POE1_NINJA_DETAIL || PER_CLASS)
const REQUEST_GAP_MS = 120
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

function translateMods(list) {
  return (Array.isArray(list) ? list : [])
    .map(line => translateStatText(line) || '')
    .filter(Boolean)
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
    properties: translateMods(itemData.properties),
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
        isSupport: /（辅）|\(support\)/i.test(translated) || /support$/i.test(raw)
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
        isSupport: /（辅）|\(support\)/i.test(translated) || /support$/i.test(raw)
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
    summary: `${meta.leagueName} 天梯 ${classNameEn} 第 ${meta.rank} 名`,
    sourceUrl: `https://poe.ninja/poe1/builds/${meta.leagueUrl}/character/${encodeURIComponent(accountRaw)}/${encodeURIComponent(name)}`,
    equipment,
    flasks,
    jewels,
    itemCount: equipment.length + flasks.length + jewels.length,
    detailAvailable: true,
    detailSections: ['装备', '技能', '天赋'],
    passiveNodeCount: Array.isArray(character.passiveSelection) ? character.passiveSelection.length : 0,
    passiveTreeName: character.passiveTreeName || '',
    passiveTreeUrl: '',
    // 天赋树截图由 capture_passive_trees 那一步补，这里先留空，不写假引用
    passiveTreeImage: '',
    hasPathOfBuilding: Boolean(character.pathOfBuildingExport),
    // 上游数据新鲜度：poe.ninja 记录角色最后一次上传 BD 的时间，可以直接给玩家看
    buildUpdatedUtc: character.updatedUtc || '',
    lastSeenUtc: character.lastSeenUtc || '',
    secondaryAscendancy: character.secondaryAscendancyClassName || ''
  }
}

// 摘要里只保留列表页真正要用的字段：词条明细（properties/mods/sockets）、药剂、珠宝、
// 关键天赋、面板数值全部放进 poe1_builds/{id}.json，玩家点进 BD 详情才拉。
// 装备与技能名必须留在摘要里——天梯页的「装备查 BD / 技能查 BD」索引是前端从 builds 算出来的。
// skillGems 不放：技能索引只读 skills + skillGroups，留一份等于同一批名字存两遍。
const LIGHT_ITEM_FIELDS = ['slot', 'name', 'nameEn', 'typeLine', 'baseType', 'rarity', 'icon']
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
    skillGroups: (Array.isArray(build.skillGroups) ? build.skillGroups : []).map(group => ({
      slot: group.slot || group.name || '',
      gems: (Array.isArray(group.gems) ? group.gems : []).map(gem => pickFields(gem, LIGHT_GEM_FIELDS))
    })),
    itemCount: build.itemCount,
    detailAvailable: build.noDetail ? false : true,
    detailFile: build.noDetail ? '' : `${BUILD_DIR_NAME}/${encodeURIComponent(build.id)}.json`,
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
  const { names: classes } = await getClassNames('poe1', { info })
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
        const character = await getCharacter('poe1', {
          info,
          account: row.account,
          name: row.name
        })
        const build = mapCharacterToBuild(character, {
          rank: index + 1,
          account: row.account,
          name: row.name,
          level: row.level,
          class: className,
          leagueName,
          leagueUrl: info.url
        })
        fs.writeFileSync(
          path.join(OUTPUT_DIR, BUILD_DIR_NAME, `${encodeURIComponent(build.id)}.json`),
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
  if (leagueTotal && totalCharacters < leagueTotal * 0.95) {
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
    builds: summaries.sort((left, right) => left.classRank - right.classRank),
    popularSkills: buildPopularSkills(summaries)
  }

  if (!summaries.length) throw new Error('未抓到任何角色，拒绝写出空产物')

  fs.writeFileSync(path.join(OUTPUT_DIR, 'ladder_digest.json'), `${JSON.stringify(digest)}\n`, 'utf8')
  const digestBytes = fs.statSync(path.join(OUTPUT_DIR, 'ladder_digest.json')).size
  console.log(`[poe1-ladder] 摘要 ${summaries.length} 条，${(digestBytes / 1024).toFixed(0)} KB；详情失败 ${detailFailed} 个`)
  console.log(`[poe1-ladder] 输出目录: ${OUTPUT_DIR}`)
}

main().catch(error => {
  console.error('❌ 流放1 天梯抓取失败:', error.message)
  process.exitCode = 1
})
