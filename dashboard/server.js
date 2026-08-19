#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const OSS = require('ali-oss');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, 'auto_browser', '.env') });
const PUBLIC_DIR = path.join(__dirname, 'public');
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const LOG_DIR = path.join(RUNTIME_DIR, 'logs');
const STATE_FILE = path.join(RUNTIME_DIR, 'state.json');
const AUTOMATION_SETTINGS_FILE = path.join(RUNTIME_DIR, 'automation-settings.json');
const FORUM_SUMMARY_FILE = path.join(RUNTIME_DIR, 'forum-content-scan.json');
const CONTENT_RESEARCH_FILE = path.join(RUNTIME_DIR, 'content-research.json');
const DIFY_DIR = '/Users/zhangyajun/Documents/自媒体/_content_factory/dify/scheduler';
const DIFY_SCRIPT = path.join(DIFY_DIR, 'dify_auto_publish.py');
const DIFY_OUT_DIR = path.join(DIFY_DIR, 'auto_out');
const DIFY_CRON_LOG = path.join(DIFY_DIR, 'cron.log');
const DIFY_CUSTOM_INPUTS_FILE = path.join(RUNTIME_DIR, 'dify-custom-inputs.json');
const DIFY_SELECT_OPTIONS = {
  ref_account: ['自动（默认艾泽拉斯前哨）', '艾泽拉斯前哨', '艾泽拉斯快讯', '魔兽世界情报局', '重返艾泽拉斯', '大脚BIGFOOT'],
  platform: ['头条号', '公众号', '双平台'],
  article_type: ['暗金观察长文', '魔兽资讯短文', '数码资讯短文', '汽车资讯短文', '公众号收藏攻略', '双平台错开选题', '暗金短评'],
};
const PORT = Number(process.env.DASHBOARD_PORT || 5177);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const TASKS = [
  {
    id: 'daily_publish',
    name: '一键更新日常数据并上传',
    description: '日常推荐：刷新小程序仍在使用的 POE2 国际服通货、DD373 国服换算、流放急救箱、我的关注变化与首页复访摘要；任一步失败会停止上传，避免空数据覆盖线上。不抓新闻、天梯、剧情攻略，也不更新已下架的 0.5 资料、赛季开荒/热门 BD。',
    group: 'recommended',
    game: 'poe2',
    steps: ['economy_digest', 'cn_market_dd373', 'problem_guides', 'follow_updates', 'daily_return_digest', 'poe2_manifest', 'upload'],
  },
  {
    id: 'ladder_bd_publish',
    name: '刷新天梯/BD解析并上传',
    description: '重新抓取 poe.ninja 天梯玩家详情，刷新装备、技能、符文/镶嵌翻译、天梯分析及技能/装备查 BD 索引，并上传 OSS。',
    group: 'recommended',
    game: 'poe2',
    steps: ['ladder', 'ladder_build_index', 'follow_updates', 'daily_return_digest', 'poe2_manifest', 'upload'],
  },
  {
    id: 'poe1_publish',
    name: '更新 POE1 抄 BD / 看行情',
    description: '刷新国服官方天梯、官方入门流派、玩家开荒 BD、剧情跑图导航、天赋树截图、国际服游戏内通货行情和国服行情接口，并上传 POE1 专用 OSS 路径；不会影响 POE2 数据。',
    group: 'recommended',
    game: 'poe1',
    steps: ['poe1_ladder', 'poe1_official_starter', 'poe1_starter_builds', 'poe1_starter_terms', 'poe1_story_guide', 'poe1_passive_trees', 'poe1_economy', 'poe1_cn_economy', 'poe1_manifest', 'poe1_upload'],
  },
  {
    id: 'forum_content_scan',
    name: '更新论坛选题池',
    description: '采集现有论坛选题池，并补充 POE1/POE2、暗黑破坏神、魔兽世界的资讯和热点参考。只用于自媒体选题和小程序策略，不上传 OSS，不进入小程序日常发布。',
    group: 'content_research',
    game: 'all',
    localOnly: true,
    command: ['bash', ['scripts/run_forum_content_scan.sh']],
  },
  {
    id: 'dify_publish_all',
    name: 'Dify 生成今日全部文章',
    description: '按今日计划生成全部头条号文章，输出到自媒体 auto_out 目录。',
    group: 'dify',
    game: 'all',
    localOnly: true,
    hidden: true,
    command: ['/usr/bin/python3', [DIFY_SCRIPT]],
  },
  {
    id: 'dify_publish_1',
    name: 'Dify 生成今日第 1 篇',
    description: '只生成今日计划中的第 1 篇头条号文章。',
    group: 'dify',
    game: 'all',
    localOnly: true,
    hidden: true,
    command: ['/usr/bin/python3', [DIFY_SCRIPT, '--only', '1']],
  },
  {
    id: 'dify_publish_2',
    name: 'Dify 生成今日第 2 篇',
    description: '只生成今日计划中的第 2 篇头条号文章。',
    group: 'dify',
    game: 'all',
    localOnly: true,
    hidden: true,
    command: ['/usr/bin/python3', [DIFY_SCRIPT, '--only', '2']],
  },
  {
    id: 'dify_custom',
    name: 'Dify 按表单生成文章',
    description: '用自媒体发文面板的自定义表单输入生成一篇，输出到 auto_out 当天目录（custom_ 前缀）。',
    group: 'dify',
    game: 'all',
    localOnly: true,
    hidden: true,
    command: ['/usr/bin/python3', [DIFY_SCRIPT, '--inputs-file', DIFY_CUSTOM_INPUTS_FILE]],
  },
  {
    id: 'ladder',
    name: '抓取天梯 + 聚合分析',
    description: '抓取 poe.ninja 天梯玩家详情，生成 players/*.json、职业/技能/装备趋势分析；会刷新 BD 解析里的装备、技能、符文/镶嵌翻译。聚合阶段也会先生成一次查 BD 索引。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['crawlers/run.js', '--ladder']],
  },
  {
    id: 'poe1_ladder',
    name: '生成 POE1 国服天梯摘要',
    description: '读取国服官方天梯公开数据，生成职业、主技能和可查看的代表 BD 摘要。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/build_digest.js']],
  },
  {
    id: 'poe1_starter_builds',
    name: '生成 POE1 开荒 BD',
    description: '读取国服译名校对后的开荒 BD 文档或仓库结构化源数据，生成 starter_builds.json。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/starter_builds.js']],
  },
  {
    id: 'poe1_official_starter',
    name: '生成 POE1 官方入门流派',
    description: '读取国服官方推荐流派结构化源，校验官方活动页可访问，生成 official_starter_builds.json。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/official_starter.js']],
  },
  {
    id: 'poe1_starter_terms',
    name: '匹配 POE1 开荒术语',
    description: '抽取开荒 BD 中的技能、装备和英文括注，优先和国服官方天梯真实数据匹配，输出待补全清单。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/starter_terms.js']],
  },
  {
    id: 'poe1_economy',
    name: '生成 POE1 经济摘要',
    description: '读取 poe.ninja POE1 当前赛季公开经济数据，生成通货、碎片、精华和圣油的游戏内换算及变化。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/economy_digest.js']],
  },
  {
    id: 'poe1_cn_economy',
    name: '生成 POE1 国服行情接口',
    description: '合并 DD373 S30 国服公开报价与 FilterEditor 公开物价源，生成 POE1 国服行情接口；可用 base-data/poe1/cn_economy_manual.json 人工核验补充。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/cn_economy_digest.js']],
  },
  {
    id: 'poe1_story_guide',
    name: '生成 POE1 剧情跑图导航',
    description: '读取本地 B 站剧情整理与章节地图素材，生成小程序剧情跑图 JSON 和轻量地图图。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/story_guide.js']],
  },
  {
    id: 'poe1_passive_trees',
    name: '截取 POE1 天赋树图片',
    description: '打开 poe.ninja 当前赛季 BD 详情页，截取天赋树 canvas 为图片，供小程序详情页直接展示。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/capture_passive_trees.js']],
  },
  {
    id: 'poe1_manifest',
    name: '生成 POE1 数据 manifest',
    description: '为 POE1 小程序数据生成游戏级 manifest，供合并小程序和新版 Dashboard 读取。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['scripts/build_game_manifests.js', '--game=poe1']],
  },
  {
    id: 'poe1_upload',
    name: '上传 POE1 数据到 OSS',
    description: '将 POE1 小程序摘要和天赋树图片上传到 poe1-season 独立前缀。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['scripts/upload_poe1_to_oss.js']],
  },
  {
    id: 'ladder_build_index',
    name: '生成技能/装备查 BD 索引',
    description: '从当前 players/*.json 重新生成轻量目录和按需详情，确保小程序查询数据与本次天梯玩家详情一致。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['scripts/build_ladder_build_index.js']],
  },
  {
    id: 'economy_digest',
    name: '抓取 poe.ninja 经济摘要',
    description: '直接请求 poe.ninja PoE2 当前赛季经济 API，生成首页摘要 economy_digest.json、国际服分类清单 international_market_catalog.json、兼容 economy.json 和展示图标；通货为空会直接失败，不覆盖线上数据。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['crawlers/economy/ninja_digest.js']],
  },
  {
    id: 'cn_market_dd373',
    name: '抓取 DD373 国服行情',
    description: '抓取 DD373 流放之路：降临奥杜尔秘符赛季核心通货公开商品列表，生成 cn_market_digest.json。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['crawlers/cn-market/dd373_currency.js']],
  },
  {
    id: 'problem_guides',
    name: '生成流放急救箱',
    description: '合并人工整理的问题排查清单，生成小程序可动态读取的 problem_guides.json。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['scripts/build_problem_guides.js']],
  },
  {
    id: 'daily_return_digest',
    name: '生成首页复访摘要',
    description: '基于经济、天梯和急救箱现有产物，生成首页今日变化 daily_return_digest.json。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['scripts/build_daily_return_digest.js']],
  },
  {
    id: 'follow_updates',
    name: '生成我的关注变化摘要',
    description: '基于最新天梯索引和国服行情，对比上一版生成技能、装备、通货的关注变化 follow_updates.json。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['scripts/build_follow_updates.js']],
  },
  {
    id: 'poe2_manifest',
    name: '生成 POE2 数据 manifest',
    description: '为 POE2 小程序数据生成游戏级 manifest，供合并小程序和新版 Dashboard 读取。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['scripts/build_game_manifests.js', '--game=poe2']],
  },
  {
    id: 'upload',
    name: '上传 OSS',
    description: '上传当前环境 translated-data 到 OSS。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['-e', "require('./auto_browser/upload_to_oss')()"]],
  },
];

