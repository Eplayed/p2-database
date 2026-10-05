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
const CONTENT_RESEARCH_HISTORY_FILE = path.join(RUNTIME_DIR, 'content-research-history.json');
const CONTENT_TOPIC_USAGE_FILE = path.join(RUNTIME_DIR, 'content-topic-usage.json');
const ARTICLE_FEEDBACK_FILE = path.join(RUNTIME_DIR, 'article-performance-feedback.json');
const TOPIC_USAGE_COOLDOWN_DAYS = 5;
// 自媒体发文已抽离到 media-workbench（端口 5180）：
// - 渠道表单/生成/登记/样本库/自动运行 → /Users/zhangyajun/Documents/project/media-workbench
// - 本工作台仍保留选题池采集（forum_content_scan）与候选池排序（/api/status 的 contentResearch），
//   以及选题冷却/表现回填两个共享文件的读取（media-workbench 负责写入）。
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
    group: 'game_data',
    game: 'poe2',
    steps: ['economy_digest', 'cn_market_dd373', 'currency_daily_change', 'problem_guides', 'follow_updates', 'daily_return_digest', 'poe2_manifest', 'upload'],
  },
  {
    id: 'ladder_bd_publish',
    name: '刷新天梯/BD解析并上传',
    description: '重新抓取 poe.ninja 天梯玩家详情，刷新装备、技能、符文/镶嵌翻译、天梯分析及技能/装备查 BD 索引，并上传 OSS。天赋树截图按"这棵树有没有变"决定重拍，所以只有首轮最慢（约 60 分钟），日常多数在 10 分钟内。',
    group: 'game_data',
    game: 'poe2',
    steps: ['ladder', 'ladder_build_index', 'follow_updates', 'daily_return_digest', 'poe2_manifest', 'upload'],
  },
  {
    id: 'poe1_publish',
    name: '更新 POE1 抄 BD / 看行情',
    description: '刷新 poe.ninja 天梯 BD（职业榜单、主技能、装备与天赋详情）、官方入门流派、玩家开荒 BD、剧情跑图导航、天赋树截图、国际服游戏内通货行情和国服行情接口，并上传 POE1 专用 OSS 路径；不会影响 POE2 数据。',
    group: 'game_data',
    game: 'poe1',
    steps: ['poe1_ladder', 'poe1_official_starter', 'poe1_starter_builds', 'poe1_starter_terms', 'poe1_story_guide', 'poe1_passive_trees', 'poe1_economy', 'poe1_cn_economy', 'poe1_currency_daily_change', 'poe1_ladder_check', 'poe1_coverage_check', 'poe1_manifest', 'poe1_upload'],
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
    id: 'ladder',
    name: '抓取天梯 + 聚合分析',
    description: '抓取 poe.ninja 天梯玩家详情，生成 players/*.json、职业/技能/装备趋势分析；会刷新 BD 解析里的装备、技能、符文/镶嵌翻译。榜单和角色数据走接口，只有天赋树截图才开浏览器，且树没变的角色直接复用上次的图。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['crawlers/run.js', '--ladder']],
  },
  {
    id: 'poe1_ladder',
    name: '生成 POE1 天梯 BD 摘要',
    description: '抓取 poe.ninja 当前联盟天梯榜单与角色详情，生成首屏摘要（轻字段）和每条 BD 的完整详情文件 poe1_builds/{id}.json。上游详情接口会限流，触发后本轮直接停止，不用半套数据覆盖线上。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/ladder_ninja.js']],
  },
  {
    id: 'poe1_dict_update',
    name: '更新流放1中文译名字典',
    description: '从流亡编年史（poedb.tw/cn）重抓流放1 的技能名、传奇名和基础类型，再按当前天梯产物里实际缺的名字补单件译名。只写本地字典，不抓天梯也不上传 OSS；换源或新赛季出新词后手动跑一次。',
    group: 'game_data',
    game: 'poe1',
    steps: ['poe1_dict', 'poe1_dict_missing'],
  },
  {
    id: 'poe1_dict',
    name: '抓取流放1译名字典',
    description: '抓取流亡编年史的列表页，生成 base-data/dist/poe1/dict_{gem,base,unique}.json。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1db-dict/index.js']],
  },
  {
    id: 'poe1_dict_missing',
    name: '补齐流放1缺失译名',
    description: '读当前天梯产物里仍然显示英文的名字，逐个查资料站单件页面标题补齐，写入 dict_supplement.json。查不到的保留英文，不猜译。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1db-dict/resolve_missing.js']],
  },
  {
    id: 'poe1_coverage_check',
    name: '检查 POE1 中文译名覆盖率',
    description: '只读统计天梯产物里技能名、传奇装备名、职业名和词缀行的中文覆盖率，低于门槛就中断上传。缺的名字必须有权威中文出处，不允许逐词硬造。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['scripts/report_poe1_translation_coverage.js']],
  },
  {
    id: 'poe1_ladder_official',
    name: '生成 POE1 国服官方天梯摘要',
    description: '换源前的旧链路：读国服官方天梯公开数据。角色数少、多数角色没有装备上报，只作为对照和应急回退。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/build_digest.js']],
  },
  {
    id: 'poe1_ladder_check',
    name: '发布前检查 POE1 天梯产物',
    description: '只读校验：赛季名与更新时间非空、摘要有条目、每条 BD 的详情文件存在且带装备/技能/面板字段、摘要体积没有回胀。不通过就中断上传。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['scripts/check_poe1_ladder_output.js']],
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
    description: '打开 poe.ninja 当前赛季 BD 详情页，截取天赋树 canvas 为图片，供小程序详情页直接展示。已有图片会跳过，所以首轮最慢（161 条约 40 分钟），之后只补新增角色。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['crawlers/poe1/capture_passive_trees.js', '--all']],
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
    id: 'currency_daily_change',
    name: '生成 POE2 通货日涨幅',
    description: '把本次 DD373 国服中位单价按日存快照（只存 dashboard/runtime，不上传），与最近一个更早日期比较，生成首页今日换算用的 currency_daily_change.json；行情为空会失败，不覆盖线上产物。',
    group: 'single',
    game: 'poe2',
    hidden: true,
    command: ['node', ['scripts/build_currency_daily_change.js', 'poe2']],
  },
  {
    id: 'poe1_currency_daily_change',
    name: '生成 POE1 通货日涨幅',
    description: '把本次国际服行情的混沌计价按日存快照（只存 dashboard/runtime，不上传），与最近一个更早日期比较，生成 POE1 首页今日换算用的 currency_daily_change.json；数据源与小程序 poe1 各页一致，不用国服 DD373 那份。',
    group: 'single',
    game: 'poe1',
    hidden: true,
    command: ['node', ['scripts/build_currency_daily_change.js', 'poe1']],
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

const AUTOMATION_GROUPS = ['game_data'];

function getAutomationGroup(value) {
  return AUTOMATION_GROUPS.includes(value) ? value : 'game_data';
}

function getAutomationDefaultTaskId(group) {
  return 'daily_publish';
}

function normalizeAutomationTaskIds(taskIds, group = 'game_data') {
  const automationGroup = getAutomationGroup(group);
  const taskList = TASKS.filter(task => !task.hidden && task.group === automationGroup);
  const availableIds = new Set(taskList.map(task => task.id));
  const seen = new Set();
  const normalized = (Array.isArray(taskIds) ? taskIds : [])
    .map(id => String(id || ''))
    .filter(id => availableIds.has(id))
    .filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  return normalized.length ? normalized : [getAutomationDefaultTaskId(automationGroup)];
}

function clampNumber(value, min, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, number);
}

