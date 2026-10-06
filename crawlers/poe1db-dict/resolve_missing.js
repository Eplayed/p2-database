#!/usr/bin/env node
/**
 * 补齐列表页没覆盖到的流放1 中文名。
 *
 * 列表页字典（index.js）会漏掉两类名字：刚出新还没进总表的东西，
 * 以及带变体前缀的名字（Foulborn / Replica）。这里按名字直接查资料站的
 * 单件页面，从页面标题取中文名，写进 dict_supplement.json。
 *
 * 只写资料站实际给出的名字：查不到就原样留着英文，不做任何逐词硬造翻译。
 * 唯一的合成规则来自项目里已有的校对结果（见 ITEM_NAME_PREFIXES 注释）。
 *
 * 用法：
 *   node crawlers/poe1db-dict/resolve_missing.js --dir=/tmp/poe1-shadow
 *   node crawlers/poe1db-dict/resolve_missing.js --limit=50
 */

const fs = require('fs')
const path = require('path')
const { fetchWithRetry } = require('../shared/wikiDict/http_client')
const { BASE_URL } = require('./pages')
const {
  translateSkill,
  translateBaseItem,
  translateItemName,
  translateClass,
  translateKeyPassive
} = require('../poe1/translations')

const OUTPUT_FILE = path.join(__dirname, '../../base-data/dist/poe1/dict_supplement.json')
const HAS_CN = /[一-龥]/

/**
 * 变体前缀的中文写法。
 * Foulborn 取自本项目人工校对表里已有的对应（'Foulborn Uul-Netol's Kiss' → '污秽乌尔尼多之吻'），
 * Replica 取自资料站自己的标题写法（Replica Dragonfang's Flight → 龙牙之翔【仿品】）。
 * 表里没有的前缀一律不合成，避免把猜的当译名用。
 */
const ITEM_NAME_PREFIXES = [
  { en: /^Foulborn\s+/i, cn: '污秽', place: 'front' },
  { en: /^Replica\s+/i, cn: '【仿品】', place: 'back' }
]

const dirArg = process.argv.find(arg => arg.startsWith('--dir='))
const DATA_DIR = dirArg
  ? path.resolve(dirArg.split('=')[1])
  : path.join(__dirname, '../../translated-data/poe1/release/miniprogram_data')
const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity

/**
 * 词缀行开头的机制/天赋名词，例如「Intangibility: 7% …」「Memory Strands: 16」。
 * 这类词在资料站有关键词页，取到就能让整行不再是半英半中。
 */
const KEYWORD_HEAD = /^([A-Z][A-Za-z'’-]*(?:[ ]+[A-Z][A-Za-z'’-]*){0,2})[ ]*[:：]/

function collectKeyword(text, sink) {
  const match = KEYWORD_HEAD.exec(String(text || '').trim())
  if (!match) return
  const phrase = match[1].trim()
  if (!/[A-Za-z]{3}/.test(phrase)) return
  sink.add(phrase)
}

function readBuilds() {
  const buildDir = path.join(DATA_DIR, 'poe1_builds')
  if (fs.existsSync(buildDir)) {
    return fs.readdirSync(buildDir)
      .filter(name => name.endsWith('.json'))
      .map(name => JSON.parse(fs.readFileSync(path.join(buildDir, name), 'utf8')))
  }
  const digest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ladder_digest.json'), 'utf8'))
  return Array.isArray(digest.builds) ? digest.builds : []
}

