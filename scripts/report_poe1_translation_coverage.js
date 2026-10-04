#!/usr/bin/env node
/**
 * 流放1 天梯产物的中文译名覆盖率报告（只读，不改任何文件）。
 *
 * 为什么需要：换源到 poe.ninja 后英文名会直接进界面，但"看着还有英文"和
 * "覆盖率掉了 20%"是两回事。没有可重复的数字，就没法判断补字典有没有生效、
 * 上游改版后有没有偷偷退步。
 *
 * 用法：
 *   node scripts/report_poe1_translation_coverage.js --dir=/tmp/poe1-shadow
 *   node scripts/report_poe1_translation_coverage.js            # 默认 release 产物
 *   MIN_SKILL_COVERAGE=95 node scripts/report_poe1_translation_coverage.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const dirArg = process.argv.find(arg => arg.startsWith('--dir='))
const DATA_DIR = dirArg
  ? path.resolve(dirArg.split('=')[1])
  : path.join(ROOT, 'translated-data/poe1/release/miniprogram_data')
const BUILD_DIR = path.join(DATA_DIR, 'poe1_builds')
const MIN_SKILL_COVERAGE = Number(process.env.MIN_SKILL_COVERAGE || 90)
const MIN_ITEM_COVERAGE = Number(process.env.MIN_ITEM_COVERAGE || 85)
const TOP_N = Number(process.env.COVERAGE_TOP || 15)

const HAS_CN = /[\u4e00-\u9fa5]/

function readBuilds() {
  if (fs.existsSync(BUILD_DIR)) {
    return fs.readdirSync(BUILD_DIR)
      .filter(name => name.endsWith('.json'))
      .map(name => JSON.parse(fs.readFileSync(path.join(BUILD_DIR, name), 'utf8')))
  }
  // 旧格式：详情直接内联在摘要里
  const digestPath = path.join(DATA_DIR, 'ladder_digest.json')
  if (!fs.existsSync(digestPath)) throw new Error(`找不到天梯产物: ${digestPath}`)
  const digest = JSON.parse(fs.readFileSync(digestPath, 'utf8'))
  return Array.isArray(digest.builds) ? digest.builds : []
}

/** 统计「英文名 → 是否翻出中文」，同名只算一次，另外记出现次数用于排序 */
function createCounter() {
  const seen = new Map()
  return {
    add(enName, cnName) {
      const en = String(enName || '').trim()
      if (!en) return
      const record = seen.get(en) || { en, hits: 0, translated: false }
      record.hits += 1
      if (HAS_CN.test(String(cnName || ''))) record.translated = true
      seen.set(en, record)
    },
    report(label) {
      const all = Array.from(seen.values())
      const translated = all.filter(item => item.translated)
      const coverage = all.length ? (translated.length / all.length) * 100 : 100
      const misses = all.filter(item => !item.translated).sort((a, b) => b.hits - a.hits)
      console.log(`${label}: ${translated.length}/${all.length} 有中文名（${coverage.toFixed(1)}%）`)
      if (misses.length) {
        console.log(`   未覆盖 TOP${Math.min(TOP_N, misses.length)}（按出现次数）:`)
        misses.slice(0, TOP_N).forEach(item => console.log(`   - ${item.en}  ×${item.hits}`))
      }
      return { coverage, total: all.length, misses }
    }
  }
}

function main() {
  const builds = readBuilds()
  if (!builds.length) throw new Error('天梯产物里没有任何 BD')
  console.log(`统计目录: ${DATA_DIR}`)
  console.log(`BD 数量: ${builds.length}\n`)

  const gems = createCounter()
  const items = createCounter()
  const rareNames = createCounter()
  const classes = createCounter()
  const modLines = { total: 0, english: 0, samples: new Map() }

  builds.forEach(build => {
    classes.add(build.classNameEn, build.className)
    ;(build.skillGems || []).forEach(gem => gems.add(gem.nameEn, gem.name))
    ;(build.skillGroups || []).forEach(group => (group.gems || []).forEach(gem => gems.add(gem.nameEn, gem.name)))
    ;(build.mainSkillEn ? [[build.mainSkillEn, build.mainSkill]] : []).forEach(([en, cn]) => gems.add(en, cn))
    ;['equipment', 'flasks', 'jewels'].forEach(key => {
      (build[key] || []).forEach(item => {
        // 传奇名是固定词条（字典能覆盖）；稀有装的名字是随机前缀+基础类型，
      // 属于外观词，需要的是另一套词表，两类混在一起算覆盖率没有意义
      if (Number(item.rarity) === 10) items.add(item.nameEn, item.name)
      else rareNames.add(item.nameEn, item.name)
        // 基础类型只在装备名本身没翻出来时才看它，否则正常装备会重复计一遍基础类型
        if (!HAS_CN.test(String(item.name || ''))) items.add(item.baseTypeEn || item.typeLineEn, item.baseType || item.typeLine)
        ;[].concat(item.explicitMods || [], item.implicitMods || [], item.properties || []).forEach(line => {
          const text = String(line || '')
          if (!text) return
          modLines.total += 1
          // 词缀行里残留英文单词（不是纯数字/符号）就算未覆盖
          if (/[A-Za-z]{3,}/.test(text)) {
            modLines.english += 1
            const key = text.replace(/\d[\d,.]*/g, '#').slice(0, 70)
            modLines.samples.set(key, (modLines.samples.get(key) || 0) + 1)
          }
        })
      })
    })
  })

  const classResult = classes.report('职业名')
  const gemResult = gems.report('技能名')
  const itemResult = items.report('传奇装备名')
  const rareResult = rareNames.report('稀有装备名（随机外观词，另需词表）')
  const modCoverage = modLines.total ? ((modLines.total - modLines.english) / modLines.total) * 100 : 100
  console.log(`词缀行: ${modLines.total - modLines.english}/${modLines.total} 已全中文（${modCoverage.toFixed(1)}%）`)
  const topModMisses = Array.from(modLines.samples.entries()).sort((a, b) => b[1] - a[1]).slice(0, TOP_N)
  if (topModMisses.length) {
    console.log(`   残留英文词缀 TOP${topModMisses.length}:`)
    topModMisses.forEach(([text, hits]) => console.log(`   - ${text}  ×${hits}`))
  }

  const failures = []
  if (gemResult.coverage < MIN_SKILL_COVERAGE) failures.push(`技能名覆盖率 ${gemResult.coverage.toFixed(1)}% 低于门槛 ${MIN_SKILL_COVERAGE}%`)
  if (itemResult.coverage < MIN_ITEM_COVERAGE) failures.push(`传奇装备名覆盖率 ${itemResult.coverage.toFixed(1)}% 低于门槛 ${MIN_ITEM_COVERAGE}%`)
  // 职业名缺的多半是新赛季新进阶（实测 Luminary / Reliquarian 在资料站和官方字典里都查不到）。
  // 没有权威出处就不能造，所以这里只提醒，不拦发布。
  if (classResult.misses.length) {
    console.warn(`⚠️  ${classResult.misses.length} 个职业名没有权威中文名，界面会显示英文: ${classResult.misses.map(item => item.en).join(', ')}`)
  }

  if (failures.length) {
    console.error('\n❌ 覆盖率未达标:')
    failures.forEach(message => console.error(`   ${message}`))
    process.exitCode = 1
    return
  }
  console.log('\n✅ 覆盖率达标')
}

main()