const taskMap = Object.fromEntries(TASKS.map(task => [task.id, task]));
let currentRun = null;
let currentChild = null;
let currentStopRequested = false;

function ensureRuntime() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) writeJson(STATE_FILE, { runs: {}, history: [] });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getState() {
  ensureRuntime();
  return readJson(STATE_FILE, { runs: {}, history: [] });
}

function normalizeAutomationTaskIds(taskIds) {
  const availableIds = new Set(TASKS.filter(task => !task.hidden).map(task => task.id));
  const seen = new Set();
  const normalized = (Array.isArray(taskIds) ? taskIds : [])
    .map(id => String(id || ''))
    .filter(id => availableIds.has(id))
    .filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  return normalized.length ? normalized : ['daily_publish'];
}

function clampNumber(value, min, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, number);
}

function sanitizeAutomationSettings(settings) {
  const taskIds = normalizeAutomationTaskIds(settings?.taskIds || (settings?.taskId ? [settings.taskId] : []));
  const hasUpdatedAt = settings && Object.prototype.hasOwnProperty.call(settings, 'updatedAt');
  return {
    enabled: settings?.enabled === true,
    taskId: taskIds[0],
    taskIds,
    intervalMinutes: clampNumber(settings?.intervalMinutes, 10, 120),
    jitterMinutes: clampNumber(settings?.jitterMinutes, 0, 10),
    nextRunAt: Number(settings?.nextRunAt) || 0,
    updatedAt: hasUpdatedAt ? Number(settings.updatedAt) || 0 : Date.now(),
  };
}

