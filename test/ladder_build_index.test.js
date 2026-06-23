const test = require('node:test')
const assert = require('node:assert/strict')
const { buildLadderBuildIndex, createTranslationMap } = require('../scripts/build_ladder_build_index')

const makePlayer = (name, account) => ({
  info: { name, account, class: 'Deadeye', level: name === 'Alpha' ? 98 : 96 },
  skills: [{ gems: [
    { name: '闪电箭矢', originalName: 'Lightning Arrow', icon: 'skill.png', isSupport: false },
    { name: '散射', originalName: 'Scattershot', icon: 'support.png', isSupport: true }
  ] }],
  equipment: [{ name: '疾电之弦', originalName: 'Voltstring', icon: 'item.png', rarity: 3, slot: 'Weapon' }]
})

test('聚合技能、辅助、传奇装备、职业和代表玩家', () => {
  const result = buildLadderBuildIndex({
    playerDetails: [makePlayer('Alpha', 'A-1'), makePlayer('Beta', 'B-2')],
    classesData: [{ name: 'Deadeye', displayName: '锐眼' }],
    updatedAt: '2026-06-18T00:00:00.000Z'
  })
  assert.equal(result.skills[0].count, 2)
  assert.equal(result.skills[0].percent, 100)
  assert.equal(result.skills[0].classes[0].displayName, '锐眼')
  assert.equal(result.skills[0].supportSkills[0].name, '散射')
  assert.deepEqual(result.skills[0].players.map(player => player.name), ['Alpha', 'Beta'])
  assert.equal(result.equipment[0].count, 2)
  assert.equal(result.equipment[0].relatedSkills[0].name, '闪电箭矢')
})

test('同一玩家的重复技能和装备只计数一次', () => {
  const player = makePlayer('Alpha', 'A-1')
  player.skills.push(player.skills[0])
  player.equipment.push(player.equipment[0])
  const result = buildLadderBuildIndex({ playerDetails: [player] })
  assert.equal(result.skills[0].count, 1)
  assert.equal(result.skills[0].classes[0].count, 1)
  assert.equal(result.equipment[0].count, 1)
})

test('拒绝生成空索引', () => {
  assert.throws(() => buildLadderBuildIndex({ playerDetails: [] }), /玩家详情为空/)
})

test('优先使用现有权威字典补充中文名', () => {
  const player = makePlayer('Alpha', 'A-1')
  player.skills[0].gems[0] = {
    name: 'Mana Remnants', originalName: 'Mana Remnants', isSupport: false
  }
  player.equipment[0] = {
    name: "Kalandra's Touch", originalName: "Kalandra's Touch", rarity: 3, slot: 'Ring'
  }
  const result = buildLadderBuildIndex({
    playerDetails: [player],
    skillTranslations: createTranslationMap([{ en: 'Mana Remnants', cn: '魔力残片' }]),
    equipmentTranslations: createTranslationMap([{ en: 'Kalandras Touch', cn: '卡兰德之触' }])
  })
  assert.equal(result.skills[0].name, '魔力残片')
  assert.equal(result.equipment[0].name, '卡兰德之触')
})
