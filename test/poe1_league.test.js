const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrimaryChallengeLeague, selectPrimaryChallengeLeague } = require('../crawlers/poe1/league');

test('选择当前普通挑战赛季，排除标准、硬核、SSF、Ruthless 和私人联盟', () => {
  const leagues = [
    { name: 'Hardcore Allflame', url: 'allflamehc' },
    { name: 'Standard', url: 'standard' },
    { name: 'Allflame (PL99999)', url: 'private' },
    { name: 'Ruthless Allflame', url: 'allflamer' },
    { name: 'Allflame', url: 'allflame' }
  ];

  assert.equal(selectPrimaryChallengeLeague(leagues)?.url, 'allflame');
  assert.equal(isPrimaryChallengeLeague({ name: 'SSF Allflame' }), false);
});

test('天梯数据要求存在对应 exp 快照，避免选择没有天梯的联赛', () => {
  const leagues = [
    { name: 'Old Season', url: 'old' },
    { name: 'New Season', url: 'new' }
  ];
  const snapshots = [{ url: 'new', type: 'exp' }];

  assert.equal(selectPrimaryChallengeLeague(leagues, snapshots)?.url, 'new');
});