function getAutomationSettings() {
  ensureRuntime();
  if (!fs.existsSync(AUTOMATION_SETTINGS_FILE)) {
    return sanitizeAutomationSettings({ updatedAt: 0 });
  }
  return sanitizeAutomationSettings(readJson(AUTOMATION_SETTINGS_FILE, { updatedAt: 0 }));
}

const RESEARCH_PILLARS = ['抄BD', '看行情', '解卡点', '新闻资讯', '热点信息', '内容观察'];

function getTopicPillar(topic) {
  return getTopicPillars(topic)[0] || '内容观察';
}

function getTopicPillars(topic) {
  const direct = topic?.signals?.miniappPage || topic?.miniappPage || topic?.pillar || topic?.category || '';
  const pillars = [];
  if (RESEARCH_PILLARS.includes(direct)) pillars.push(direct);
  const tags = [
    ...(Array.isArray(topic?.tags) ? topic.tags : []),
    ...(Array.isArray(topic?.signals?.tags) ? topic.signals.tags : []),
  ];
  RESEARCH_PILLARS.forEach(pillar => {
    if (tags.includes(pillar) && !pillars.includes(pillar)) pillars.push(pillar);
  });
  if (pillars.length) return pillars;
  return [direct || '内容观察'];
}

function setAutomationSettings(settings) {
  const nextSettings = sanitizeAutomationSettings({
    ...settings,
    updatedAt: Date.now(),
  });
  writeJson(AUTOMATION_SETTINGS_FILE, nextSettings);
  return nextSettings;
}

function setTaskState(run) {
  const state = getState();
  state.runs[run.taskId] = run;
  state.history = [run, ...(state.history || []).filter(item => item.runId !== run.runId)].slice(0, 50);
  writeJson(STATE_FILE, state);
}

function getEnvironmentName(value) {
  return value === 'dev' ? 'dev' : 'release';
}

function getNodeEnv(environment) {
  return getEnvironmentName(environment) === 'dev' ? 'dev' : 'production';
}

function getDataDir(environment) {
  return path.join(ROOT, 'translated-data', getEnvironmentName(environment));
}

function getGameDataDir(game, environment) {
  const env = getEnvironmentName(environment);
  if (game === 'poe1') return path.join(ROOT, 'translated-data', 'poe1', env);
  return path.join(ROOT, 'translated-data', env);
}

function getSurveyConfigPath(environment) {
  return path.join(getDataDir(environment), 'miniprogram_config', 'feature_survey.json');
}

function getSurveySummary(environment) {
  const filePath = getSurveyConfigPath(environment);
  const config = readJson(filePath, {});
  return {
    file: getFileInfo(filePath),
    enabled: config.enabled === true,
    campaignId: String(config.campaignId || ''),
    title: String(config.title || '功能调研'),
  };
}

async function uploadSurveyConfig(environment, filePath) {
  const client = new OSS({
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
  });
  const normalizedEnvironment = getEnvironmentName(environment);
  const remotePath = `poe2-ladders/${normalizedEnvironment}/miniprogram_config/feature_survey.json`;
  await client.put(remotePath, filePath, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'max-age=60',
    },
  });
  return remotePath;
}

function relativeToRoot(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function countFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  for (const item of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) count += countFiles(fullPath);
    else if (item !== '.DS_Store') count += 1;
  }
  return count;
}

