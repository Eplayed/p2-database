const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createActionCards,
  pickProblemGuides,
} = require('../scripts/build_daily_return_digest');

test('creates homepage action cards from ladder, economy and problem guide data', () => {
  const result = createActionCards({
    ladderBuildIndex: {
      skills: [{ id: 's1', name: '寒冰之捷', count: 12, percent: 40, icon: 'skill.png' }],
      equipment: [{ id: 'e1', name: '卡兰德的魔镜', count: 3, percent: 10, icon: 'item.png' }],
    },
    economyDigest: {
      sections: {
        todayRates: [{ id: 'divine', name: '神圣石', valueText: '1 D', icon: 'divine.png' }],
      },
    },
    cnMarket: { items: [] },
    problemGuides: {
      items: [
        { id: 'fourth_ascendancy_unlock', groupTitle: '升华卡点', title: '第四次升华在哪里做', summary: '门票和地点先确认' },
      ],
    },
    classes: [{ name: 'Martial Artist', percent: 22.26 }],
  });

  assert.equal(result.cards[0].title, '寒冰之捷');
  assert.equal(result.cards[1].title, '卡兰德的魔镜');
  assert.equal(result.cards[2].title, '武圣');
  assert.equal(result.cards[3].title, '第四次升华在哪里做');
  assert.equal(result.economyCards[0].name, '神圣石');
});

test('prioritises high-value problem guide entries for homepage revisit', () => {
  const guides = pickProblemGuides({
    items: [
      { id: 'low_profit', title: '收益太低', summary: '先查地图等级' },
      { id: 'map_sustain', title: '地图不够 / 经常断图', summary: '先查地图续航' },
      { id: 'random', title: '其他问题', summary: '其他' },
    ],
  });

  assert.deepEqual(guides.map(item => item.id), ['map_sustain', 'low_profit']);
});