function slugVariants(name) {
  const raw = String(name || '').trim()
  // 瓦尔宝石会带一个括号说明具体变种（Vaal Lightning Strike (Lightning Strike of Arcing)），
  // 资料站没有变种页，退到父技能名至少能给出「瓦尔：闪电箭」而不是整串英文。
  // 必须在把空格换成下划线之前剥括号，否则括号前是 "_" ，正则永远匹配不上。
  const noParen = raw.replace(/\s*\([^)]*\)/, '').trim()
  const variants = [raw, noParen]
    .flatMap(value => [value, value.replace(/[’'`´]/g, '')])
    .map(value => value.replace(/\s+/g, '_'))
    .filter(Boolean)
  return Array.from(new Set(variants))
}

/** 从 "中文名 基础类型 - 流亡编年史…" 里取出物品名；纯中文尾巴且还有前段才当基础类型丢掉 */
function parseTitleCnName(title) {
  const head = String(title || '').split(' - 流亡编年史')[0].trim()
  if (!head || !HAS_CN.test(head)) return ''
  const parts = head.split(/\s+/)
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1]
    const rest = parts.slice(0, -1).join(' ')
    if (HAS_CN.test(tail) && !/[A-Za-z0-9]/.test(tail) && HAS_CN.test(rest)) return rest
  }
  return head
}

async function resolveByPage(name) {
  for (const slug of slugVariants(name)) {
    const url = `${BASE_URL}/${encodeURIComponent(slug)}`
    let html = ''
    try {
      html = await fetchWithRetry(url, 1)
    } catch (error) {
      continue
    }
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]
    const cn = parseTitleCnName(title)
    if (cn) return { cn, page: slug }
  }
  return null
}

/** 资料站没有变体页时，用前缀表把基础名的中文拼出来 */
async function resolveWithKnownPrefix(name, cache) {
  for (const prefix of ITEM_NAME_PREFIXES) {
    const stripped = String(name).replace(prefix.en, '').trim()
    if (!stripped || stripped === name) continue
    const base = cache.get(stripped) || (await resolveMissingName(stripped, cache))
    if (!base) return null
    const cn = prefix.place === 'front' ? `${prefix.cn}${base}` : `${base}${prefix.cn}`
    return { cn, page: `prefix:${prefix.en.source}` }
  }
  return null
}

const cache = new Map()