function normalizeAutomationInterval(value, group, fallback) {
  return clampNumber(value, 10, fallback);
}

function sanitizeAutomationSettings(settings, group = 'game_data') {
  const automationGroup = getAutomationGroup(group);
  const taskIds = normalizeAutomationTaskIds(settings?.taskIds || (settings?.taskId ? [settings.taskId] : []), automationGroup);
  const hasUpdatedAt = settings && Object.prototype.hasOwnProperty.call(settings, 'updatedAt');
  return {
    enabled: settings?.enabled === true,
    group: automationGroup,
    taskId: taskIds[0],
    taskIds,
    intervalMinutes: normalizeAutomationInterval(settings?.intervalMinutes, automationGroup, 120),
    jitterMinutes: clampNumber(settings?.jitterMinutes, 0, 10),
    nextRunAt: Number(settings?.nextRunAt) || 0,
    updatedAt: hasUpdatedAt ? Number(settings.updatedAt) || 0 : Date.now(),
  };
}

function sanitizeAutomationBundle(settings) {
  const raw = settings && typeof settings === 'object' ? settings : {};
  const isLegacyFlat = raw.taskId || raw.taskIds || raw.intervalMinutes || raw.enabled || raw.nextRunAt;
  return {
    game_data: sanitizeAutomationSettings(isLegacyFlat ? raw : raw.game_data, 'game_data'),
  };
}

