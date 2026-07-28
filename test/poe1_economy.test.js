const test = require('node:test')
const assert = require('node:assert/strict')

const { formatValue, mergeCategory } = require('../crawlers/poe1/economy_digest')
const { translateClass, translateSkill } = require('../crawlers/poe1/translations')

test('formats POE1 economy values without losing small currency ratios', () => {
  assert.equal(formatValue(118.8), '119')
  assert.equal(formatValue(0.0064), '0.006')
  assert.equal(formatValue(34329), '34.33k')
})

test('merges poe.ninja items with Chinese display names and 7 day change', () => {
  const items = mergeCategory({ label: '通货' }, {
    items: [{ id: 'divine', name: 'Divine Orb', image: '/divine.png' }],
    lines: [{ id: 'divine', primaryValue: 120.4, volumePrimaryValue: 333, sparkline: { totalChange: 12.35 } }]
  })

  assert.deepEqual(items[0], {
    id: 'divine',
    category: '通货',
    name: '神圣石',
    nameEn: 'Divine Orb',
    chaosValue: 120.4,
    displayValue: '120',
    change7d: 12.4,
    volume: 333,
    icon: 'https://poe.ninja/divine.png'
  })
})

test('translates core class and skill labels while retaining unknown names safely', () => {
  assert.equal(translateClass('Deadeye'), '锐眼')
  assert.equal(translateSkill('Winter Orb'), '冰霜之球')
  assert.equal(translateSkill('Future Skill'), 'Future Skill')
})
