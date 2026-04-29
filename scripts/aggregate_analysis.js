/**
 * 天梯分析数据预聚合脚本
 * 读取 all_ladders_translated.json + data/players/*.json
 * 输出 ladder_analysis.json 供前端直接使用
 */

const fs = require('fs')
const path = require('path')

// 路径配置
const ROOT = path.join(__dirname, '..')
const INPUT_FILE = path.join(ROOT, 'all_ladders_translated.json')
const PLAYER_DIR = path.join(ROOT, 'data', 'players')
const OUTPUT_FILE = path.join(ROOT, 'ladder_analysis.json')

// 聚合统计
const aggregateStats = (playerDetails) => {
  const skillCount = {}
  const equipCount = {}
  const keystoneCount = {}

  for (const player of playerDetails) {
    // 统计技能
    const allGems = []
    if (player.skills) {
      for (const skillGroup of player.skills) {
        if (skillGroup.gems) allGems.push(...skillGroup.gems)
      }
    }
    if (player.equipment) {
      for (const equip of player.equipment) {
        if (equip.gems) allGems.push(...equip.gems)
      }
    }

    const seenGems = new Set()
    for (const gem of allGems) {
      if (!gem.name || seenGems.has(gem.name)) continue
      seenGems.add(gem.name)
      if (!skillCount[gem.name]) {
        skillCount[gem.name] = { count: 0, icon: gem.icon, isSupport: gem.isSupport }
      }
      skillCount[gem.name].count++
    }

    // 统计传奇装备 (rarity === 3)
    if (player.equipment) {
      const seenEquip = new Set()
      for (const equip of player.equipment) {
        if (equip.rarity !== 3 || !equip.name || seenEquip.has(equip.name)) continue
        seenEquip.add(equip.name)
        if (!equipCount[equip.name]) {
          equipCount[equip.name] = { count: 0, icon: equip.icon, slots: new Set() }
        }
        equipCount[equip.name].count++
        if (equip.slot) equipCount[equip.name].slots.add(equip.slot)
      }
    }

    // 统计核心天赋
    if (player.keystones) {
      const seenKs = new Set()
      for (const ks of player.keystones) {
        if (!ks.name || seenKs.has(ks.name)) continue
        seenKs.add(ks.name)
        if (!keystoneCount[ks.name]) {
          keystoneCount[ks.name] = { count: 0, icon: ks.icon }
        }
        keystoneCount[ks.name].count++
      }
    }
  }

  return { skillCount, equipCount, keystoneCount }
}