function getAutomationSettings() {
  ensureRuntime();
  if (!fs.existsSync(AUTOMATION_SETTINGS_FILE)) {
    return sanitizeAutomationBundle({ game_data: { updatedAt: 0 } });
  }
  return sanitizeAutomationBundle(readJson(AUTOMATION_SETTINGS_FILE, { updatedAt: 0 }));
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
  const existing = getAutomationSettings();
  const raw = settings && typeof settings === 'object' ? settings : {};
  const isLegacyFlat = raw.taskId || raw.taskIds || raw.intervalMinutes || raw.enabled || raw.nextRunAt;
  const nextSettings = sanitizeAutomationBundle(
    isLegacyFlat
      ? {
          ...existing,
          game_data: {
            ...existing.game_data,
            ...raw,
            updatedAt: Date.now(),
          },
        }
      : {
          game_data: {
            ...existing.game_data,
            ...(raw.game_data || {}),
            updatedAt: raw.game_data ? Date.now() : existing.game_data.updatedAt,
          },
        }
  );
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

const PLATFORM_CANDIDATE_CONFIG = {
  toutiao: {
    label: '头条号',
    strategy: '暗金观察：游戏、数码、汽车、老玩家硬核杂谈。要有观点、痛点或消费判断，不做泛泛公告搬运。',
    limit: 10,
    fitKeywords: ['游戏', '暗黑', '魔兽', '流放', 'poe', 'lol', '数码', 'AI设备', '手机', '显卡', '汽车', '新能源', '老玩家', '硬核', '怀旧', '回坑', '氪金', '肝', '值不值', '要不要'],
  },
  xhs: {
    label: '小红书',
    strategy: '小红书：女性玩家、情感共鸣、职场成长。2-3张卡片，重情绪、收藏、避雷和生活场景。',
    limit: 10,
    fitKeywords: ['女性', '女生', '姐妹', '女玩家', '女性玩家', '情绪', '共鸣', '职场', '上班', '通勤', '焦虑', '治愈', '成长', '外观', '幻化', '坐骑', '收藏', '避雷', '清单'],
  },
  wechat: {
    label: '公众号',
    strategy: '公众号：AI科技赛道。写 AI 工具、AI工作流、行业观察、产品实操和普通人应用，重长期搜索和收藏。',
    limit: 10,
    fitKeywords: ['AI', '人工智能', '大模型', 'ChatGPT', 'Claude', 'Gemini', 'DeepSeek', '豆包', 'Dify', 'Codex', 'Agent', '工作流', '自动化', '提示词', 'API', '工具', '科技', '效率'],
  },
};

const CANDIDATE_KEYWORDS = {
  heat: ['更新', '公告', '蓝帖', '热修', '上线', '赛季', '开服', '新', '今日', '昨天', 'patch', 'hotfix', '直播', '活动', '奖励'],
  pain: ['卡', '亏', '装不上', '刷不动', '断图', '避坑', '别乱', '失败', '掉线', '买错', '贵', '砸', '难', '坑', '限制', '削弱', 'nerf'],
  decision: ['要不要', '怎么', '先', '值得', '选择', '推荐', '路线', '买', '刷', '练', '回坑', '做', '换', '该不该'],
  conversion: ['小程序', 'BD', '天梯', '技能', '装备', '行情', '急救箱', '清单', '通货', '词缀', '仓库', '查'],
};

const PLATFORM_RULE_KEYWORDS = {
  toutiaoLane: ['游戏', '暗黑', 'diablo', '流放', 'poe', 'poe2', '魔兽', 'wow', '火炬', 'lol', '英雄联盟', 'bd', '补丁', '赛季', '开服', '数码', 'ai设备', '手机', '显卡', '电脑', '主机', '外设', '耳机', '平板', '汽车', '新能源', '油耗', '买车'],
  oldPlayerTalk: ['老玩家', '硬核', '怀旧', '回坑', '成年人', '中年', '上班', '下班', '肝', '氪', '氪金', '值不值', '要不要', '亏', '贵', '免费', '白嫖', '主播', '论坛', '争议', '吐槽'],
  xhsFit: ['女生', '姐妹', '女性', '女玩家', '女性玩家', '颜值', '外观', '坐骑', '宠物', '幻化', '截图', '壁纸', '搭配', '穿搭', '美妆', '家居', '母婴', '情绪', '共鸣', '治愈', '焦虑', '职场', '上班', '通勤', '成长', '省钱', '避雷', '清单', '收藏', '好物'],
  hardGameGuide: ['bd', 'pob', '升华', '天赋', '装备', '技能', '地图', '词缀', '开荒', '毕业', '路线', '攻略', '通货', '天梯', 'dps', '流派'],
  wechatAiTech: ['ai科技', 'ai工具', 'ai工作流', '人工智能', '大模型', 'chatgpt', 'openai', 'claude', 'gemini', 'deepseek', '豆包', 'kimi', '通义', 'dify', 'codex', 'agent', 'mcp', '工作流', '自动化', '提示词', 'api', '模型', '效率工具', '小程序开发', '低代码', '知识库'],
};

function normalizeCandidateText(value) {
  return String(value || '').toLowerCase();
}

function candidateHasAny(text, keywords) {
  return keywords.some(keyword => text.includes(normalizeCandidateText(keyword)));
}

function readContentResearchHistory() {
  const history = readJson(CONTENT_RESEARCH_HISTORY_FILE, []);
  return Array.isArray(history) ? history : [];
}

function readContentTopicUsage() {
  const usage = readJson(CONTENT_TOPIC_USAGE_FILE, []);
  if (Array.isArray(usage)) return usage;
  if (Array.isArray(usage?.items)) return usage.items;
  return [];
}

function readArticleFeedbackItems() {
  const feedback = readJson(ARTICLE_FEEDBACK_FILE, null);
  if (Array.isArray(feedback)) return feedback;
  if (Array.isArray(feedback?.items)) return feedback.items;
  return [];
}

function getCandidateTopicKey(topic) {
  return String(topic?.stableId || topic?.id || topic?.url || getCandidateTitle(topic) || '').trim();
}

function getTopicUsageKey(platform, topicKey) {
  return `${platform || 'unknown'}::${normalizeCandidateText(topicKey)}`;
}

function buildTopicCooldownMap(history) {
  const map = new Map();
  const recentRuns = history.slice(0, 5);
  recentRuns.forEach((run, runIndex) => {
    const seenInRun = new Set();
    const keys = [
      ...(Array.isArray(run?.topStableIds) ? run.topStableIds : []),
      ...(Array.isArray(run?.topics) ? run.topics.map(getCandidateTopicKey) : []),
    ].filter(Boolean);
    keys.forEach(key => {
      if (seenInRun.has(key)) return;
      seenInRun.add(key);
      const current = map.get(key) || { count: 0, lastSeenAt: '', lastRunIndex: runIndex };
      current.count += 1;
      current.lastSeenAt = current.lastSeenAt || run?.generatedAt || run?.createdAt || '';
      current.lastRunIndex = Math.min(current.lastRunIndex, runIndex);
      map.set(key, current);
    });
  });
  return map;
}

function buildUsedTopicCooldownMap(usageItems) {
  const map = new Map();
  const now = Date.now();
  const maxAgeMs = TOPIC_USAGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  usageItems.forEach(item => {
    const usedAtMs = Date.parse(item?.usedAt || item?.createdAt || '');
    if (!Number.isFinite(usedAtMs) || now - usedAtMs > maxAgeMs) return;
    const platform = String(item?.platform || '').trim();
    const topicKey = String(item?.topicKey || item?.topicId || item?.title || item?.topic || '').trim();
    if (!platform || !topicKey) return;
    const key = getTopicUsageKey(platform, topicKey);
    const current = map.get(key) || { count: 0, lastUsedAt: '', daysAgo: TOPIC_USAGE_COOLDOWN_DAYS };
    current.count += 1;
    if (!current.lastUsedAt || Date.parse(item.usedAt || item.createdAt || '') > Date.parse(current.lastUsedAt)) {
      current.lastUsedAt = item.usedAt || item.createdAt || '';
      current.daysAgo = Math.max(0, Math.floor((now - usedAtMs) / (24 * 60 * 60 * 1000)));
    }
    map.set(key, current);
  });
  return map;
}

function getCandidateEvidenceState(topic) {
  const verifyText = normalizeCandidateText(getCandidateVerifyText(topic));
  const hasSource = Boolean(topic?.url || topic?.source);
  const risky = candidateHasAny(verifyText, ['存疑', '谣言', '误读', '无法确认', '未核', '待核', '需要补充', '二手', '转载']);
  return { hasSource, risky };
}

function findTopicFeedback(topic, platform, feedbackItems) {
  const topicKey = getCandidateTopicKey(topic);
  const title = normalizeCandidateText(getCandidateTitle(topic));
  return feedbackItems.find(item => {
    if (item?.platform && item.platform !== platform) return false;
    const itemKeys = [
      item?.topicId,
      item?.stableId,
      item?.url,
      item?.title,
      item?.topic,
    ].map(value => normalizeCandidateText(value));
    return itemKeys.includes(normalizeCandidateText(topicKey)) || (title && itemKeys.includes(title));
  }) || null;
}

function getTopicFeedbackLift(feedback) {
  if (!feedback) return { value: 0, label: '暂无数据回填' };
  const ctr = Number(feedback.ctr24h ?? feedback.clickRate24h ?? feedback.ctr ?? 0);
  const reads = Number(feedback.reads24h ?? feedback.read24h ?? feedback.reads ?? feedback.read ?? 0);
  const interactions =
    Number(feedback.comments24h ?? feedback.comments ?? 0) +
    Number(feedback.likes24h ?? feedback.likes ?? 0) +
    Number(feedback.shares24h ?? feedback.shares ?? 0) +
    Number(feedback.saves24h ?? feedback.saves ?? 0);
  if (feedback.status === 'bad' || (ctr > 0 && ctr < 0.035 && reads < 300)) {
    return { value: -0.7, label: '历史表现偏弱' };
  }
  if (feedback.status === 'good' || ctr >= 0.08 || reads >= 1000 || interactions >= 8) {
    return { value: 0.8, label: '历史表现较好' };
  }
  if (ctr >= 0.055 || reads >= 500 || interactions >= 3) {
    return { value: 0.35, label: '历史表现可跟进' };
  }
  return { value: 0, label: '历史表现一般' };
}

function getCandidateTitle(topic) {
  return topic?.titleCn || topic?.title || '未命名选题';
}

function getCandidateArticleAngle(topic) {
  return topic?.signals?.articleAngle || topic?.articleAngle || topic?.summaryCn || getCandidateTitle(topic);
}

function getCandidateRouteHint(topic) {
  return topic?.signals?.miniapp?.routeHint || topic?.routeHint || topic?.signals?.painPoint || '';
}

function getCandidateVerifyText(topic) {
  return topic?.verify || topic?.signals?.confidence || topic?.sourceType || '';
}

function getCandidateCombinedText(topic) {
  return normalizeCandidateText([
    getCandidateTitle(topic),
    topic?.title || '',
    getCandidateArticleAngle(topic),
    topic?.summaryCn || '',
    getCandidateRouteHint(topic),
    topic?.source || '',
    topic?.platformLane || '',
    topic?.sourceIntent || '',
    topic?.signals?.platformLane || '',
    topic?.signals?.sourceIntent || '',
    topic?.game || '',
    ...(Array.isArray(topic?.tags) ? topic.tags : []),
  ].join(' '));
}

function evaluatePlatformFit(topic, platform) {
  const text = getCandidateCombinedText(topic);
  const lane = normalizeCandidateText(topic?.platformLane || topic?.signals?.platformLane || '');
  const laneMatches = lane === platform;
  if (lane && !laneMatches) {
    const label = PLATFORM_CANDIDATE_CONFIG[lane]?.label || lane;
    return {
      eligibleForA: false,
      fitScore: 0,
      reason: `来源已标记为${label}赛道，不跨平台硬塞`,
    };
  }

  if (platform === 'toutiao') {
    const hasLane = candidateHasAny(text, PLATFORM_RULE_KEYWORDS.toutiaoLane);
    const hasOldPlayerAngle = candidateHasAny(text, PLATFORM_RULE_KEYWORDS.oldPlayerTalk);
    const eligibleForA = laneMatches || (hasLane && (hasOldPlayerAngle || candidateHasAny(text, CANDIDATE_KEYWORDS.pain) || candidateHasAny(text, CANDIDATE_KEYWORDS.decision)));
    const fitScore = laneMatches ? 2.1 : eligibleForA ? 1.85 : hasLane ? 0.9 : 0.2;
    const reason = eligibleForA
      ? laneMatches
        ? '来源已标记为头条号赛道：游戏/数码/汽车/老玩家硬核杂谈'
        : '命中头条号赛道：游戏/数码/汽车/老玩家硬核杂谈，且有痛点或判断'
      : hasLane
        ? '只命中题材，不够像老玩家硬核杂谈或消费判断，暂不进头条A'
        : '不符合头条号当前赛道：游戏、数码、汽车、老玩家硬核杂谈';
    return { eligibleForA, fitScore, reason };
  }

  if (platform === 'xhs') {
    const hasXhsFit = candidateHasAny(text, PLATFORM_RULE_KEYWORDS.xhsFit);
    const isHardcoreGuide = candidateHasAny(text, PLATFORM_RULE_KEYWORDS.hardGameGuide) && !candidateHasAny(text, ['外观', '幻化', '坐骑', '宠物', '女性玩家', '女生', '姐妹']);
    const eligibleForA = laneMatches || (hasXhsFit && !isHardcoreGuide);
    const fitScore = laneMatches ? 2.1 : eligibleForA ? 1.8 : hasXhsFit ? 1 : 0.2;
    const reason = eligibleForA
      ? laneMatches
        ? '来源已标记为小红书赛道：女性玩家/情感共鸣/职场'
        : '命中小红书赛道：女性玩家/情感共鸣/职场或收藏卡片场景'
      : isHardcoreGuide
        ? '硬核BD/POB/天梯资料不适合直接做小红书A，除非改成女性玩家或收藏卡片场景'
        : '当前素材缺少小红书女性玩家、情感共鸣或职场切口';
    return { eligibleForA, fitScore, reason };
  }

  if (platform === 'wechat') {
    const hasAiTech = candidateHasAny(text, PLATFORM_RULE_KEYWORDS.wechatAiTech);
    const eligibleForA = laneMatches || hasAiTech;
    const fitScore = laneMatches ? 2.1 : eligibleForA ? 1.8 : 0.2;
    const reason = eligibleForA
      ? laneMatches
        ? '来源已标记为公众号赛道：AI科技、工具、工作流或行业观察'
        : '命中公众号赛道：AI科技、工具、工作流或行业观察'
      : '不符合公众号AI科技赛道，不能进公众号A';
    return { eligibleForA, fitScore, reason };
  }

  return { eligibleForA: false, fitScore: 0, reason: '未知平台规则' };
}

function getPlatformSourceAdjustment(topic, platform) {
  const sourceType = normalizeCandidateText(topic?.sourceType || '');
  const source = normalizeCandidateText(topic?.source || '');
  const text = getCandidateCombinedText(topic);
  const labels = [];
  let value = 0;

  if (platform === 'toutiao') {
    const isOverseasBuildGuide =
      sourceType === 'overseas_reference' &&
      (candidateHasAny(source, ['maxroll', 'mobalytics', 'icy veins']) ||
        candidateHasAny(text, ['build guide', 'build guides', 'league starter', 'pob', 'bd 攻略', '升级 bd 攻略']));
    const isOverseasCurrency = sourceType === 'overseas_reference' && candidateHasAny(text, ['currency', '通货', '行情']);
    if (isOverseasBuildGuide) {
      value -= 1.8;
      labels.push('海外BD页只作资料源，头条A降权');
    } else if (isOverseasCurrency) {
      value -= 0.8;
      labels.push('海外行情页需转成本土消费/收益角度');
    }
    if (sourceType === 'forum') {
      value += 1;
      labels.push('本土论坛真实玩家问题加权');
    }
    if (sourceType === 'official_news') {
      value += 0.55;
      labels.push('官方来源加权');
    }
    if (sourceType === 'news_reference' && candidateHasAny(source, ['it之家', 'ithome'])) {
      value += 0.45;
      labels.push('中文数码资讯源加权');
    }
    if (sourceType === 'news_reference' && candidateHasAny(text, ['国服', '网易', '腾讯', '官方', '公告'])) {
      value += 0.35;
      labels.push('中文/国服资讯加权');
    }
  }

  if (platform === 'xhs') {
    if (sourceType === 'seed_topic') {
      value += 0.25;
      labels.push('小红书赛道种子可做卡片测试');
    }
    if (sourceType === 'forum' && candidateHasAny(text, ['外观', '幻化', '坐骑', '女生', '情绪', '上班'])) {
      value += 0.55;
      labels.push('论坛素材可转情绪/收藏卡片');
    }
    if (sourceType === 'trend_reference') {
      value += 0.35;
      labels.push('热榜素材只作小红书情绪切口观察');
    }
  }

  if (platform === 'wechat') {
    if (sourceType === 'official_news') {
      value += 0.65;
      labels.push('AI官方来源加权');
    }
    if (
      sourceType === 'news_reference' &&
      !candidateHasAny(source, ['it之家', 'ithome']) &&
      candidateHasAny(text, ['ai', '人工智能', '大模型', 'agent', 'dify', '工作流'])
    ) {
      value += 0.45;
      labels.push('AI行业来源加权');
    }
    if (sourceType === 'news_reference' && candidateHasAny(source, ['it之家', 'ithome'])) {
      value -= 0.35;
      labels.push('宽泛科技资讯只作公众号备选');
    }
    if (sourceType === 'news_reference' && candidateHasAny(source, ['product hunt', '少数派'])) {
      value += 0.45;
      labels.push('AI工具/效率产品来源加权');
    }
  }

  return { value, labels };
}

function normalizeCandidateGame(game) {
  const raw = normalizeCandidateText(game);
  if (raw.includes('poe1') || raw === 'poe' || raw.includes('流放之路')) return 'poe1';
  if (raw.includes('poe2') || raw.includes('流放之路2')) return 'poe2';
  if (raw.includes('d4') || raw.includes('diablo') || raw.includes('暗黑')) return 'd4';
  if (raw.includes('wow') || raw.includes('warcraft') || raw.includes('魔兽')) return 'wow';
  if (raw.includes('torchlight') || raw.includes('火炬')) return 'torchlight';
  if (raw.includes('ai_tech') || raw.includes('人工智能') || raw.includes('ai科技')) return 'ai_tech';
  if (raw.includes('xhs_life') || raw.includes('小红书')) return 'xhs_life';
  if (raw.includes('digital')) return 'digital';
  if (raw.includes('auto')) return 'auto';
  if (raw.includes('toutiao_core')) return 'toutiao_core';
  return raw || 'other';
}

function getCandidateGameLabel(game) {
  const normalized = normalizeCandidateGame(game);
  if (normalized === 'poe1') return '流放之路';
  if (normalized === 'poe2') return '流放之路2';
  if (normalized === 'd4') return '暗黑破坏神';
  if (normalized === 'wow') return '魔兽世界';
  if (normalized === 'torchlight') return '火炬之光';
  if (normalized === 'ai_tech') return 'AI科技';
  if (normalized === 'xhs_life') return '小红书生活/职场';
  if (normalized === 'digital') return '数码';
  if (normalized === 'auto') return '汽车';
  if (normalized === 'toutiao_core') return '暗金观察核心赛道';
  return game || '其他';
}

function inferCandidateProductEntry(topic, platform) {
  if (platform === 'xhs' || platform === 'wechat') return '';
  const text = getCandidateCombinedText(topic);
  const game = normalizeCandidateGame(topic?.game);
  if (game === 'poe1') return '流放之路小程序：S30 天梯热门职业、热门技能、代表角色、技能查 BD、装备查 BD';
  if (game === 'poe2') return '流放之路2小程序：天梯榜、技能查 BD、装备查 BD、通货换算、流放急救箱';
  if (text.includes('bd') || text.includes('技能') || text.includes('装备') || text.includes('天梯')) {
    return '小程序承接方向：技能查 BD / 装备查 BD / 天梯榜';
  }
  return '';
}

// 候选文章类型推断。产出值必须与 media-workbench server.js DIFY_CHANNEL_PROFILES 的
// article_type/note_type 权威枚举一致（2026-09-16 对齐：旧「数码消费判断」等自造枚举
// 会被工作台软校验静默回落成默认类型，导致科技题材被硬塞游戏类型、主编闸门 hold）。
// 权威源漂移时优先改这里；media-workbench 侧另有别名映射表兜底历史落盘数据。
function inferCandidateArticleType(topic, platform) {
  const text = getCandidateCombinedText(topic);
  const game = normalizeCandidateGame(topic?.game);
  if (platform === 'xhs') {
    if (candidateHasAny(text, ['职场', '上班', '通勤', '成长'])) return '情绪共鸣日常';
    if (candidateHasAny(text, ['情绪', '焦虑', '治愈', '共鸣'])) return '情绪共鸣日常';
    if (candidateHasAny(text, ['外观', '幻化', '坐骑', '宠物'])) return '外观合集';
    if (candidateHasAny(text, ['避坑', '买错', '亏', '省钱'])) return '新手避雷攻略';
    return '好物种草清单';
  }
  if (platform === 'wechat') {
    if (candidateHasAny(text, ['dify', 'codex', '工作流', '自动化', '提示词', 'agent'])) return 'AI教程实操';
    if (candidateHasAny(text, ['工具', '产品', '实操', '教程'])) return 'AI教程实操';
    if (candidateHasAny(text, ['行业', '融资', '公司', '发布会', '模型'])) return 'AI行业观察';
    return 'AI资讯解读';
  }
  if (game === 'wow' && candidateHasAny(text, ['公告', '蓝帖', '活动', '上线', '维护', '机制'])) return '魔兽资讯短文';
  if (candidateHasAny(text, ['数码', '手机', '显卡', '电脑', 'AI设备'])) return '数码资讯短文';
  if (candidateHasAny(text, ['汽车', '新能源', '油耗', '买车'])) return '汽车资讯短文';
  if (candidateHasAny(text, ['观点', '争议', '要不要', '值不值', '怀旧', '老玩家'])) return '暗金短评';
  return '暗金观察长文';
}

function buildCandidateSources(topic) {
  return [
    `标题：${getCandidateTitle(topic)}`,
    topic?.source ? `来源：${topic.source}` : '',
    topic?.sourceIntent || topic?.signals?.sourceIntent ? `来源定位：${topic.sourceIntent || topic.signals.sourceIntent}` : '',
    topic?.url ? `链接：${topic.url}` : '',
    getCandidateVerifyText(topic) ? `核验提示：${getCandidateVerifyText(topic)}` : '',
  ].filter(Boolean).join('\n');
}

function scoreTopicForPlatform(topic, platform, index = 0, context = {}) {
  const config = PLATFORM_CANDIDATE_CONFIG[platform] || PLATFORM_CANDIDATE_CONFIG.toutiao;
  const text = getCandidateCombinedText(topic);
  const lane = normalizeCandidateText(topic?.platformLane || topic?.signals?.platformLane || '');
  const platformFit = evaluatePlatformFit(topic, platform);
  const topicKey = getCandidateTopicKey(topic);
  const cooldown = context.cooldownMap?.get(topicKey) || null;
  const usedCooldown =
    context.usedCooldownMap?.get(getTopicUsageKey(platform, topicKey)) ||
    context.usedCooldownMap?.get(getTopicUsageKey(platform, getCandidateTitle(topic))) ||
    null;
  const feedback = findTopicFeedback(topic, platform, context.feedbackItems || []);
  const feedbackLift = getTopicFeedbackLift(feedback);
  const evidenceState = getCandidateEvidenceState(topic);
  const sourceAdjustment = getPlatformSourceAdjustment(topic, platform);
  const sourceScore = Math.min(2, Number(topic?.score || 0) / 50);
  const breakdown = {
    source: Number(sourceScore.toFixed(1)),
    evidence: topic?.url || topic?.source ? 1 : 0,
    heat: candidateHasAny(text, CANDIDATE_KEYWORDS.heat) ? 1.2 : 0,
    pain: candidateHasAny(text, CANDIDATE_KEYWORDS.pain) ? 1.4 : 0,
    decision: candidateHasAny(text, CANDIDATE_KEYWORDS.decision) ? 1.2 : 0,
    conversion: candidateHasAny(text, CANDIDATE_KEYWORDS.conversion) ? 1 : 0,
    platformFit: platformFit.fitScore,
    laneSource: lane === platform ? 0.6 : 0,
    recency: topic?.publishedAt || topic?.crawledAt ? 0.6 : 0,
    feedback: feedbackLift.value,
    sourceAdjustment: sourceAdjustment.value,
    cooldown: cooldown ? -Math.min(1.2, 0.45 + cooldown.count * 0.25) : 0,
    usedCooldown: usedCooldown ? -Math.min(2.4, 1.4 + usedCooldown.count * 0.35) : 0,
  };
  const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0) + Math.max(0, 0.5 - index * 0.01);
  const strategyCappedScore = platformFit.eligibleForA ? rawScore : Math.min(rawScore, 5.4);
  const cappedScore = !evidenceState.hasSource
    ? Math.min(strategyCappedScore, 4.1)
    : evidenceState.risky
      ? Math.min(strategyCappedScore, 5)
      : strategyCappedScore;
  const score = Math.max(0, Math.min(10, Math.round(cappedScore * 10) / 10));
  const grade = score >= 6.8 ? 'A' : score >= 5.1 ? 'B' : score >= 3.3 ? 'C' : '不建议';
  const reasons = [];
  if (breakdown.heat) reasons.push('有时间窗口');
  if (breakdown.pain) reasons.push('带玩家痛点');
  if (breakdown.decision) reasons.push('能落到具体决策');
  if (breakdown.conversion) reasons.push('可承接小程序/工具入口');
  if (breakdown.platformFit) reasons.push(platformFit.reason);
  if (feedbackLift.value > 0) reasons.push(feedbackLift.label);
  if (feedbackLift.value < 0) reasons.push(feedbackLift.label);
  sourceAdjustment.labels.forEach(label => reasons.push(label));
  if (cooldown) reasons.push(`近5次研究出现${cooldown.count}次，已降权`);
  if (usedCooldown) reasons.push(`近${TOPIC_USAGE_COOLDOWN_DAYS}天已生成/入队，已降权`);
  if (!evidenceState.hasSource) reasons.push('来源不足，仅作备选');
  if (evidenceState.risky) reasons.push('核验提示有风险，不能直接定稿');
  if (!reasons.length) reasons.push('需要人工确认角度');
  return { score, grade, breakdown, reason: reasons.join('、'), eligibleForA: platformFit.eligibleForA, platformRule: platformFit.reason };
}

