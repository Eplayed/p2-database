const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const isProd = process.env.NODE_ENV === 'production'
const DATA_DIR = path.join(ROOT, 'translated-data', isProd ? 'release' : 'dev')
const OUTPUT_FILE = path.join(DATA_DIR, 'miniprogram_data', 'ladder_build_index.json')
const DETAIL_DIR_NAME = 'ladder_build_details'
const GEMS_FILE = path.join(ROOT, 'base-data', 'gems.json')
const UNIQUE_FILE = path.join(ROOT, 'base-data', 'unique_item.json')

const stableKey = value => String(value || '').trim().toLowerCase()
const lookupKey = value => stableKey(value).replace(/[^a-z0-9]/g, '')
const createId = (prefix, value) => `${prefix}_${crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)}`
const roundPercent = value => Math.round(value * 10) / 10

const increment = (map, key, value) => {
  if (!key) return
  const current = map.get(key)
  if (current) current.count += 1
  else map.set(key, { ...value, count: 1 })
}

const top = (map, limit) => Array.from(map.values())
  .sort((a, b) => b.count - a.count || String(a.name || '').localeCompare(String(b.name || '')))
  .slice(0, limit)

const getActiveSkillGroups = player => {
  const result = []
  for (const group of Array.isArray(player && player.skills) ? player.skills : []) {
    const gems = Array.isArray(group && group.gems) ? group.gems : []
    const supports = gems.filter(gem => gem && gem.name && gem.isSupport === true)
    for (const active of gems.filter(gem => gem && gem.name && gem.isSupport === false)) {
      result.push({ active, supports })
    }
  }
  return result
}

const createTranslationMap = items => new Map(
  (Array.isArray(items) ? items : [])
    .filter(item => item && item.en && item.cn)
    .map(item => [lookupKey(item.en), item.cn])
)

const translateName = (name, originalName, translationMap) => {
  const translated = translationMap && translationMap.get(lookupKey(originalName || name))
  return translated || name || originalName || ''
}

const addPlayer = (entry, player) => {
  const key = `${player.account}\u0000${player.name}`
  if (entry.playerKeys.has(key)) return false
  entry.playerKeys.add(key)
  entry.players.push(player)
  return true
}

