#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'base-data/problem-guides');
const ENV_NAME = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const OUT_DIR = path.join(ROOT, 'translated-data', ENV_NAME, 'miniprogram_data');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertString(value, field, fileName) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${fileName}: ${field} 必须是非空字符串`);
  }
}

function assertStringArray(value, field, fileName) {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'string')) {
    throw new Error(`${fileName}: ${field} 必须是字符串数组`);
  }
}

function normalizeAction(action, fileName) {
  assertString(action.text, 'action.text', fileName);
  assertString(action.url, 'action.url', fileName);
  return {
    text: action.text.trim(),
    url: action.url.trim(),
  };
}

function normalizeItem(item, group, fileName) {
  assertString(item.id, 'item.id', fileName);
  assertString(item.title, 'item.title', fileName);
  assertString(item.summary, 'item.summary', fileName);
  assertStringArray(item.symptoms, 'item.symptoms', fileName);
  assertStringArray(item.checks, 'item.checks', fileName);
  assertStringArray(item.donts, 'item.donts', fileName);

  return {
    id: item.id.trim(),
    groupId: group.id,
    groupTitle: group.title,
    title: item.title.trim(),
    summary: item.summary.trim(),
    level: item.level || '',
    symptoms: item.symptoms.map(text => text.trim()).filter(Boolean),
    checks: item.checks.map(text => text.trim()).filter(Boolean),
    donts: item.donts.map(text => text.trim()).filter(Boolean),
    actions: (item.actions || []).map(action => normalizeAction(action, fileName)),
    sourceType: item.sourceType || 'manual',
    confidence: item.confidence || 'experience',
  };
}

function buildProblemGuides() {
  if (!fs.existsSync(SOURCE_DIR)) throw new Error(`目录不存在: ${SOURCE_DIR}`);
  const files = fs.readdirSync(SOURCE_DIR).filter(file => file.endsWith('.json')).sort();
  if (!files.length) throw new Error('没有找到 problem-guides 数据源');

  const seenIds = new Set();
  const groups = files.map(fileName => {
    const source = readJson(path.join(SOURCE_DIR, fileName));
    assertString(source.id, 'group.id', fileName);
    assertString(source.title, 'group.title', fileName);
    if (!Array.isArray(source.items) || !source.items.length) {
      throw new Error(`${fileName}: items 不能为空`);
    }
    const group = {
      id: source.id.trim(),
      title: source.title.trim(),
      description: source.description || '',
    };
    const items = source.items.map(item => {
      const normalized = normalizeItem(item, group, fileName);
      if (seenIds.has(normalized.id)) throw new Error(`重复问题 ID: ${normalized.id}`);
      seenIds.add(normalized.id);
      return normalized;
    });
    return { ...group, count: items.length, items };
  });

  const items = groups.flatMap(group => group.items);
  const now = new Date().toISOString();
  const data = {
    version: now.slice(0, 10).replace(/-/g, '') + '-1',
    updatedAt: now,
    title: '流放急救箱',
    description: '面向开荒和异界卡点的轻量排查清单。',
    season: '0.5',
    groups,
    items,
  };
  const manifest = {
    version: data.version,
    updatedAt: data.updatedAt,
    count: items.length,
    groupCount: groups.length,
    file: 'problem_guides.json',
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'problem_guides.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'problem_guides_manifest.json'), JSON.stringify(manifest, null, 2));

  return { data, manifest, outDir: OUT_DIR };
}

if (require.main === module) {
  const result = buildProblemGuides();
  console.log('🧰 流放急救箱数据已生成');
  console.log(`   环境: ${ENV_NAME}`);
  console.log(`   分组: ${result.manifest.groupCount}`);
  console.log(`   问题: ${result.manifest.count}`);
  console.log(`   输出: ${path.relative(ROOT, result.outDir)}/problem_guides.json`);
}

module.exports = { buildProblemGuides };