function buildPlatformCandidate(topic, platform, index, context = {}) {
  const config = PLATFORM_CANDIDATE_CONFIG[platform] || PLATFORM_CANDIDATE_CONFIG.toutiao;
  const scoring = scoreTopicForPlatform(topic, platform, index, context);
  const title = getCandidateTitle(topic);
  const articleType = inferCandidateArticleType(topic, platform);
  const productEntry = inferCandidateProductEntry(topic, platform);
  const channelFields =
    platform === 'xhs'
      ? {
          // niche 枚举权威源：media-workbench DIFY_CHANNEL_PROFILES（['游戏·女性玩家','情感成长',…]）
          niche: candidateHasAny(getCandidateCombinedText(topic), ['职场', '上班', '通勤'])
            ? '情感成长'
            : candidateHasAny(getCandidateCombinedText(topic), ['情绪', '焦虑', '共鸣'])
              ? '情感成长'
              : '游戏·女性玩家',
          note_type: articleType,
          ref_blogger: '干货攻略型',
        }
      : platform === 'wechat'
        ? {
            ref_account: '自动（默认程序员鱼皮）',
            article_type: articleType,
          }
        : {
            ref_account: '自动（默认艾泽拉斯前哨）',
            platform: '头条号',
            article_type: articleType,
          };
  return {
    id: `${platform}_${topic?.stableId || topic?.id || index}`,
    topicId: topic?.stableId || topic?.id || '',
    platform,
    platformLabel: config.label,
    title,
    topic: title,
    game: normalizeCandidateGame(topic?.game),
    gameLabel: getCandidateGameLabel(topic?.game),
    platformLane: topic?.platformLane || topic?.signals?.platformLane || '',
    sourceIntent: topic?.sourceIntent || topic?.signals?.sourceIntent || '',
    source: topic?.source || '',
    sourceType: topic?.sourceType || '',
    url: topic?.url || '',
    pillar: getTopicPillar(topic),
    tags: Array.isArray(topic?.tags) ? topic.tags.slice(0, 6) : [],
    articleAngle: getCandidateArticleAngle(topic),
    routeHint: getCandidateRouteHint(topic),
    verify: getCandidateVerifyText(topic),
    goal: `${config.label}选题：按该平台赛道把「${title}」写成可发布内容，不跨平台硬套。`,
    productEntry,
    sources: buildCandidateSources(topic),
    channelFields,
    ...scoring,
  };
}

