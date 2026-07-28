const test = require('node:test')
const assert = require('node:assert/strict')

const { buildFollowUpdates } = require('../scripts/build_follow_updates')

test('builds followable ladder and market items with only real changes', () => {
  const result = buildFollowUpdates({
    ladderBuildIndex: {
      updatedAt: '2026-07-24T00:00:00.000Z',
      skills: [{ id: 'skill_a', name: '冰霜之捷', originalName: 'Herald of Ice', count: 12, percent: 20, icon: 'skill.png', classes: [{ name: 'Sorceress', count: 8 }] }],
      equipment: [{ id: 'item_a', name: '猎首', originalName: 'Headhunter', count: 4, percent: 8, icon: 'item.png', classes: [{ name: 'Ranger', count: 4 }] }],
    },
    cnMarket: {
      updatedAt: '2026-07-24T00:00:00.000Z',
      items: [{ id: 'divine_orb', name: '神圣石', enName: 'Divine Orb', bestUnitPriceCny: 0.05, bestUnitPerCny: 20, icon: 'divine.png' }],
    },
    previousDigest: {
      items: [
        { id: 'skill:skill_a', metrics: { count: 10 } },
        { id: 'equipment:item_a', metrics: { count: 4 } },
        { id: 'economy:divine_orb', metrics: { pricePerUnit: 0.04 } },
      ],
    },
  })

  assert.equal(result.items.length, 3)
  assert.equal(result.items[0].change.label, '较上次 +2 位玩家')
  assert.equal(result.items[1].change, null)
  assert.equal(result.items[2].change.label, '价格较上次 +25%')
  assert.equal(result.items[0].route.includes('keyword=Herald%20of%20Ice'), true)
})

test('keeps untouched source types when a scheduled task refreshes only one source', () => {
  const previousDigest = {
    items: [
      { id: 'skill:skill_a', type: 'skill', title: '冰霜之捷', metrics: { count: 10 } },
      { id: 'equipment:item_a', type: 'equipment', title: '猎首', metrics: { count: 4 } },
      { id: 'economy:divine_orb', type: 'economy', title: '神圣石', metrics: { pricePerUnit: 0.04 } },
    ],
  }
  const result = buildFollowUpdates({
    cnMarket: {
      items: [{ id: 'divine_orb', name: '神圣石', bestUnitPriceCny: 0.05 }],
    },
    previousDigest,
  })

  assert.equal(result.items.length, 3)
  assert.equal(result.items.find(item => item.type === 'skill').title, '冰霜之捷')
  assert.equal(result.items.find(item => item.type === 'equipment').title, '猎首')
  assert.equal(result.items.find(item => item.type === 'economy').change.label, '价格较上次 +25%')
})