function getFileInfo(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    path: relativeToRoot(filePath),
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

function getArrayLength(data) {
  if (Array.isArray(data)) return data.length;
  if (data && Array.isArray(data.items)) return data.items.length;
  if (data && Array.isArray(data.news)) return data.news.length;
  if (data && Array.isArray(data.data)) return data.data.length;
  if (data && Array.isArray(data.candidates)) return data.candidates.length;
  if (data && Array.isArray(data.guides)) return data.guides.length;
  if (data && Array.isArray(data.builds)) return data.builds.length;
  if (data && Array.isArray(data.chapters)) return data.chapters.length;
  if (data && data.counters && Number.isFinite(Number(data.counters.total))) return Number(data.counters.total);
  if (data && Array.isArray(data.categories)) {
    return data.categories.reduce((sum, item) => sum + Number(item.count || 0), 0);
  }
  return 0;
}

function summarizeJson(filePath) {
  const info = getFileInfo(filePath);
  if (!info) return null;
  const data = readJson(filePath, null);
  if (!data) return { ...info, count: 0 };
  return {
    ...info,
    count: getArrayLength(data),
  };
}

function getGameFileSummary(dataDir, relativePath) {
  const filePath = path.join(dataDir, relativePath);
  const info = getFileInfo(filePath);
  const data = info ? readJson(filePath, null) : null;
  return {
    path: relativePath,
    exists: Boolean(info),
    updatedAt: info ? info.updatedAt : '',
    size: info ? info.size : 0,
    count: data ? getArrayLength(data) : 0,
  };
}

function getPoe2GameSummary(environment) {
  const env = getEnvironmentName(environment);
  const dataDir = getGameDataDir('poe2', env);
  const ladderAnalysis = readJson(path.join(dataDir, 'ladder_analysis.json'), {});
  const ladderBuildIndex = readJson(path.join(dataDir, 'miniprogram_data/ladder_build_index.json'), {});
  const economyDigest = readJson(path.join(dataDir, 'miniprogram_data/economy_digest.json'), {});
  const cnMarketDigest = readJson(path.join(dataDir, 'miniprogram_data/cn_market_digest.json'), {});
  const problemGuides = readJson(path.join(dataDir, 'miniprogram_data/problem_guides.json'), {});
  const files = {
    manifest: getGameFileSummary(dataDir, 'miniprogram_data/manifest.json'),
    ladderAnalysis: getGameFileSummary(dataDir, 'ladder_analysis.json'),
    ladderBuildIndex: getGameFileSummary(dataDir, 'miniprogram_data/ladder_build_index.json'),
    economyDigest: getGameFileSummary(dataDir, 'miniprogram_data/economy_digest.json'),
    cnMarketDigest: getGameFileSummary(dataDir, 'miniprogram_data/cn_market_digest.json'),
    dailyReturnDigest: getGameFileSummary(dataDir, 'miniprogram_data/daily_return_digest.json'),
    followUpdates: getGameFileSummary(dataDir, 'miniprogram_data/follow_updates.json'),
    problemGuides: getGameFileSummary(dataDir, 'miniprogram_data/problem_guides.json'),
  };
  const missingFiles = Object.entries(files).filter(([, file]) => !file.exists).map(([key]) => key);
  const health = {
    status: missingFiles.length ? 'warn' : 'ok',
    fileCount: countFiles(dataDir),
    miniprogramFileCount: countFiles(path.join(dataDir, 'miniprogram_data')),
    missingFiles,
  };
  return {
    game: 'poe2',
    name: '流放之路2：降临',
    shortName: 'POE2',
    miniprogram: 'daily-talk',
    environment: env,
    dataDir: relativeToRoot(dataDir),
    canonicalOssPrefix: `poe2/${env}/`,
    legacyOssPrefixes: [`poe2-ladders/${env}/`],
    exists: fs.existsSync(dataDir),
    fileCount: health.fileCount,
    missingFiles,
    health,
    files,
    summary: {
      seasonName: economyDigest.league?.displayName || economyDigest.league?.name || cnMarketDigest.game?.league || '',
      updatedAt: [ladderAnalysis.updateTime, ladderBuildIndex.updatedAt, economyDigest.updatedAt, cnMarketDigest.updatedAt]
        .filter(Boolean)
        .sort()
        .pop() || '',
      ladderPlayers: Number(ladderAnalysis.totalPlayers || ladderBuildIndex.totalPlayers || 0),
      sampledPlayers: Number(ladderAnalysis.sampledPlayers || 0),
      classes: Array.isArray(ladderAnalysis.classDistribution) ? ladderAnalysis.classDistribution.length : 0,
      skills: Array.isArray(ladderBuildIndex.skills) ? ladderBuildIndex.skills.length : 0,
      equipment: Array.isArray(ladderBuildIndex.equipment) ? ladderBuildIndex.equipment.length : 0,
      economyItems: Number(economyDigest.summary?.selectedItemCount || economyDigest.summary?.itemCount || 0),
      cnMarketItems: Number(cnMarketDigest.summary?.availableCount || 0),
      guides: Array.isArray(problemGuides.items) ? problemGuides.items.length : 0,
    },
  };
}

function getPoe1GameSummary(environment) {
  const env = getEnvironmentName(environment);
  const dataDir = getGameDataDir('poe1', env);
  const ladderDigest = readJson(path.join(dataDir, 'miniprogram_data/ladder_digest.json'), {});
  const economyDigest = readJson(path.join(dataDir, 'miniprogram_data/economy_digest.json'), {});
  const cnEconomyDigest = readJson(path.join(dataDir, 'miniprogram_data/cn_economy_digest.json'), {});
  const officialStarter = readJson(path.join(dataDir, 'miniprogram_data/official_starter_builds.json'), {});
  const starterBuilds = readJson(path.join(dataDir, 'miniprogram_data/starter_builds.json'), {});
  const storyGuide = readJson(path.join(dataDir, 'miniprogram_data/story_guide.json'), {});
  const files = {
    manifest: getGameFileSummary(dataDir, 'miniprogram_data/manifest.json'),
    ladderDigest: getGameFileSummary(dataDir, 'miniprogram_data/ladder_digest.json'),
    economyDigest: getGameFileSummary(dataDir, 'miniprogram_data/economy_digest.json'),
    cnEconomyDigest: getGameFileSummary(dataDir, 'miniprogram_data/cn_economy_digest.json'),
    officialStarterBuilds: getGameFileSummary(dataDir, 'miniprogram_data/official_starter_builds.json'),
    starterBuilds: getGameFileSummary(dataDir, 'miniprogram_data/starter_builds.json'),
    starterTermsEnrichment: getGameFileSummary(dataDir, 'miniprogram_data/starter_terms_enrichment.json'),
    storyGuide: getGameFileSummary(dataDir, 'miniprogram_data/story_guide.json'),
  };
  const missingFiles = Object.entries(files).filter(([, file]) => !file.exists).map(([key]) => key);
  const health = {
    status: missingFiles.length ? 'warn' : 'ok',
    fileCount: countFiles(dataDir),
    miniprogramFileCount: countFiles(path.join(dataDir, 'miniprogram_data')),
    missingFiles,
  };
  return {
    game: 'poe1',
    name: '流放之路',
    shortName: 'POE1',
    miniprogram: 'poe-mini',
    environment: env,
    dataDir: relativeToRoot(dataDir),
    canonicalOssPrefix: `poe1/${env}/`,
    legacyOssPrefixes: [`poe1-season/${env}/`],
    exists: fs.existsSync(dataDir),
    fileCount: health.fileCount,
    missingFiles,
    health,
    files,
    summary: {
      seasonName: cnEconomyDigest.league?.displayName || economyDigest.league?.displayName || ladderDigest.league?.displayName || '',
      updatedAt: [ladderDigest.updatedAt, economyDigest.updatedAt, cnEconomyDigest.updatedAt, officialStarter.updatedAt]
        .filter(Boolean)
        .sort()
        .pop() || '',
      ladderPlayers: Number(ladderDigest.totalCharacters || 0),
      sampledPlayers: Array.isArray(ladderDigest.builds) ? ladderDigest.builds.length : 0,
      classes: new Set((Array.isArray(ladderDigest.builds) ? ladderDigest.builds : []).map(item => item.className).filter(Boolean)).size,
      skills: Array.isArray(ladderDigest.popularSkills) ? ladderDigest.popularSkills.length : 0,
      equipment: 0,
      economyItems: Number(economyDigest.core?.length || 0),
      cnMarketItems: Number(cnEconomyDigest.core?.length || 0),
      guides: getArrayLength(officialStarter) + getArrayLength(starterBuilds) + getArrayLength(storyGuide),
    },
  };
}

function getGameSummaries(environment) {
  return [getPoe2GameSummary(environment), getPoe1GameSummary(environment)];
}

function getDataSummary(environment) {
  const dataDir = getDataDir(environment);
  const ladder = readJson(path.join(dataDir, 'all_ladders_translated.json'), null);
  const ladderAnalysis = readJson(path.join(dataDir, 'ladder_analysis.json'), null);
  const ladderBuildIndex = readJson(path.join(dataDir, 'miniprogram_data/ladder_build_index.json'), null);
  const economyDigest = readJson(path.join(dataDir, 'miniprogram_data/economy_digest.json'), null);

  const ladderClasses = ladder && ladder.ladders ? Object.keys(ladder.ladders) : [];
  const ladderPlayers = ladderClasses.reduce((sum, className) => {
    const list = ladder.ladders[className];
    return sum + (Array.isArray(list) ? list.length : 0);
  }, 0);

  return {
    environment: getEnvironmentName(environment),
    dataDir: relativeToRoot(dataDir),
    exists: fs.existsSync(dataDir),
    fileCount: countFiles(dataDir),
    keyFiles: {
      storyGuides: summarizeJson(path.join(dataDir, 'miniprogram_data/story_guides.json')),
      economyDigest: summarizeJson(path.join(dataDir, 'miniprogram_data/economy_digest.json')),
      cnMarketDigest: summarizeJson(path.join(dataDir, 'miniprogram_data/cn_market_digest.json')),
      problemGuides: summarizeJson(path.join(dataDir, 'miniprogram_data/problem_guides.json')),
      surveyConfig: summarizeJson(path.join(dataDir, 'miniprogram_config/feature_survey.json')),
    },
    ladder: {
      file: getFileInfo(path.join(dataDir, 'all_ladders_translated.json')),
      classes: ladderClasses.length,
      players: ladderPlayers,
      updateTime: ladder && ladder.updateTime ? ladder.updateTime : '',
    },
    ladderAnalysis: {
      file: getFileInfo(path.join(dataDir, 'ladder_analysis.json')),
      classes: ladderAnalysis && Array.isArray(ladderAnalysis.classDistribution) ? ladderAnalysis.classDistribution.length : 0,
      updatedAt: ladderAnalysis && ladderAnalysis.generatedAt ? ladderAnalysis.generatedAt : '',
    },
    ladderBuildIndex: {
      file: getFileInfo(path.join(dataDir, 'miniprogram_data/ladder_build_index.json')),
      skills: ladderBuildIndex && Array.isArray(ladderBuildIndex.skills) ? ladderBuildIndex.skills.length : 0,
      equipment: ladderBuildIndex && Array.isArray(ladderBuildIndex.equipment) ? ladderBuildIndex.equipment.length : 0,
    },
    economy: {
      items: economyDigest && economyDigest.summary ? economyDigest.summary.selectedItemCount : 0,
      updatedAt: economyDigest && economyDigest.updatedAt ? economyDigest.updatedAt : '',
      cnMarketItems: readJson(path.join(dataDir, 'miniprogram_data/cn_market_digest.json'), null)?.summary?.availableCount || 0,
    },
    survey: getSurveySummary(environment),
    games: getGameSummaries(environment),
  };
}

function getForumResearchSummary() {
  const summary = readJson(FORUM_SUMMARY_FILE, null);
  if (!summary) return null;
  return {
    ...summary,
    excel: {
      ...(summary.excel || {}),
      updatedAt: summary.excel?.updatedAt || '',
    },
  };
}

function getContentResearchSummary() {
  const summary = readJson(CONTENT_RESEARCH_FILE, null);
  if (!summary) return null;
  const topics = Array.isArray(summary.topics) ? summary.topics.slice(0, 80) : [];
  const byMiniappPage = topics.reduce((result, topic) => {
    getTopicPillars(topic).forEach(page => {
      if (!result[page]) result[page] = [];
      result[page].push(topic);
    });
    return result;
  }, {});
  return {
    generatedAt: summary.generatedAt || '',
    status: summary.status || 'unknown',
    counters: summary.counters || {},
    sources: Array.isArray(summary.sources) ? summary.sources.slice(0, 12) : [],
    topTopics: Array.isArray(summary.topTopics) ? summary.topTopics.slice(0, 8) : [],
    actionItems: Array.isArray(summary.actionItems) ? summary.actionItems.slice(0, 10) : [],
    topics,
    byMiniappPage,
    trend: summary.trend || {},
    history: summary.history || {},
    exports: summary.exports || {},
    note: summary.note || '',
  };
}

function appendLog(logFile, text) {
  fs.appendFileSync(logFile, text);
}

let difyPlanCache = { at: 0, data: null };
let difyCronCache = { at: 0, data: null };

function getDifyPlan() {
  if (difyPlanCache.data && Date.now() - difyPlanCache.at < 10 * 60 * 1000) {
    return difyPlanCache.data;
  }
  const fallback = { today: '', weekday: -1, plan: {} };
  if (!fs.existsSync(DIFY_SCRIPT)) return fallback;
  try {
    const stdout = require('child_process').execFileSync('python3', [DIFY_SCRIPT, '--plan-json'], {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const data = JSON.parse(stdout);
    difyPlanCache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.error('读取 Dify 计划失败:', error.message);
    return difyPlanCache.data || fallback;
  }
}

function parseDifyCronSchedule(crontabText) {
  const line = (crontabText || '')
    .split('\n')
    .find(row => row.includes('dify_auto_publish.py') && !row.trim().startsWith('#'));
  if (!line) return null;
  const fields = line.trim().split(/\s+/);
  if (fields.length < 5) return null;
  const minute = Number(fields[0]);
  const hour = Number(fields[1]);
  const dowRaw = fields[4];
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null;
  if (fields[2] !== '*' || fields[3] !== '*') return null;
  let weekdays = null;
  if (dowRaw !== '*') {
    weekdays = dowRaw.split(',').map(Number).filter(Number.isInteger);
  }
  return { minute, hour, weekdays, raw: line.trim() };
}

function nextDifyRun(schedule) {
  if (!schedule) return '';
  const now = new Date();
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(schedule.hour, schedule.minute, 0, 0);
    if (candidate <= now) continue;
    if (schedule.weekdays && !schedule.weekdays.includes(candidate.getDay())) continue;
    return candidate.toISOString();
  }
  return '';
}

function getDifyCronInfo() {
  if (difyCronCache.data && Date.now() - difyCronCache.at < 60 * 1000) {
    return difyCronCache.data;
  }
  const data = { installed: false, scheduleText: '', nextRun: '', logTail: '' };
  try {
    const crontab = require('child_process').execFileSync('crontab', ['-l'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const schedule = parseDifyCronSchedule(crontab);
    if (schedule) {
      data.installed = true;
      data.nextRun = nextDifyRun(schedule);
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const daysText = schedule.weekdays
        ? schedule.weekdays.map(day => dayNames[day]).join('、')
        : '每天';
      data.scheduleText = `${daysText} ${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
    }
  } catch (error) {
    data.error = error.message;
  }
  if (fs.existsSync(DIFY_CRON_LOG)) {
    try {
      const stat = fs.statSync(DIFY_CRON_LOG);
      const length = Math.min(stat.size, 8 * 1024);
      const fd = fs.openSync(DIFY_CRON_LOG, 'r');
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, stat.size - length);
      fs.closeSync(fd);
      data.logTail = buffer
        .toString('utf-8')
        .trim()
        .split('\n')
        .slice(-15)
        .join('\n');
    } catch (error) {
      data.logTail = '';
    }
  }
  difyCronCache = { at: Date.now(), data };
  return data;
}

function extractDifyArticleMeta(content, fileName) {
  const statusMatch = content.match(/^发布状态：(.*)$/m);
  const wordsMatch = content.match(/头条号正文：(\d+) 字/);
  const titleMatch = content.match(/【标题候选】\s*\n1[.、]\s*(.*)/);
  return {
    fileName,
    custom: fileName.startsWith('custom_'),
    type: fileName
      .replace(/^(\d+|custom)_/, '')
      .replace(/^\d{6}_/, '')
      .replace(/\.md$/, ''),
    status: statusMatch ? statusMatch[1].trim() : '',
    words: wordsMatch ? Number(wordsMatch[1]) : null,
    title: titleMatch ? titleMatch[1].trim() : '',
  };
}

function getDifyArticles() {
  if (!fs.existsSync(DIFY_OUT_DIR)) return [];
  const dates = fs
    .readdirSync(DIFY_OUT_DIR)
    .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 10);
  const articles = [];
  for (const date of dates) {
    const dayDir = path.join(DIFY_OUT_DIR, date);
    let files = [];
    try {
      files = fs
        .readdirSync(dayDir)
        .filter(name => name.endsWith('.md') && /^(\d+|custom)_/.test(name))
        .sort();
    } catch (error) {
      continue;
    }
    for (const fileName of files) {
      const filePath = path.join(dayDir, fileName);
      try {
        const stat = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        articles.push({
          date,
          ...extractDifyArticleMeta(content, fileName),
          bytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch (error) {
        continue;
      }
    }
  }
  return articles;
}

function getDifyStatus() {
  const plan = getDifyPlan();
  const todayKey = plan.weekday >= 0 ? String(plan.weekday) : '';
  const todayPlan = (plan.plan && plan.plan[todayKey]) || [];
  const articles = getDifyArticles();
  const todayArticles = articles.filter(article => article.date === plan.today);
  const pending = todayPlan.map((task, index) => {
    const fileName = `${index + 1}_${task.article_type}.md`;
    const exists = todayArticles.some(article => article.fileName === fileName);
    return { index: index + 1, ...task, fileName, done: exists };
  });
  let configOk = false;
  try {
    const config = readJson(path.join(DIFY_DIR, 'config.json'), null);
    configOk = Boolean(config && config.api_key && config.api_key.startsWith('app-'));
  } catch (error) {
    configOk = false;
  }
  return {
    today: plan.today,
    inSchedule: todayPlan.length > 0,
    todayPlan: pending,
    articles,
    cron: getDifyCronInfo(),
    configOk,
    scriptExists: fs.existsSync(DIFY_SCRIPT),
  };
}

function getDifyArticleFile(date, fileName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(\d+|custom)_[^/\\]+\.md$/.test(fileName)) {
    return null;
  }
  const filePath = path.join(DIFY_OUT_DIR, date, fileName);
  if (!filePath.startsWith(DIFY_OUT_DIR) || !fs.existsSync(filePath)) return null;
  return filePath;
}

function createRun(taskId, environment) {
  const runId = `${Date.now()}_${taskId}_${Math.random().toString(16).slice(2, 8)}`;
  const logFile = path.join(LOG_DIR, `${runId}.log`);
  return {
    runId,
    taskId,
    taskName: taskMap[taskId] ? taskMap[taskId].name : taskId,
    environment: getEnvironmentName(environment),
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    durationMs: 0,
    exitCode: null,
    logPath: relativeToRoot(logFile),
    error: '',
  };
}

function runCommand(command, environment, logFile) {
  const [bin, args] = command;
  return new Promise((resolve, reject) => {
    if (currentStopRequested) {
      reject(new Error('任务已停止'));
      return;
    }

    appendLog(logFile, `$ ${bin} ${args.join(' ')}\n`);
    appendLog(logFile, `NODE_ENV=${getNodeEnv(environment)}\n\n`);

    const child = spawn(bin, args, {
      cwd: ROOT,
      shell: false,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        NODE_ENV: getNodeEnv(environment),
      },
    });
    currentChild = child;

    child.stdout.on('data', chunk => appendLog(logFile, chunk.toString()));
    child.stderr.on('data', chunk => appendLog(logFile, chunk.toString()));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (currentChild === child) currentChild = null;
      appendLog(logFile, `\n[exit ${code}${signal ? ` signal ${signal}` : ''}]\n`);
      if (currentStopRequested) reject(new Error('任务已停止'));
      else if (code === 0) resolve(code);
      else {
        const error = new Error(`命令退出码 ${code}`);
        error.exitCode = code;
        reject(error);
      }
    });
  });
}

async function executeRun(run) {
  const task = taskMap[run.taskId];
  const logFile = path.join(ROOT, run.logPath);
  currentStopRequested = false;

  try {
    if (task.steps) {
      appendLog(logFile, `# ${task.name}\n`);
      appendLog(logFile, `环境: ${run.environment}\n`);
      appendLog(logFile, `步骤: ${task.steps.join(' -> ')}\n\n`);
      for (const stepId of task.steps) {
        const step = taskMap[stepId];
        appendLog(logFile, `\n${'='.repeat(72)}\n`);
        appendLog(logFile, `${step.name}\n`);
        appendLog(logFile, `${'='.repeat(72)}\n`);
        await runCommand(step.command, run.environment, logFile);
      }
    } else {
      appendLog(logFile, `# ${task.name}\n环境: ${run.environment}\n\n`);
      await runCommand(task.command, run.environment, logFile);
    }

    run.status = 'success';
    run.exitCode = 0;
  } catch (error) {
    const forumSummary = run.taskId === 'forum_content_scan' ? getForumResearchSummary() : null;
    const isPartialForumRun = !currentStopRequested && forumSummary?.status === 'partial';
    run.status = currentStopRequested ? 'stopped' : isPartialForumRun ? 'partial' : 'failed';
    run.exitCode = currentStopRequested ? null : error.exitCode || 1;
    run.error = isPartialForumRun ? '部分来源失败，已保留成功来源的采集结果。' : error.message;
    appendLog(logFile, `\n[error] ${error.message}\n`);
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
    setTaskState(run);
    currentRun = null;
    currentChild = null;
    currentStopRequested = false;
  }
}

async function runTask(taskId, environment) {
  const task = taskMap[taskId];
  if (!task) throw new Error(`未知任务: ${taskId}`);
  if (currentRun) throw new Error(`已有任务运行中: ${currentRun.taskName}`);

  const run = createRun(taskId, environment);
  currentRun = run;
  setTaskState(run);
  await executeRun(run);
  return run;
}

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, text, statusCode = 200, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('请求体过大'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('JSON 请求体格式错误'));
      }
    });
  });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 'Not found', 404);
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, pathname, searchParams) {
  if (req.method === 'GET' && pathname === '/api/tasks') {
    sendJson(res, {
      tasks: TASKS
        .filter(task => !task.hidden)
        .map(({ command, hidden, ...task }) => task),
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/status') {
    const environment = searchParams.get('env') || 'release';
    sendJson(res, {
      currentRun,
      state: getState(),
      summary: getDataSummary(environment),
      forumResearch: getForumResearchSummary(),
      contentResearch: getContentResearchSummary(),
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/automation-settings') {
    sendJson(res, { automation: getAutomationSettings() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/automation-settings') {
    try {
      const body = await parseBody(req);
      sendJson(res, { automation: setAutomationSettings(body.automation || body) });
    } catch (error) {
      sendJson(res, { error: error.message }, 400);
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/survey-config') {
    try {
      if (currentRun) {
        sendJson(res, { error: `已有任务运行中: ${currentRun.taskName}` }, 409);
        return;
      }

      const body = await parseBody(req);
      const environment = getEnvironmentName(body.environment || 'release');
      if (typeof body.enabled !== 'boolean') {
        sendJson(res, { error: 'enabled 必须为布尔值' }, 400);
        return;
      }

      const configPath = getSurveyConfigPath(environment);
      const currentConfig = readJson(configPath, null);
      if (!currentConfig) {
        sendJson(res, { error: `功能调研配置不存在: ${relativeToRoot(configPath)}` }, 404);
        return;
      }

      const nextConfig = { ...currentConfig, enabled: body.enabled };
      writeJson(configPath, nextConfig);
      if (environment === 'release') {
        writeJson(path.join(ROOT, 'base-data', 'miniprogram_config', 'feature_survey.json'), nextConfig);
      }

      const remotePath = await uploadSurveyConfig(environment, configPath);
      sendJson(res, {
        survey: getSurveySummary(environment),
        remotePath,
      });
    } catch (error) {
      sendJson(res, { error: `功能调研配置已保存到本地，但上传 OSS 失败: ${error.message}` }, 500);
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/dify/status') {
    sendJson(res, getDifyStatus());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/dify/article') {
    const date = searchParams.get('date') || '';
    const fileName = searchParams.get('file') || '';
    const filePath = getDifyArticleFile(date, fileName);
    if (!filePath) {
      sendJson(res, { error: '文章不存在' }, 404);
      return;
    }
    sendJson(res, { content: fs.readFileSync(filePath, 'utf-8') });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/dify/custom-run') {
    try {
      if (currentRun) {
        sendJson(res, { error: `已有任务运行中: ${currentRun.taskName}` }, 409);
        return;
      }
      const body = await parseBody(req);
      const clean = (key, maxLen) => String(body[key] || '').trim().slice(0, maxLen);
      const platform = clean('platform', 48);
      if (!DIFY_SELECT_OPTIONS.platform.includes(platform)) {
        sendJson(res, { error: '平台必须是：头条号 / 公众号 / 双平台' }, 400);
        return;
      }
      const articleType = clean('article_type', 80);
      if (!DIFY_SELECT_OPTIONS.article_type.includes(articleType)) {
        sendJson(res, { error: '文章类型不在可选项里' }, 400);
        return;
      }
      let refAccount = clean('ref_account', 48);
      if (!DIFY_SELECT_OPTIONS.ref_account.includes(refAccount)) {
        refAccount = DIFY_SELECT_OPTIONS.ref_account[0];
      }
      const goal = clean('goal', 2000);
      if (!goal) {
        sendJson(res, { error: '「文章要帮读者做什么决定」必填' }, 400);
        return;
      }
      const inputs = {
        topic: clean('topic', 200),
        ref_account: refAccount,
        platform,
        article_type: articleType,
        product_entry: clean('product_entry', 500),
        sources: clean('sources', 8000),
        transcript: clean('transcript', 8000),
        goal,
        style_reference: clean('style_reference', 20000),
      };
      ensureRuntime();
      writeJson(DIFY_CUSTOM_INPUTS_FILE, inputs);
      const run = createRun('dify_custom', 'release');
      currentRun = run;
      setTaskState(run);
      setImmediate(() => {
        executeRun(run).catch(error => console.error('任务启动失败:', error));
      });
      sendJson(res, { run }, 202);
    } catch (error) {
      sendJson(res, { error: error.message }, 400);
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/logs') {
    const runId = searchParams.get('runId') || '';
    const logFile = path.join(LOG_DIR, `${runId}.log`);
    if (!runId || !logFile.startsWith(LOG_DIR) || !fs.existsSync(logFile)) {
      sendText(res, '日志不存在', 404);
      return;
    }
    sendText(res, fs.readFileSync(logFile, 'utf8'));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/run') {
    try {
      const body = await parseBody(req);
      const taskId = String(body.taskId || '');
      const environment = getEnvironmentName(body.environment || 'release');
      const task = taskMap[taskId];
      if (!task) {
        sendJson(res, { error: `未知任务: ${taskId}` }, 400);
        return;
      }
      if (currentRun) {
        sendJson(res, { error: `已有任务运行中: ${currentRun.taskName}` }, 409);
        return;
      }

      const run = createRun(taskId, environment);
      currentRun = run;
      setTaskState(run);
      setImmediate(() => {
        executeRun(run).catch(error => console.error('任务启动失败:', error));
      });
      sendJson(res, { run }, 202);
    } catch (error) {
      sendJson(res, { error: error.message }, 400);
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/stop') {
    if (!currentRun) {
      sendJson(res, { error: '当前没有运行中的任务' }, 409);
      return;
    }

    currentStopRequested = true;
    currentRun.status = 'stopping';
    currentRun.error = '正在停止任务...';
    setTaskState(currentRun);

    if (currentChild && currentChild.pid) {
      try {
        if (process.platform === 'win32') {
          currentChild.kill('SIGTERM');
        } else {
          process.kill(-currentChild.pid, 'SIGTERM');
        }
      } catch (error) {
        try {
          currentChild.kill('SIGTERM');
        } catch (innerError) {
          sendJson(res, { error: innerError.message }, 500);
          return;
        }
      }
    }

    sendJson(res, { run: currentRun }, 202);
    return;
  }

  sendJson(res, { error: 'Not found' }, 404);
}

function startServer() {
  ensureRuntime();
  let activePort = PORT;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url.pathname, url.searchParams).catch(error => {
        sendJson(res, { error: error.message }, 500);
      });
      return;
    }
    serveStatic(req, res, url.pathname);
  });

  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && !process.env.DASHBOARD_PORT && activePort < PORT + 10) {
      console.warn(`端口 ${activePort} 已被占用，尝试使用 ${activePort + 1}...`);
      activePort += 1;
      server.listen(activePort);
      return;
    }

    if (error.code === 'EADDRINUSE') {
      console.error(`端口 ${activePort} 已被占用。可以先关闭占用进程，或使用 DASHBOARD_PORT=5178 npm run dashboard。`);
    } else {
      console.error('控制台启动失败:', error.message);
    }
    process.exit(1);
  });

  server.listen(activePort, () => {
    const address = server.address();
    const port = address && address.port ? address.port : activePort;
    console.log(`\n流放数据工作台已启动: http://localhost:${port}`);
    console.log('按 Ctrl+C 停止服务\n');
  });
}

startServer();