// 转换为排序数组
const toSortedArray = (obj, max = 10) => {
  return Object.entries(obj)
    .map(([name, data]) => ({
      name,
      count: data.count,
      icon: data.icon || '',
      slots: data.slots ? Array.from(data.slots) : undefined
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
}

// 主函数
const main = async () => {
  console.log('开始天梯分析数据聚合...')

  // 1. 读取天梯总览数据（用于职业分布统计）
  let ladderData = {}
  let updateTime = ''
  let classCount = {}
  let totalPlayers = 0

  if (fs.existsSync(INPUT_FILE)) {
    ladderData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'))
    updateTime = ladderData.updateTime || ''
    const ladders = ladderData.ladders

    if (ladders) {
      for (const [cls, players] of Object.entries(ladders)) {
        classCount[cls] = players.length
        totalPlayers += players.length
      }
    }
  } else {
    console.warn('⚠️ 找不到 all_ladders_translated.json，跳过职业分布统计')
  }

  console.log(`天梯总览: ${totalPlayers} 位玩家, ${Object.keys(classCount).length} 个职业`)

  // 2. 读取职业列表
  let classesData = []
  try {
    const classesPath = path.join(ROOT, 'data', 'classes.json')
    if (fs.existsSync(classesPath)) {
      classesData = JSON.parse(fs.readFileSync(classesPath, 'utf-8'))
    }
  } catch (e) {
    console.log('无法读取职业列表，使用默认数据')
  }

  // 3. 🔧 直接读取 data/players/ 目录下的所有 JSON 文件
  console.log(`读取玩家详情目录: ${PLAYER_DIR}`)

  if (!fs.existsSync(PLAYER_DIR)) {
    console.error('错误：找不到玩家数据目录', PLAYER_DIR)
    console.error('请先运行爬虫生成玩家数据')
    process.exit(1)
  }

  const playerFiles = fs.readdirSync(PLAYER_DIR).filter(f => f.endsWith('.json'))
  console.log(`发现 ${playerFiles.length} 个玩家详情文件`)

  if (playerFiles.length === 0) {
    console.error('错误：players/ 目录下没有 JSON 文件')
    process.exit(1)
  }

  const playerDetails = []
  let loadCount = 0

  for (const file of playerFiles) {
    try {
      const filePath = path.join(PLAYER_DIR, file)
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      playerDetails.push(data)
      loadCount++
    } catch (e) {
      console.warn(`  读取失败: ${file} - ${e.message}`)
    }

    if (loadCount % 50 === 0) {
      console.log(`  已读取 ${loadCount}/${playerFiles.length}...`)
    }
  }

  console.log(`成功读取 ${playerDetails.length} 位玩家详情`)

  if (playerDetails.length === 0) {
    console.error('错误：没有成功读取任何玩家详情')
    process.exit(1)
  }

  // 🔧 从玩家详情中补充职业分布统计（如果 all_ladders_translated.json 不可用）
  if (totalPlayers === 0) {
    const classFromDetails = {}
    for (const p of playerDetails) {
      const cls = p.info?.class || 'Unknown'
      classFromDetails[cls] = (classFromDetails[cls] || 0) + 1
    }
    classCount = classFromDetails
    totalPlayers = playerDetails.length
  }

  // 4. 聚合统计
  console.log('开始聚合统计...')
  const stats = aggregateStats(playerDetails)

  const sampledCount = playerDetails.length

  // 5. 构建输出数据
  const classDistribution = Object.entries(classCount)
    .map(([name, count]) => {
      const clsInfo = classesData.find(c => c.name === name) || {}
      return {
        name,
        displayName: clsInfo.displayName || name,
        count,
        percent: totalPlayers > 0 ? (count / totalPlayers) * 100 : 0,
        icon: clsInfo.icon || `https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com/png/${name.toLowerCase().replace(/ /g, '-')}.webp`
      }
    })
    .sort((a, b) => b.count - a.count)

  const topActiveSkills = toSortedArray(
    Object.fromEntries(
      Object.entries(stats.skillCount).filter(([, v]) => v.isSupport === false)
    )
  ).map(s => ({
    ...s,
    percent: (s.count / sampledCount) * 100
  }))

  const topSupportSkills = toSortedArray(
    Object.fromEntries(
      Object.entries(stats.skillCount).filter(([, v]) => v.isSupport === true)
    )
  ).map(s => ({
    ...s,
    percent: (s.count / sampledCount) * 100
  }))

  const topUniqueEquipment = toSortedArray(stats.equipCount)
    .map(e => ({
      ...e,
      slots: e.slots || [],
      percent: (e.count / sampledCount) * 100
    }))

  const topKeystones = toSortedArray(stats.keystoneCount)
    .map(k => ({
      ...k,
      icon: k.icon ? `https://poe.ninja/poe2-assets/cdn/tree/${k.icon}` : '',
      percent: (k.count / sampledCount) * 100
    }))

  const output = {
    updateTime: updateTime || new Date().toISOString(),
    totalPlayers,
    sampledPlayers: playerDetails.length,
    classDistribution,
    topActiveSkills,
    topSupportSkills,
    topUniqueEquipment,
    topKeystones
  }

  // 6. 写入文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`\n聚合完成！输出文件: ${OUTPUT_FILE}`)
  console.log(`  - 总玩家数: ${totalPlayers}`)
  console.log(`  - 采样玩家数: ${playerDetails.length}`)
  console.log(`  - 职业分布: ${classDistribution.length} 个职业`)
  console.log(`  - 热门主技能: ${topActiveSkills.length} 个`)
  console.log(`  - 热门辅助技能: ${topSupportSkills.length} 个`)
  console.log(`  - 热门传奇装备: ${topUniqueEquipment.length} 个`)
  console.log(`  - 热门核心天赋: ${topKeystones.length} 个`)
}

main().catch(err => {
  console.error('聚合失败:', err)
  process.exit(1)
})