async function resolveMissingName(name, store) {
  const target = store || cache
  if (target.has(name)) return target.get(name)
  let hit = await resolveByPage(name)
  if (!hit) hit = await resolveWithKnownPrefix(name, target)
  const cn = hit ? hit.cn : ''
  target.set(name, cn)
  return cn
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) throw new Error(`找不到天梯产物目录: ${DATA_DIR}`)
  const builds = readBuilds()
  const gemNames = new Set()
  const itemNames = new Set()
  const baseNames = new Set()
  const classNames = new Set()
  const passiveNames = new Set()
  const keywordNames = new Set()

  builds.forEach(build => {
    // 职业名和副升华血脉名：资料站的升华职业页 / 血脉职业页都有官方写法
    if (build.classNameEn && !HAS_CN.test(build.className || '')) classNames.add(build.classNameEn)
    if (build.secondaryAscendancy && !HAS_CN.test(build.secondaryAscendancy)) {
      classNames.add(build.secondaryAscendancy)
    }
    ;(build.keyPassives || []).forEach(keystone => {
      const en = keystone.nameEn || keystone.name
      if (en && !HAS_CN.test(keystone.name || '')) passiveNames.add(en)
    })
    ;(build.skillGems || []).forEach(gem => {
      if (gem.nameEn && !HAS_CN.test(gem.name || '')) gemNames.add(gem.nameEn)
    })
    ;(build.skillGroups || []).forEach(group => (group.gems || []).forEach(gem => {
      if (gem.nameEn && !HAS_CN.test(gem.name || '')) gemNames.add(gem.nameEn)
    }))
    ;['equipment', 'flasks', 'jewels'].forEach(key => (build[key] || []).forEach(item => {
      // 基础类型（珠宝、药剂这类）是固定名词，缺了就整批漏；先补它，收益比随机稀有词高得多
      const baseEn = item.baseTypeEn || item.typeLineEn
      if (baseEn && !HAS_CN.test(item.baseType || item.typeLine || '')) baseNames.add(baseEn)
      ;[].concat(item.explicitMods || [], item.implicitMods || [], item.craftedMods || [], item.properties || [])
        .forEach(line => collectKeyword(line, keywordNames))
      const en = item.nameEn
      if (!en || HAS_CN.test(item.name || '')) return
      // 稀有装备的名字是随机前缀+后缀，属于外观词，资料站没有对应页面；
      // 只补传奇名，稀有名交给词表处理
      if (Number(item.rarity) !== 10) return
      itemNames.add(en)
    }))
  })

  // 再用当前字典判一次，避免把已经能翻出来的名字重复抓
  Array.from(gemNames).forEach(name => {
    if (HAS_CN.test(translateSkill(name)) && translateSkill(name) !== name) gemNames.delete(name)
  })
  Array.from(itemNames).forEach(name => {
    const translated = translateItemName(name)
    if (translated !== name && HAS_CN.test(translated)) itemNames.delete(name)
  })
  Array.from(baseNames).forEach(name => {
    const translated = translateBaseItem(name)
    if (translated !== name && HAS_CN.test(translated)) baseNames.delete(name)
  })
  Array.from(classNames).forEach(name => {
    if (translateClass(name) !== name && HAS_CN.test(translateClass(name))) classNames.delete(name)
  })
  Array.from(passiveNames).forEach(name => {
    if (translateKeyPassive(name) !== name && HAS_CN.test(translateKeyPassive(name))) passiveNames.delete(name)
  })

  const supplement = fs.existsSync(OUTPUT_FILE)
    ? JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'))
    : { gems: {}, items: {}, bases: {}, meta: {} }
  if (!supplement.bases) supplement.bases = {}
  if (!supplement.classes) supplement.classes = {}
  if (!supplement.passives) supplement.passives = {}
  if (!supplement.keywords) supplement.keywords = {}

  const pending = [
    ...Array.from(classNames).map(en => ({ kind: 'classes', en })),
    ...Array.from(passiveNames).map(en => ({ kind: 'passives', en })),
    ...Array.from(keywordNames).map(en => ({ kind: 'keywords', en })),
    ...Array.from(baseNames).map(en => ({ kind: 'bases', en })),
    ...Array.from(gemNames).map(en => ({ kind: 'gems', en })),
    ...Array.from(itemNames).map(en => ({ kind: 'items', en }))
  ].filter(entry => !supplement[entry.kind] || supplement[entry.kind][entry.en] === undefined)

  console.log(`待补：职业 ${classNames.size}、关键天赋 ${passiveNames.size}、机制关键词 ${keywordNames.size}、`
    + `基础类型 ${baseNames.size}、技能 ${gemNames.size}、传奇装备 ${itemNames.size}；本轮处理 ${Math.min(pending.length, LIMIT)} 个`)
  let resolved = 0
  let processed = 0
  for (const entry of pending.slice(0, LIMIT)) {
    processed += 1
    const cn = await resolveMissingName(entry.en)
    supplement[entry.kind][entry.en] = cn || ''
    if (cn) {
      resolved += 1
      console.log(`   ✅ [${entry.kind}] ${entry.en} → ${cn}`)
    } else {
      console.log(`   ⬜ [${entry.kind}] ${entry.en} 资料站没有对应页面，保留英文`)
    }
  }

  supplement.meta = {
    updatedAt: new Date().toISOString(),
    source: BASE_URL,
    note: '由 resolve_missing.js 从流亡编年史单件页面标题补齐；空字符串表示查过但没有，保留英文',
    gems: Object.keys(supplement.gems).length,
    items: Object.keys(supplement.items).length,
    bases: Object.keys(supplement.bases).length,
    classes: Object.keys(supplement.classes).length,
    passives: Object.keys(supplement.passives).length,
    keywords: Object.keys(supplement.keywords).length
  }
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(supplement, null, 2))
  console.log(`\n完成：处理 ${processed} 个，补到 ${resolved} 个 → ${OUTPUT_FILE}`)
  console.log(`累计：职业 ${supplement.meta.classes}、关键天赋 ${supplement.meta.passives}、机制词 ${supplement.meta.keywords}、`
    + `基础类型 ${supplement.meta.bases}、技能 ${supplement.meta.gems}、装备 ${supplement.meta.items}`)
}

main().catch(error => {
  console.error('❌ 补齐失败:', error.message)
  process.exitCode = 1
})
