const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { buildProblemGuides } = require('../scripts/build_problem_guides');

test('builds problem guide manifest and grouped items', () => {
  process.env.NODE_ENV = 'dev';
  const { data, manifest, outDir } = buildProblemGuides();
  assert.equal(data.title, '流放急救箱');
  assert.ok(data.groups.length >= 3);
  assert.ok(data.items.length >= 8);
  assert.equal(manifest.count, data.items.length);
  assert.ok(fs.existsSync(path.join(outDir, 'problem_guides.json')));
  assert.ok(fs.existsSync(path.join(outDir, 'problem_guides_manifest.json')));
  assert.ok(data.items.every(item => item.actions.length > 0));
});