const buildLadderBuildIndex = ({
  playerDetails,
  classesData = [],
  updatedAt = '',
  skillTranslations = new Map(),
  equipmentTranslations = new Map()
}) => {
  const details = Array.isArray(playerDetails) ? playerDetails.filter(Boolean) : []
  if (!details.length) throw new Error('无法生成技能/装备查BD索引：玩家详情为空')

  const classNames = new Map(classesData.map(item => [item.name, item.displayName || item.name]))
  const skillMap = new Map()
  const equipmentMap = new Map()

  for (const detail of details) {
    const info = detail.info || {}
    const player = {
      name: info.name || '',
      account: info.account || '',
      className: info.class || 'Unknown',
      classDisplayName: classNames.get(info.class) || info.class || 'Unknown',
      level: Number(info.level) || 0
    }
    if (!player.name || !player.account) continue

    const playerSkills = new Map()
    for (const group of getActiveSkillGroups(detail)) {
      const active = group.active
      const key = stableKey(active.originalName || active.name)
      if (!key) continue
      let entry = skillMap.get(key)
      if (!entry) {
        entry = {
          id: createId('skill', key), name: translateName(active.name, active.originalName, skillTranslations),
          originalName: active.originalName || active.name, icon: active.icon || '',
          playerKeys: new Set(), players: [], classes: new Map(), supports: new Map()
        }
        skillMap.set(key, entry)
      }
      if (addPlayer(entry, player)) {
        increment(entry.classes, player.className, {
          name: player.className,
          displayName: player.classDisplayName
        })
      }
      playerSkills.set(key, active)
      const seenSupports = new Set()
      for (const support of group.supports) {
        const supportKey = stableKey(support.originalName || support.name)
        if (!supportKey || seenSupports.has(supportKey)) continue
        seenSupports.add(supportKey)
        increment(entry.supports, supportKey, {
          name: translateName(support.name, support.originalName, skillTranslations),
          originalName: support.originalName || support.name,
          icon: support.icon || ''
        })
      }
    }

    const seenEquipment = new Set()
    for (const item of Array.isArray(detail.equipment) ? detail.equipment : []) {
      if (!item || item.rarity !== 3 || !item.name) continue
      const key = stableKey(item.originalName || item.name)
      if (!key || seenEquipment.has(key)) continue
      seenEquipment.add(key)
      let entry = equipmentMap.get(key)
      if (!entry) {
        entry = {
          id: createId('equipment', key), name: translateName(item.name, item.originalName, equipmentTranslations),
          originalName: item.originalName || item.name, icon: item.icon || '',
          slots: new Set(), playerKeys: new Set(), players: [], classes: new Map(), skills: new Map()
        }
        equipmentMap.set(key, entry)
      }
      if (item.slot) entry.slots.add(item.slot)
      if (addPlayer(entry, player)) {
        increment(entry.classes, player.className, {
          name: player.className,
          displayName: player.classDisplayName
        })
        for (const [skillKey, skill] of playerSkills) {
          increment(entry.skills, skillKey, {
            name: translateName(skill.name, skill.originalName, skillTranslations),
            originalName: skill.originalName || skill.name,
            icon: skill.icon || ''
          })
        }
      }
    }
  }

  const totalPlayers = details.length
  const players = entry => entry.players
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
    .slice(0, 12)
  const skills = Array.from(skillMap.values()).map(entry => ({
    id: entry.id, name: entry.name, originalName: entry.originalName, icon: entry.icon,
    count: entry.playerKeys.size,
    percent: roundPercent(entry.playerKeys.size / totalPlayers * 100),
    classes: top(entry.classes, 6), supportSkills: top(entry.supports, 8), players: players(entry)
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const equipment = Array.from(equipmentMap.values()).map(entry => ({
    id: entry.id, name: entry.name, originalName: entry.originalName, icon: entry.icon,
    count: entry.playerKeys.size,
    percent: roundPercent(entry.playerKeys.size / totalPlayers * 100),
    slots: Array.from(entry.slots), classes: top(entry.classes, 6),
    relatedSkills: top(entry.skills, 8), players: players(entry)
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return { version: 1, updatedAt: updatedAt || new Date().toISOString(), totalPlayers, skills, equipment }
}

const writeLadderBuildIndex = (output, outputFile = OUTPUT_FILE) => {
  const outputDir = path.dirname(outputFile)
  const detailDir = path.join(outputDir, DETAIL_DIR_NAME)
  fs.mkdirSync(outputDir, { recursive: true })
  fs.rmSync(detailDir, { recursive: true, force: true })
  fs.mkdirSync(detailDir, { recursive: true })

  const detailPath = id => `miniprogram_data/${DETAIL_DIR_NAME}/${id}.json`
  const skills = output.skills.map(({ players, supportSkills, ...item }) => {
    fs.writeFileSync(
      path.join(detailDir, `${item.id}.json`),
      JSON.stringify({ ...item, type: 'skill', supportSkills, players }),
      'utf8'
    )
    return { ...item, classes: item.classes.slice(0, 3), detailPath: detailPath(item.id) }
  })
  const equipment = output.equipment.map(({ players, relatedSkills, ...item }) => {
    fs.writeFileSync(
      path.join(detailDir, `${item.id}.json`),
      JSON.stringify({ ...item, type: 'equipment', relatedSkills, players }),
      'utf8'
    )
    return { ...item, classes: item.classes.slice(0, 3), detailPath: detailPath(item.id) }
  })
  const catalog = {
    version: output.version,
    updatedAt: output.updatedAt,
    totalPlayers: output.totalPlayers,
    skills,
    equipment
  }
  fs.writeFileSync(outputFile, JSON.stringify(catalog), 'utf8')
  return catalog
}

const loadJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const loadTranslationMaps = () => ({
  skillTranslations: fs.existsSync(GEMS_FILE) ? createTranslationMap(loadJson(GEMS_FILE)) : new Map(),
  equipmentTranslations: fs.existsSync(UNIQUE_FILE) ? createTranslationMap(loadJson(UNIQUE_FILE)) : new Map()
})
const buildFromCurrentData = () => {
  const playerDir = path.join(DATA_DIR, 'players')
  if (!fs.existsSync(playerDir)) throw new Error(`玩家目录不存在: ${playerDir}`)
  const playerDetails = fs.readdirSync(playerDir)
    .filter(file => file.endsWith('.json'))
    .map(file => loadJson(path.join(playerDir, file)))
  const classesFile = path.join(DATA_DIR, 'classes.json')
  const ladderFile = path.join(DATA_DIR, 'all_ladders_translated.json')
  const translations = loadTranslationMaps()
  const output = buildLadderBuildIndex({
    playerDetails,
    classesData: fs.existsSync(classesFile) ? loadJson(classesFile) : [],
    updatedAt: fs.existsSync(ladderFile) ? loadJson(ladderFile).updateTime : '',
    ...translations
  })
  const catalog = writeLadderBuildIndex(output, OUTPUT_FILE)
  console.log(`技能/装备查BD索引: ${OUTPUT_FILE}`)
  console.log(`  玩家 ${catalog.totalPlayers} · 技能 ${catalog.skills.length} · 传奇装备 ${catalog.equipment.length}`)
  return catalog
}

if (require.main === module) {
  try { buildFromCurrentData() } catch (error) { console.error(error.message); process.exit(1) }
}

module.exports = {
  buildLadderBuildIndex,
  buildFromCurrentData,
  createTranslationMap,
  getActiveSkillGroups,
  loadTranslationMaps,
  writeLadderBuildIndex
}
