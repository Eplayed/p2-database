#!/usr/bin/env node
/**
 * 流放1 中文译名字典爬虫
 *
 * 为什么单独做一份：base-data/dist 里的 dict_gem / dict_base / dict_unique 是从
 * 流放2 资料站抓的（"Rage I"、"Warden Bow" 这类是流放2 的名字），流放1 的翻译层
 * 一直借用它，所以天梯换源到 poe.ninja 之后，Blood Rage、Frostblink、Harpyskin Boots
 * 这些流放1 名字全都落空——实测 247 个技能名、560 个装备名没有中文名。
 *
 * 输出到 base-data/dist/poe1/，由 crawlers/poe1/translations.js 优先读取，
 * 手工维护的映射表仍然盖在字典之上（人工校对结果优先于资料站）。
 *
 * 用法：
 *   node crawlers/poe1db-dict/index.js              # 全量
 *   node crawlers/poe1db-dict/index.js --only=gems  # 只抓技能宝石
 */

const fs = require('fs')
const path = require('path')
const { fetchWithRetry } = require('../shared/wikiDict/http_client')
const { parseGems, parseBaseItems, parseUniques } = require('../shared/wikiDict/parser')
const { BASE_URL, GEM_PAGES, UNIQUE_PAGES, BASE_ITEM_PAGES } = require('./pages')

const OUTPUT_DIR = path.join(__dirname, '../../base-data/dist/poe1')

const onlyArg = process.argv.find(arg => arg.startsWith('--only='))
const ONLY = onlyArg ? onlyArg.split('=')[1] : 'all'

const isWanted = kind => ONLY === 'all' || ONLY === kind

/** 逐页抓取并按"先抓到的优先"合并，避免后抓的页面把已有映射覆盖掉 */
async function crawlPages(pages, parser, label) {
  const merged = {}
  const perPage = []
  for (const page of pages) {
    const url = `${BASE_URL}/${page.slug}`
    try {
      const html = await fetchWithRetry(url)
      const found = parser(html)
      let added = 0
      Object.entries(found).forEach(([en, value]) => {
        if (merged[en] === undefined) {
          merged[en] = value
          added += 1
        }
      })
      perPage.push({ slug: page.slug, name: page.name, parsed: Object.keys(found).length, added })
      console.log(`   ${label} ${page.name.padEnd(10)} 解析 ${String(Object.keys(found).length).padStart(4)} 条，新增 ${added}`)
    } catch (error) {
      perPage.push({ slug: page.slug, name: page.name, error: error.message })
      console.warn(`   ${label} ${page.name} 抓取失败: ${error.message}`)
    }
  }
  return { merged, perPage }
}

/** 技能名过滤：资料站页面里混着分类标题和说明链接，明显不像宝石名的直接丢掉 */
function filterGemNames(dict) {
  const output = {}
  Object.entries(dict).forEach(([en, cn]) => {
    const words = en.trim().split(/\s+/)
    if (!cn || /[一-龥]/.test(en)) return
    if (words.length > 6 || en.length > 48) return
    output[en.trim()] = cn
  })
  return output
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, name), JSON.stringify(data, null, 0))
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const startedAt = Date.now()
  const meta = { source: BASE_URL, generatedAt: new Date().toISOString(), pages: {} }

  if (isWanted('gems')) {
    console.log('━'.repeat(52))
    console.log('💎 技能与辅助宝石')
    const { merged, perPage } = await crawlPages(GEM_PAGES, parseGems, '  ')
    const gems = filterGemNames(merged)
    writeJson('dict_gem.json', gems)
    meta.pages.gems = perPage
    meta.counts = { ...(meta.counts || {}), gems: Object.keys(gems).length }
    console.log(`   ✅ dict_gem.json: ${Object.keys(gems).length} 条`)
  }

  if (isWanted('unique')) {
    console.log('━'.repeat(52))
    console.log('⭐ 传奇物品')
    const { merged, perPage } = await crawlPages(UNIQUE_PAGES, parseUniques, '  ')
    writeJson('dict_unique.json', merged)
    meta.pages.unique = perPage
    meta.counts = { ...(meta.counts || {}), uniques: Object.keys(merged).length }
    console.log(`   ✅ dict_unique.json: ${Object.keys(merged).length} 条`)
  }

  if (isWanted('bases')) {
    console.log('━'.repeat(52))
    console.log('📦 基础装备类型')
    const { merged, perPage } = await crawlPages(BASE_ITEM_PAGES, parseBaseItems, '  ')
    writeJson('dict_base.json', merged)
    meta.pages.bases = perPage
    meta.counts = { ...(meta.counts || {}), bases: Object.keys(merged).length }
    console.log(`   ✅ dict_base.json: ${Object.keys(merged).length} 条`)
  }

  const failed = Object.values(meta.pages).flatMap(list => list.filter(page => page.error))
  fs.writeFileSync(path.join(OUTPUT_DIR, 'meta.json'), JSON.stringify({ ...meta, failedPages: failed }, null, 2))
  console.log(`\n完成，耗时 ${((Date.now() - startedAt) / 1000).toFixed(0)}s → ${OUTPUT_DIR}`)
  if (failed.length) {
    console.warn(`⚠️ ${failed.length} 个页面失败（字典仍可用，缺的是那几页的名字）:`)
    failed.forEach(page => console.warn(`   ${page.slug}: ${page.error}`))
  }
  // 一个条目都没有说明站点结构变了或全被拦了，写空字典会把线上翻译整体打回英文
  const total = Object.values(meta.counts || {}).reduce((sum, value) => sum + value, 0)
  if (!total) {
    console.error('❌ 一条都没抓到，判定为失败')
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('❌ 流放1 字典抓取失败:', error.message)
  process.exitCode = 1
})
