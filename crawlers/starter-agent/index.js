#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../auto_browser/.env') });

const fs = require('fs');
const path = require('path');
const envConfig = require('../../auto_browser/env-config');

const ROOT = path.join(__dirname, '../..');
const INPUT_DIR = path.join(ROOT, 'base-data/starter/agent_posts');
const CANDIDATE_DIR = path.join(ROOT, 'base-data/starter/candidates');
const OUTPUT_DIR = path.join(envConfig.dataDir, 'miniprogram_data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'starter_candidates.json');

const STAGE_HEADING_RE = /^(#{1,4}\s*)?((?:lv\.?\s*)?\d+\s*[-~到至]\s*\d+\s*(?:级|等|level|lv)?|\d+\s*(?:级|等)\s*(?:前|后|左右)?|第\s*[一二三四五六七八九十0-9]+\s*章|剧情(?:前期|中期|后期)?|异界(?:前|初期|后)?|开荒(?:前期|中期|后期)?|升华|转职|转型|毕业|满级|endgame|maps?)[:：、\s-]*(.*)$/i;

const FIELD_RULES = [
  { key: 'mainSkills', label: '技能', re: /(技能|主技能|输出|link|连接|gem|宝石|support|辅助)/i },
  { key: 'passives', label: '天赋', re: /(天赋|被动|passive|树|专精|先点|点法)/i },
  { key: 'gearTips', label: '装备', re: /(装备|武器|防具|词缀|抗性|生命|护甲|闪避|能量护盾|黄装|暗金|unique|gear)/i },
  { key: 'ascendancy', label: '升华', re: /(升华|转职|ascend|trial)/i },
  { key: 'transition', label: '转型', re: /(转型|切换|改成|换成|过渡|进入异界|maps?)/i },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function strip(value) {
  return String(value || '').replace(/\r/g, '').replace(/[\t ]+/g, ' ').trim();
}

function uniq(values) {
  const seen = new Set();
  return values.filter(value => {
    const text = strip(value);
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function parseFrontMatter(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  if (!raw.startsWith('---')) return { meta: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: raw };
  const block = raw.slice(3, end).trim();
  const meta = {};
  block.split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = strip(line.slice(0, idx));
    const value = strip(line.slice(idx + 1)).replace(/^['"]|['"]$/g, '');
    if (key) meta[key] = value;
  });
  return { meta, body: raw.slice(end + 4).trim() };
}

function normalizeLine(line) {
  return strip(line)
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^>\s*/, '')
    .trim();
}

function getTitle(meta, lines, fileName) {
  if (meta.title) return strip(meta.title);
  const heading = lines.find(line => /^#\s+/.test(line));
  if (heading) return strip(heading.replace(/^#+\s*/, ''));
  return path.basename(fileName, path.extname(fileName));
}

function getMetaList(value) {
  return strip(value).split(/[,，、|]/).map(strip).filter(Boolean);
}

function createStage(title) {
  return {
    stage: title,
    summary: '',
    mainSkills: [],
    passives: [],
    gearTips: [],
    ascendancy: [],
    transition: [],
    notes: [],
    sourceLines: [],
  };
}

function detectStage(line) {
  const normalized = normalizeLine(line).replace(/^#+\s*/, '');
  const match = normalized.match(STAGE_HEADING_RE);
  if (!match) return '';
  const rest = strip(match[3] || '');
  const base = strip(match[2] || '');
  return rest ? `${base}：${rest}` : base;
}

function pushLineToStage(stage, line) {
  const text = normalizeLine(line);
  if (!text) return;
  let matched = false;
  FIELD_RULES.forEach(rule => {
    if (rule.re.test(text)) {
      stage[rule.key].push(text);
      matched = true;
    }
  });
  if (!matched) stage.notes.push(text);
  stage.sourceLines.push(text);
}

function summarizeStage(stage) {
  const first = stage.mainSkills[0] || stage.passives[0] || stage.gearTips[0] || stage.notes[0] || '';
  stage.summary = first.slice(0, 80);
  Object.keys(stage).forEach(key => {
    if (Array.isArray(stage[key])) stage[key] = uniq(stage[key]);
  });
  return stage;
}

function parsePost(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return normalizeJsonPost(readJson(filePath, {}), filePath);

  const raw = fs.readFileSync(filePath, 'utf8');
  const { meta, body } = parseFrontMatter(raw);
  const lines = body.split('\n').map(line => line.trim()).filter(Boolean);
  const title = getTitle(meta, lines, filePath);
  const stages = [];
  let current = null;
  const loose = [];

  lines.forEach(line => {
    const stageTitle = detectStage(line);
    if (stageTitle) {
      if (current && current.sourceLines.length) stages.push(summarizeStage(current));
      current = createStage(stageTitle);
      return;
    }
    if (!current) {
      const text = normalizeLine(line.replace(/^#+\s*/, ''));
      if (text && text !== title) loose.push(text);
      return;
    }
    pushLineToStage(current, line);
  });

  if (current && current.sourceLines.length) stages.push(summarizeStage(current));

  const sourceUrl = meta.url || meta.sourceUrl || '';
  const sourceName = meta.source || meta.sourceName || '热门 BD 帖候选';
  const candidate = {
    id: meta.id || slugify(`${meta.class || ''}-${meta.ascendancy || ''}-${title}`),
    status: 'candidate',
    reviewStatus: 'needs_review',
    confidence: meta.confidence || 'low',
    title,
    author: meta.author || '待确认',
    class: meta.class || '',
    ascendancy: meta.ascendancy || '',
    mainSkill: meta.mainSkill || '',
    tags: getMetaList(meta.tags),
    sourceMetrics: {
      hotScore: Number(meta.hotScore || 0),
      views: Number(meta.views || 0),
      replies: Number(meta.replies || 0),
      likes: Number(meta.likes || 0),
      favorites: Number(meta.favorites || 0),
    },
    summary: meta.summary || loose.slice(0, 3).join(' '),
    levelingPlan: stages,
    extractedAt: new Date().toISOString(),
    sources: [{
      name: sourceName,
      type: 'agent_candidate',
      url: sourceUrl,
      checkedAt: new Date().toISOString().slice(0, 10),
      confidence: meta.confidence || 'low',
      note: 'Agent/脚本从热门 BD 帖抽取的候选数据，发布前需要人工审核。'
    }],
    reviewHints: getReviewHints({ meta, stages, sourceUrl }),
  };

  return candidate;
}

function normalizeJsonPost(data, filePath) {
  const title = data.title || path.basename(filePath, '.json');
  const stages = Array.isArray(data.levelingPlan) ? data.levelingPlan : [];
  return {
    id: data.id || slugify(title),
    status: 'candidate',
    reviewStatus: 'needs_review',
    confidence: data.confidence || 'low',
    title,
    author: data.author || '待确认',
    class: data.class || '',
    ascendancy: data.ascendancy || '',
    mainSkill: data.mainSkill || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    sourceMetrics: data.sourceMetrics || {},
    summary: data.summary || '',
    levelingPlan: stages.map(summarizeStage),
    extractedAt: new Date().toISOString(),
    sources: data.sources || [],
    reviewHints: getReviewHints({ meta: data, stages, sourceUrl: data.sourceUrl || '' }),
  };
}

function getReviewHints({ meta, stages, sourceUrl }) {
  const hints = [];
  if (!sourceUrl) hints.push('缺少原帖 URL');
  if (!meta.class) hints.push('缺少基础职业');
  if (!meta.ascendancy) hints.push('缺少升华/转职');
  if (!meta.mainSkill) hints.push('缺少主技能');
  if (!stages.length) hints.push('未识别到开荒阶段');
  if (stages.length && !stages.some(stage => stage.passives.length)) hints.push('缺少天赋点法');
  if (stages.length && !stages.some(stage => stage.mainSkills.length)) hints.push('缺少技能配置');
  if (stages.length && !stages.some(stage => stage.ascendancy.length || stage.transition.length)) hints.push('缺少升华/转职/转型节点');
  return hints;
}

function listInputFiles() {
  if (!fs.existsSync(INPUT_DIR)) return [];
  return fs.readdirSync(INPUT_DIR)
    .filter(name => /\.(md|txt|json)$/i.test(name))
    .filter(name => !/^README\./i.test(name))
    .filter(name => !/\.sample\.(md|txt|json)$/i.test(name))
    .map(name => path.join(INPUT_DIR, name));
}

function buildCandidates() {
  ensureDir(CANDIDATE_DIR);
  ensureDir(OUTPUT_DIR);
  const files = listInputFiles();
  const candidates = files.map(parsePost).filter(item => item && item.id);

  candidates.forEach(candidate => {
    writeJson(path.join(CANDIDATE_DIR, `${candidate.id}.json`), candidate);
  });

  writeJson(OUTPUT_FILE, {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    sourceDir: path.relative(ROOT, INPUT_DIR),
    candidates,
  });

  console.log(`   输入帖子: ${files.length}`);
  console.log(`   候选 BD: ${candidates.length}`);
  console.log(`   输出: ${path.relative(ROOT, OUTPUT_FILE)}`);
  if (!files.length) {
    console.log('   提示: 当前没有候选输入。请先运行 npm run crawl:starter-hot:dev 抓取热门 BD 帖，或手动把帖子 .md/.txt 放入 base-data/starter/agent_posts。');
  }
  candidates.forEach(item => {
    const hintText = item.reviewHints.length ? `，待补: ${item.reviewHints.join('、')}` : '';
    console.log(`   - ${item.title} (${item.levelingPlan.length} 个阶段${hintText})`);
  });
  return candidates;
}

function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  PoE2 热门 BD 帖候选抽取');
  console.log('═'.repeat(60));
  buildCandidates();
  console.log('\n完成。候选数据只用于人工审核，不会自动进入正式推荐榜。');
}

module.exports = { buildCandidates, parsePost, split: detectStage };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('抽取失败:', error.message);
    process.exit(1);
  }
}