function buildPlatformCandidates(summary) {
  const aScoreThreshold = 6;
  const history = readContentResearchHistory();
  const usedTopics = readContentTopicUsage();
  const feedbackItems = readArticleFeedbackItems();
  const context = {
    cooldownMap: buildTopicCooldownMap(history),
    usedCooldownMap: buildUsedTopicCooldownMap(usedTopics),
    feedbackItems,
  };
  // topics contains full source metadata; actionItems are often a trimmed view.
  // Keep topics first so platform scoring can see sourceType/platformLane/tags.
  const rawTopics = [
    ...(Array.isArray(summary.topics) ? summary.topics : []),
    ...(Array.isArray(summary.actionItems) ? summary.actionItems : []),
  ];
  const seen = new Set();
  const topics = rawTopics.filter(topic => {
    const keys = [topic?.url, topic?.stableId, topic?.id, getCandidateTitle(topic)].filter(Boolean);
    if (!keys.length || keys.some(key => seen.has(key))) return false;
    keys.forEach(key => seen.add(key));
    return true;
  });
  const basePlatforms = Object.entries(PLATFORM_CANDIDATE_CONFIG).map(([platform, config]) => {
    const candidates = topics
      .map((topic, index) => buildPlatformCandidate(topic, platform, index, context))
      .sort((a, b) => b.score - a.score || String(b.topicId || '').localeCompare(String(a.topicId || '')))
      .slice(0, config.limit);
    return {
      key: platform,
      label: config.label,
      limit: config.limit,
      count: candidates.length,
      candidates,
    };
  });
  const topTopicSeen = new Set();
  const topAKeys = new Set();
  const makePlatformTopicKey = (platform, candidate) => `${platform}::${candidate.topicId || candidate.title}`;
  const makeTopTopicKey = candidate => normalizeCandidateText(candidate.title || candidate.topic || candidate.topicId || '');
  basePlatforms.forEach(group => {
    const candidate = group.candidates.find(item => {
      const topicKey = makeTopTopicKey(item);
      return item.eligibleForA && item.score >= aScoreThreshold && !topTopicSeen.has(topicKey);
    }) || group.candidates.find(item => item.eligibleForA && item.score >= aScoreThreshold);
    if (!candidate) return;
    const topicKey = makeTopTopicKey(candidate);
    topTopicSeen.add(topicKey);
    topAKeys.add(makePlatformTopicKey(group.key, candidate));
  });
  const platforms = basePlatforms.map(group => {
    const candidates = group.candidates.map(candidate => {
      const key = makePlatformTopicKey(group.key, candidate);
      const grade = topAKeys.has(key)
        ? 'A'
        : candidate.eligibleForA && candidate.score >= 5.4
          ? 'B'
          : candidate.score >= 4.2
            ? 'C'
            : '不建议';
      return { ...candidate, grade };
    });
    return {
      ...group,
      aCount: candidates.filter(item => item.grade === 'A').length,
      candidates,
    };
  });
  const topA = platforms
    .flatMap(group => group.candidates)
    .filter(candidate => candidate.grade === 'A')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const platformGaps = platforms
    .filter(group => !group.aCount)
    .map(group => {
      const strategy = PLATFORM_CANDIDATE_CONFIG[group.key]?.strategy || `${group.label}暂无 A 级题材`;
      return `${group.label}暂无A：${strategy}`;
    });
  return {
    generatedAt: summary.generatedAt || '',
    topA,
    platforms,
    diagnostics: {
      cooldown: {
        file: CONTENT_RESEARCH_HISTORY_FILE,
        runs: history.length,
        recentRunsUsed: Math.min(history.length, 5),
      },
      topicUsage: {
        file: CONTENT_TOPIC_USAGE_FILE,
        items: usedTopics.length,
        cooldownDays: TOPIC_USAGE_COOLDOWN_DAYS,
        note: usedTopics.length ? '已生成/入队题材会短期降权' : '暂无题材使用记录',
      },
      feedback: {
        file: ARTICLE_FEEDBACK_FILE,
        items: feedbackItems.length,
        note: feedbackItems.length ? '已纳入文章表现回填' : '暂无文章表现回填，按来源与题材信号评分',
      },
      platformGaps,
      platformStrategies: Object.fromEntries(
        Object.entries(PLATFORM_CANDIDATE_CONFIG).map(([key, config]) => [key, config.strategy])
      ),
    },
    note: topA.length
      ? `当前筛出 ${topA.length} 个 A 级题材；未达标平台不硬凑`
      : '当前没有符合平台赛道的 A 级题材，建议补充对应来源',
  };
}

function getContentResearchSummary() {
  const summary = readJson(CONTENT_RESEARCH_FILE, null);
  if (!summary) return null;
  const allTopics = Array.isArray(summary.topics) ? summary.topics : [];
  const topicSeen = new Set();
  const topics = allTopics
    .filter((topic, index) => index < 80 || topic?.platformLane || topic?.signals?.platformLane)
    .filter(topic => {
      const key = topic?.stableId || topic?.id || topic?.url || getCandidateTitle(topic);
      if (!key || topicSeen.has(key)) return false;
      topicSeen.add(key);
      return true;
    });
  const actionItems = Array.isArray(summary.actionItems) ? summary.actionItems.slice(0, 10) : [];
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
    actionItems,
    topics,
    byMiniappPage,
    platformCandidates: buildPlatformCandidates({
      ...summary,
      actionItems,
      topics,
    }),
    trend: summary.trend || {},
    history: summary.history || {},
    exports: summary.exports || {},
    note: summary.note || '',
  };
}

function appendLog(logFile, text) {
  fs.appendFileSync(logFile, text);
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
