#!/usr/bin/env node

require('dotenv').config({
  path: require('path').join(__dirname, '../auto_browser/.env')
})

const fs = require('fs')
const https = require('https')
const path = require('path')
const puppeteer = require('puppeteer')

const isDev = process.env.NODE_ENV === 'dev'
const dataDir = path.join(__dirname, '..', 'translated-data', isDev ? 'dev' : 'release')
const classesPath = path.join(dataDir, 'classes.json')
const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': userAgent,
        Referer: 'https://poe.ninja/poe2/builds',
        Accept: 'application/json'
      }
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (error) {
          reject(new Error(`poe.ninja index-state 解析失败: ${error.message}`))
        }
      })
    }).on('error', reject)
  })
}

async function getActiveLeagueUrl() {
  const indexState = await getJson('https://poe.ninja/poe2/api/data/index-state')
  const preferredUrl = process.env.POE_NINJA_LEAGUE || ''
  const league = preferredUrl
    ? indexState.snapshotVersions?.find(item => item.url === preferredUrl)
    : indexState.economyLeagues?.find(item => item.indexed && !item.hardcore)

  if (!league) {
    throw new Error(`未找到 poe.ninja 天梯赛季: ${preferredUrl || 'indexed softcore'}`)
  }

  return league.url
}

async function main() {
  const leagueUrl = await getActiveLeagueUrl()
  const targetUrl = `https://poe.ninja/poe2/builds/${leagueUrl}`
  console.log(`刷新职业真实分布: ${targetUrl}`)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })

  try {
    const page = await browser.newPage()
    await page.setUserAgent(userAgent)
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 120000 })
    await page.waitForSelector('[role="option"] .class-name', { timeout: 30000 })

    const classes = await page.evaluate(activeLeagueUrl => {
      return Array.from(document.querySelectorAll('[role="option"]'))
        .map(option => {
          const name = option.querySelector('.class-name')?.innerText.trim() || ''
          const percentageText = option.querySelector('.class-percentage')?.innerText.trim() || ''
          const percentageMatch = option.style.borderImageSource.match(/([\d.]+)%/)
          const percent = percentageMatch
            ? Number(percentageMatch[1])
            : Number.parseFloat(percentageText)

          return {
            name,
            link: `${location.origin}/poe2/builds/${activeLeagueUrl}?class=${encodeURIComponent(name)}`,
            percent: Number.isFinite(percent) ? percent : 0
          }
        })
        .filter(item => item.name)
    }, leagueUrl)

    if (classes.length === 0) {
      throw new Error('未识别到职业列表，停止覆盖 classes.json')
    }

    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(classesPath, JSON.stringify(classes, null, 2))
    console.log(`已更新 ${classes.length} 个职业: ${classesPath}`)
    console.log(
      classes.slice(0, 10).map(item => `${item.name} ${item.percent.toFixed(1)}%`).join('\n')
    )
  } finally {
    await browser.close()
  }
}

main().catch(error => {
  console.error(`刷新职业分布失败: ${error.message}`)
  process.exit(1)
})
