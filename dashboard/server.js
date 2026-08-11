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
const FORUM_SUMMARY_FILE = path.join(RUNTIME_DIR, 'forum-content-scan.json');
const CONTENT_RESEARCH_FILE = path.join(RUNTIME_DIR, 'content-research.json');
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
    steps: ['economy_digest', 'cn_market_dd373', 'problem_guides', 'follow_updates', 'daily_return_digest', 'upload'],
  },
  {
    id: 'ladder_bd_publish',
    name: '刷新天梯/BD解析并上传',
    description: '重新抓取 poe.ninja 天梯玩家详情，刷新装备、技能、符文/镶嵌翻译、天梯分析及技能/装备查 BD 索引，并上传 OSS。',
    group: 'recommended',
    steps: ['ladder', 'ladder_build_index', 'follow_updates', 'daily_return_digest', 'upload'],
  },
  {
    id: 'poe1_publish',
    name: '更新 POE1 抄 BD / 看行情',
    description: '刷新国服官方天梯、官方入门流派、玩家开荒 BD、剧情跑图导航、天赋树截图、国际服游戏内通货行情和国服行情接口，并上传 POE1 专用 OSS 路径；不会影响 POE2 数据。',
    group: 'recommended',
    steps: ['poe1_ladder', 'poe1_official_starter', 'poe1_starter_builds', 'poe1_starter_terms', 'poe1_story_guide', 'poe1_passive_trees', 'poe1_economy', 'poe1_cn_economy', 'poe1_upload'],
  },
  {
    id: 'forum_content_scan',
    name: '更新论坛选题池',
    description: '采集现有论坛选题池，并补充 POE1/POE2、暗黑破坏神、魔兽世界的资讯和热点参考。只用于自媒体选题和小程序策略，不上传 OSS，不进入小程序日常发布。',
    group: 'content_research',
    localOnly: true,
    command: ['bash', ['scripts/run_forum_content_scan.sh']],
  },
  {
    id: 'ladder',
    name: '抓取天梯 + 聚合分析',
    description: '抓取 poe.ninja 天梯玩家详情，生成 players/*.json、职业/技能/装备趋势分析；会刷新 BD 解析里的装备、技能、符文/镶嵌翻译。聚合阶段也会先生成一次查 BD 索引。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/run.js', '--ladder']],
  },
  {
    id: 'poe1_ladder',
    name: '生成 POE1 国服天梯摘要',
    description: '读取国服官方天梯公开数据，生成职业、主技能和可查看的代表 BD 摘要。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/poe1/build_digest.js']],
  },
  {
    id: 'poe1_starter_builds',
    name: '生成 POE1 开荒 BD',
    description: '读取国服译名校对后的开荒 BD 文档或仓库结构化源数据，生成 starter_builds.json。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/poe1/starter_builds.js']],
  },
  {
    id: 'poe1_official_starter',
    name: '生成 POE1 官方入门流派',
    description: '读取国服官方推荐流派结构化源，校验官方活动页可访问，生成 official_starter_builds.json。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/poe1/official_starter.js']],
  },
  {
    id: 'poe1_starter_terms',
    name: '匹配 POE1 开荒术语',
    description: '抽取开荒 BD 中的技能、装备和英文括注，优先和国服官方天梯真实数据匹配，输出待补全清单。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/poe1/starter_terms.js']],
  },
  {
    id: 'poe1_economy',
    name: '生成 POE1 经济摘要',
    description: '读取 poe.ninja POE1 当前赛季公开经济数据，生成通货、碎片、精华和圣油的游戏内换算及变化。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/poe1/economy_digest.js']],
  },
  {
    id: 'poe1_cn_economy',
    name: '生成 POE1 国服行情接口',
    description: '合并 DD373 S30 国服公开报价与 FilterEditor 公开物价源，生成 POE1 国服行情接口；可用 base-data/poe1/cn_economy_manual.json 人工核验补充。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/poe1/cn_economy_digest.js']],
  },
  {
    id: 'poe1_story_guide',
    name: '生成 POE1 剧情跑图导航',
    description: '读取本地 B 站剧情整理与章节地图素材，生成小程序剧情跑图 JSON 和轻量地图图。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/poe1/story_guide.js']],
  },
  {
    id: 'poe1_passive_trees',
    name: '截取 POE1 天赋树图片',
    description: '打开 poe.ninja 当前赛季 BD 详情页，截取天赋树 canvas 为图片，供小程序详情页直接展示。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/poe1/capture_passive_trees.js']],
  },
  {
    id: 'poe1_upload',
    name: '上传 POE1 数据到 OSS',
    description: '将 POE1 小程序摘要和天赋树图片上传到 poe1-season 独立前缀。',
    group: 'single',
    hidden: true,
    command: ['node', ['scripts/upload_poe1_to_oss.js']],
  },
  {
    id: 'ladder_build_index',
    name: '生成技能/装备查 BD 索引',
    description: '从当前 players/*.json 重新生成轻量目录和按需详情，确保小程序查询数据与本次天梯玩家详情一致。',
    group: 'single',
    hidden: true,
    command: ['node', ['scripts/build_ladder_build_index.js']],
  },
  {
    id: 'economy_digest',
    name: '抓取 poe.ninja 经济摘要',
    description: '直接请求 poe.ninja PoE2 当前赛季经济 API，生成首页摘要 economy_digest.json、国际服分类清单 international_market_catalog.json、兼容 economy.json 和展示图标；通货为空会直接失败，不覆盖线上数据。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/economy/ninja_digest.js']],
  },
  {
    id: 'cn_market_dd373',
    name: '抓取 DD373 国服行情',
    description: '抓取 DD373 流放之路：降临奥杜尔秘符赛季核心通货公开商品列表，生成 cn_market_digest.json。',
    group: 'single',
    hidden: true,
    command: ['node', ['crawlers/cn-market/dd373_currency.js']],
  },
  {
    id: 'problem_guides',
    name: '生成流放急救箱',
    description: '合并人工整理的问题排查清单，生成小程序可动态读取的 problem_guides.json。',
    group: 'single',
    hidden: true,
    command: ['node', ['scripts/build_problem_guides.js']],
  },
  {
    id: 'daily_return_digest',
    name: '生成首页复访摘要',
    description: '基于经济、天梯和急救箱现有产物，生成首页今日变化 daily_return_digest.json。',
    group: 'single',
    hidden: true,
    command: ['node', ['scripts/build_daily_return_digest.js']],
  },
  {
    id: 'follow_updates',
    name: '生成我的关注变化摘要',
    description: '基于最新天梯索引和国服行情，对比上一版生成技能、装备、通货的关注变化 follow_updates.json。',
    group: 'single',
    hidden: true,
    command: ['node', ['scripts/build_follow_updates.js']],
  },
  {
    id: 'upload',
    name: '上传 OSS',
    description: '上传当前环境 translated-data 到 OSS。',
    group: 'single',
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
    const page = topic.signals?.miniappPage || '内容观察';
    if (!result[page]) result[page] = [];
    result[page].push(topic);
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
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
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
    console.log(`\nPoE2 数据控制台已启动: http://localhost:${port}`);
    console.log('按 Ctrl+C 停止服务\n');
  });
}

startServer();
