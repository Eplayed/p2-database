const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const defaultSourceDir = '/Users/zhangyajun/Downloads/poe-bd-国服译名校对';
const sourceDir = process.env.POE1_STARTER_SOURCE_DIR || defaultSourceDir;
const sourceDataPath = path.join(__dirname, '../../base-data/poe1/starter_builds_source.json');
const outputDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const outputPath = path.join(outputDir, 'starter_builds.json');

const CLASS_NAMES = ['锐眼', '圣宗', '酋长', '处刑者', '刺客', '元素使', '勇士', '守护者', '冠军', '贵族', '秘术师', '药侠', '判官', '死灵师'];
const SECTION_TITLES = [
  'BD简介',
  'BD总览',
  '优缺点',
  '优点',
  '缺点',
  '核心机制',
  '装备推荐',
  '技能宝石链接',
  '天赋树要点',
  '升华选择',
  '升级流程',
  '药水',
  '珠宝',
  '注意事项',
  '第一阶段',
  '第二阶段'
];

const SECTION_GROUPS = [
  { key: 'summary', title: '简介', match: ['BD简介', 'BD总览'] },
  { key: 'pros', title: '优点', match: ['优点'] },
  { key: 'cons', title: '缺点', match: ['缺点'] },
  { key: 'mechanics', title: '核心机制', match: ['核心机制'] },
  { key: 'skills', title: '技能链接', match: ['技能宝石链接'] },
  { key: 'equipment', title: '装备推荐', match: ['装备推荐'] },
  { key: 'passives', title: '天赋要点', match: ['天赋树要点'] },
  { key: 'ascendancy', title: '升华顺序', match: ['升华选择'] },
  { key: 'leveling', title: '升级流程', match: ['升级流程', '第一阶段', '第二阶段'] },
  { key: 'notes', title: '注意事项', match: ['注意事项'] }
];

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function docxToParagraphs(filePath) {
  const xml = execFileSync('unzip', ['-p', filePath, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return xml
    .split(/<w:p[\s>]/)
    .map((block) => {
      const pieces = Array.from(block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map((match) => decodeXmlText(match[1]));
      return pieces.join('').replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

function isHeading(text) {
  if (SECTION_TITLES.includes(text)) return true;
  if (/^第[一二三四五六七八九十]+阶段[:：]/.test(text)) return true;
  if (/^阶段[一二三四五六七八九十\d]+[:：]/.test(text)) return true;
  return false;
}

function makeId(fileName) {
  return path.basename(fileName, '.docx').replace(/^\d+_/, '').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').toLowerCase();
}

function pickClassName(title) {
  return CLASS_NAMES.find((name) => title.includes(name)) || '';
}

function pickMainSkill(title) {
  const withoutEnglish = title.replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '');
  const className = pickClassName(title);
  return withoutEnglish
    .replace(className, '')
    .replace(/BD|开荒|两阶段|国服|校对/g, '')
    .trim() || withoutEnglish.trim();
}

function makeTags(text) {
  const tagRules = [
    ['开荒', /开荒|升级|剧情/],
    ['图腾', /图腾|弩炮/],
    ['近战', /近战|猛击|旋风|闪打|震波|战吼/],
    ['召唤', /召唤|灵体|魔像|狂灵/],
    ['地雷', /地雷/],
    ['点燃', /点燃|正义之火|燃烧/],
    ['流血', /流血/],
    ['毒伤', /毒|曼巴/],
    ['低造价', /廉价|容易获取|无需昂贵/],
    ['Boss', /Boss|首领/]
  ];
  return tagRules.filter(([, regex]) => regex.test(text)).map(([tag]) => tag).slice(0, 6);
}

function parseSections(paragraphs) {
  const sections = [];
  let current = { title: '概览', items: [] };
  for (const text of paragraphs.slice(2)) {
    if (isHeading(text)) {
      if (current.items.length) sections.push(current);
      current = { title: text, items: [] };
      continue;
    }
    current.items.push(text);
  }
  if (current.items.length) sections.push(current);
  return sections;
}

function sectionItems(sections, group) {
  const items = [];
  for (const section of sections) {
    if (group.match.some((keyword) => section.title.includes(keyword))) {
      items.push(...section.items);
    }
  }
  return items;
}

function makeBuildFromDocx(filePath, index) {
  const paragraphs = docxToParagraphs(filePath);
  const title = paragraphs[0] || path.basename(filePath, '.docx');
  const authorLine = paragraphs.find((line) => /^作者[:：]/.test(line)) || '';
  const author = authorLine.replace(/^作者[:：]\s*/, '').trim();
  const sections = parseSections(paragraphs);
  const allText = paragraphs.join('\n');
  const className = pickClassName(title);
  const mainSkill = pickMainSkill(title);
  const summaryGroup = SECTION_GROUPS.find((group) => group.key === 'summary');
  const summary = sectionItems(sections, summaryGroup)[0] || paragraphs.find((line) => line.length > 40) || '';
  const normalizedSections = SECTION_GROUPS
    .map((group) => ({
      key: group.key,
      title: group.title,
      items: sectionItems(sections, group).slice(0, group.key === 'summary' ? 2 : 18)
    }))
    .filter((section) => section.items.length);

  return {
    id: makeId(path.basename(filePath)),
    order: index + 1,
    title,
    author,
    className,
    mainSkill,
    tags: makeTags(allText),
    summary,
    difficulty: /不需要昂贵|廉价|容易获取|低造价/.test(allText) ? '适合开荒' : '需要校对',
    sourceFile: path.basename(filePath),
    sections: normalizedSections,
    updatedAt: new Date().toISOString()
  };
}

function loadSourceBuilds() {
  if (fs.existsSync(sourceDir)) {
    const files = fs.readdirSync(sourceDir)
      .filter((name) => /^\d+_.*\.docx$/.test(name) && !name.startsWith('.~'))
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
    if (files.length) {
      const builds = files.map((name, index) => makeBuildFromDocx(path.join(sourceDir, name), index));
      fs.mkdirSync(path.dirname(sourceDataPath), { recursive: true });
      fs.writeFileSync(sourceDataPath, `${JSON.stringify({ updatedAt: new Date().toISOString(), builds }, null, 2)}\n`);
      return { builds, source: { name: '本地国服译名校对稿', path: sourceDir } };
    }
  }
  if (!fs.existsSync(sourceDataPath)) throw new Error(`缺少开荒 BD 源数据: ${sourceDataPath}`);
  const data = JSON.parse(fs.readFileSync(sourceDataPath, 'utf8'));
  return { builds: data.builds || [], source: { name: '仓库结构化开荒 BD', path: sourceDataPath } };
}

function buildStarterBuilds() {
  const { builds, source } = loadSourceBuilds();
  const output = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source,
    title: '开荒 BD',
    description: '国服译名校对后的开荒构筑，适合赛季初移动端快速查看。',
    builds
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`✅ POE1 开荒 BD 已生成: ${outputPath}`);
  console.log(`   BD: ${builds.length} | 来源: ${source.name}`);
  return output;
}

if (require.main === module) {
  try {
    buildStarterBuilds();
  } catch (error) {
    console.error('❌ POE1 开荒 BD 生成失败:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildStarterBuilds, makeBuildFromDocx };
