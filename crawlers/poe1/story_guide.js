const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SOURCE_ROOT = process.env.POE1_STORY_SOURCE_DIR
  || '/Users/zhangyajun/Documents/project/video2text/output/bilibili_POE_story_BV1W8411p7eX';

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const outputRoot = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const outputImageDir = path.join(outputRoot, 'story');
const outputJsonPath = path.join(outputRoot, 'story_guide.json');
const sourceMarkdownPath = path.join(SOURCE_ROOT, '流放之路_全章节剧情攻略整理.md');

const ACT_NAMES = ['第一章', '第二章', '第三章', '第四章', '第五章', '第六章', '第七章', '第八章', '第九章', '第十章'];

const ACT_ONE_POINTS = [
  { x: 17, y: 8, kind: 'main' },
  { x: 50, y: 8, kind: 'reward' },
  { x: 83, y: 8, kind: 'main' },
  { x: 17, y: 25, kind: 'reward' },
  { x: 50, y: 25, kind: 'main' },
  { x: 83, y: 25, kind: 'main' },
  { x: 17, y: 43, kind: 'boss' },
  { x: 50, y: 43, kind: 'reward' },
  { x: 83, y: 43, kind: 'main' },
  { x: 17, y: 62, kind: 'boss' }
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function slugAct(index) {
  return `act${String(index + 1).padStart(2, '0')}`;
}

function extractSection(markdown, title, nextTitle) {
  const start = markdown.indexOf(`## ${title}`);
  if (start < 0) return '';
  const end = nextTitle ? markdown.indexOf(`## ${nextTitle}`, start + 1) : markdown.indexOf('## 任务与奖励提醒', start + 1);
  return markdown.slice(start, end > start ? end : markdown.length);
}

function extractBlock(section, heading) {
  const start = section.indexOf(`${heading}：`);
  if (start < 0) return '';
  const after = section.slice(start + heading.length + 1);
  const next = after.search(/\n(?:核心路线|必拿\/注意|说明|贴吧章节地图)：/);
  return (next >= 0 ? after.slice(0, next) : after).trim();
}

function parseNumberedList(block) {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^(\d+)\.\s*(.+)$/))
    .filter(Boolean)
    .map((match) => ({ order: Number(match[1]), text: match[2].trim() }));
}

function parseBulletList(block) {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').trim());
}

function classifyStep(text) {
  if (/Boss|击败|奇塔弗|莫薇儿|多米纳斯|玛拉凯|阿拉卡利/.test(text)) return 'boss';
  if (/奖励|任务品|收集|必拿|拿/.test(text)) return 'reward';
  return 'main';
}

function getActMapImage(actId, index) {
  const sheetPath = path.join(SOURCE_ROOT, `p${String(index + 1).padStart(2, '0')}`, 'tieba_map_sheet.jpg');
  const pausePath = path.join(SOURCE_ROOT, `p${String(index + 1).padStart(2, '0')}`, 'pause_sheet.jpg');
  if (fs.existsSync(sheetPath)) return { source: sheetPath, output: `${actId}_map.jpg`, mode: 'map' };
  if (fs.existsSync(pausePath)) return { source: pausePath, output: `${actId}_pause.jpg`, mode: 'steps' };
  return { source: '', output: '', mode: 'steps' };
}

function optimizeImage(source, target) {
  if (!source) return;
  ensureDir(path.dirname(target));
  const result = spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', '1400', source, '--out', target], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    fs.copyFileSync(source, target);
  }
}

function buildAct(markdown, actName, index) {
  const actId = slugAct(index);
  const section = extractSection(markdown, actName, ACT_NAMES[index + 1]);
  const routeSteps = parseNumberedList(extractBlock(section, '核心路线'));
  const notes = parseBulletList(extractBlock(section, '必拿/注意'));
  const mapInfo = getActMapImage(actId, index);
  const imageTarget = mapInfo.output ? path.join(outputImageDir, mapInfo.output) : '';

  if (mapInfo.source) optimizeImage(mapInfo.source, imageTarget);

  const steps = routeSteps.map((step, stepIndex) => {
    const point = index === 0 ? ACT_ONE_POINTS[stepIndex] : null;
    return {
      id: `${actId}_step_${String(step.order).padStart(2, '0')}`,
      order: step.order,
      title: makeStepTitle(step.text),
      type: point?.kind || classifyStep(step.text),
      objective: step.text,
      tips: extractStepTips(step.text),
      ...(point ? { x: point.x, y: point.y } : {})
    };
  });

  return {
    id: actId,
    name: actName,
    mode: index === 0 ? 'map' : mapInfo.mode,
    mapImage: mapInfo.output ? `story/${mapInfo.output}` : '',
    hasRouteOverlay: index === 0,
    progressHint: `${steps.length} 步`,
    notes,
    steps,
    edges: index === 0
      ? steps.slice(0, -1).map((step, stepIndex) => ({
        from: step.id,
        to: steps[stepIndex + 1].id,
        type: step.type === 'boss' || steps[stepIndex + 1].type === 'boss' ? 'boss' : 'main'
      }))
      : []
  };
}

function makeStepTitle(text) {
  const candidates = text.match(/(?:进入|去|从|回|穿过|前往)([^，。；、]+)|击败([^，。；、]+)|拿([^，。；、]+)/);
  const title = (candidates || []).slice(1).find(Boolean);
  return (title || text).replace(/^第[一二三四五六七八九十]+章/, '').trim().slice(0, 18);
}

function extractStepTips(text) {
  const tips = [];
  if (/传送点/.test(text)) tips.push('看到传送点先激活，方便回城补给。');
  if (/Boss|击败|奇塔弗|莫薇儿|多米纳斯|玛拉凯/.test(text)) tips.push('Boss 前开传送门，药剂和抗性先补好。');
  if (/收集|任务品/.test(text)) tips.push('确认任务品进背包后再离开当前区域。');
  return tips;
}

function buildStoryGuide() {
  ensureDir(outputImageDir);
  const markdown = readText(sourceMarkdownPath);
  const acts = ACT_NAMES.map((name, index) => buildAct(markdown, name, index));
  const result = {
    schemaVersion: 1,
    title: '剧情跑图导航',
    source: {
      name: 'B站鱼哞哞er剧情导航整理 + 贴吧地图参考',
      url: 'https://www.bilibili.com/video/BV1W8411p7eX'
    },
    updatedAt: new Date().toISOString(),
    summary: '按章节整理剧情路线、关键奖励和 Boss 注意事项。第 1 章已支持地图点位与箭头，其余章节先提供步骤导航。',
    acts
  };
  ensureDir(path.dirname(outputJsonPath));
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`✅ POE1 剧情导航已生成: ${outputJsonPath}`);
  console.log(`   章节: ${acts.length} | 地图资源: ${acts.filter((act) => act.mapImage).length} | 第1章箭头: ${acts[0].edges.length}`);
  return result;
}

if (require.main === module) {
  try {
    buildStoryGuide();
  } catch (error) {
    console.error('❌ POE1 剧情导航生成失败:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildStoryGuide };
