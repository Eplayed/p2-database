#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const LOG_DIR = path.join(RUNTIME_DIR, 'logs');
const STATE_FILE = path.join(RUNTIME_DIR, 'state.json');
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
    id: 'patch05_daily_publish',
    name: '一键更新日常数据并上传',
    description: '日常推荐：新闻、poe.ninja 经济摘要、0.5 资料、剧情地图攻略一起刷新，并上传 OSS。不抓天梯，不改开荒 BD 源。',
    group: 'recommended',
    steps: ['news_all', 'economy_digest', 'patch05', 'story_guide', 'upload'],
  },
  {
    id: 'economy_daily_publish',
    name: '一键更新经济榜并上传',
    description: '开服期高频任务：只刷新 poe.ninja 经济摘要、0.5 新经济观察并上传 OSS。速度快，适合每天多次跑。',
    group: 'recommended',
    steps: ['economy_digest', 'patch05', 'upload'],
  },
  {
    id: 'ladder_bd_publish',
    name: '刷新天梯/BD解析并上传',
    description: '重新抓取 poe.ninja 天梯玩家详情，刷新装备、技能、符文/镶嵌翻译和天梯分析，并上传 OSS。修复 BD 解析翻译或符文显示后运行这个。',
    group: 'recommended',
    steps: ['ladder', 'upload'],
  },
  {
    id: 'release_flow',
    name: '完整刷新全部数据并上传',
    description: '慢任务：新闻、天梯/BD解析、经济、0.5 资料、开荒推荐、剧情攻略全部刷新并上传。发布前或大版本数据混乱时使用。',
    group: 'advanced',
    steps: ['news_all', 'ladder', 'economy_digest', 'patch05', 'starter', 'story_guide', 'upload'],
  },
  {
    id: 'starter_agent_refresh',
    name: '抓取热门 BD 候选',
    description: '安全流程：抓取热门 BD 帖并生成候选 JSON，只供人工审核，不进入正式推荐榜。',
    group: 'starter',
    steps: ['starter_hot_posts', 'starter_agent'],
  },
  {
    id: 'starter_publish',
    name: '发布人工开荒/热门 BD',
    description: '根据已人工维护好的 base-data/starter 生成 starters.json 并上传 OSS。不自动抓帖，不自动提升候选。',
    group: 'starter',
    steps: ['starter', 'upload'],
  },
  {
    id: 'news_all',
    name: '抓取新闻',
    description: '抓取踩蘑菇新闻列表和详情，生成小程序新闻数据。',
    group: 'single',
    command: ['node', ['auto_browser/crawl_news_with_details.js']],
  },
  {
    id: 'ladder',
    name: '抓取天梯 + 聚合分析',
    description: '抓取 poe.ninja 天梯玩家详情，生成 players/*.json、职业/技能/装备趋势分析；会刷新 BD 解析里的装备、技能、符文/镶嵌翻译。',
    group: 'single',
    command: ['node', ['crawlers/run.js', '--ladder']],
  },
  {
    id: 'economy_digest',
    name: '抓取 poe.ninja 经济摘要',
    description: '直接请求 poe.ninja PoE2 经济 API，生成 economy_digest.json、兼容 economy.json 和展示图标。',
    group: 'single',
    command: ['node', ['crawlers/economy/ninja_digest.js']],
  },
  {
    id: 'patch05',
    name: '生成 0.5 资料/经济观察',
    description: '基于已有经济摘要生成 0.5 资料速查、终局清单和新经济观察。不重新抓行情。',
    group: 'single',
    command: ['node', ['crawlers/patch05/index.js']],
  },
  {
    id: 'starter',
    name: '生成开荒推荐',
    description: '从 base-data/starter 生成小程序开荒推荐 starters.json。',
    group: 'single',
    command: ['node', ['crawlers/starter/index.js']],
  },
  {
    id: 'story_guide',
    name: '抓取剧情地图攻略',
    description: '抓取剧情章节地图、点位、奖励和路线，生成小程序剧情攻略数据。',
    group: 'single',
    command: ['node', ['crawlers/story-guide/index.js']],
  },
  {
    id: 'upload',
    name: '上传 OSS',
    description: '上传当前环境 translated-data 到 OSS。',
    group: 'single',
    command: ['node', ['-e', "require('./auto_browser/upload_to_oss')()"]],
  },
  {
    id: 'starter_hot_posts',
    name: '1. 抓取热门 BD 帖输入',
    description: '先从踩蘑菇热门 BD 页面抓帖子文本，写入 base-data/starter/agent_posts。只准备输入，不生成候选 JSON。',
    group: 'starter',
    command: ['node', ['crawlers/starter-agent/crawl_hot_posts.js']],
  },
  {
    id: 'starter_agent',
    name: '2. 从输入抽取候选 JSON',
    description: '读取 base-data/starter/agent_posts 里的帖子文本，生成 candidates 和 starter_candidates.json。不会主动抓帖子。',
    group: 'starter',
    command: ['node', ['crawlers/starter-agent/index.js']],
  },
  {
    id: 'starter_promote',
    name: '3. 候选提升到开荒源',
    description: '人工检查候选后再使用：把适合开荒的条目提升到正式源。',
    group: 'starter',
    dangerous: true,
    command: ['node', ['crawlers/starter/promote_candidates.js']],
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
  const economyWatch = readJson(path.join(dataDir, 'patch-0.5/patch05_economy_watch.json'), null);
  const economyDigest = readJson(path.join(dataDir, 'miniprogram_data/economy_digest.json'), null);
  const patchIndex = readJson(path.join(dataDir, 'patch-0.5/patch05_index.json'), null);

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
      news: summarizeJson(path.join(dataDir, 'news_caimogu.json')),
      starters: summarizeJson(path.join(dataDir, 'miniprogram_data/starters.json')),
      hotBdCandidates: summarizeJson(path.join(dataDir, 'miniprogram_data/starter_candidates.json')),
      storyGuides: summarizeJson(path.join(dataDir, 'miniprogram_data/story_guides.json')),
      economyDigest: summarizeJson(path.join(dataDir, 'miniprogram_data/economy_digest.json')),
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
    patch05: {
      file: getFileInfo(path.join(dataDir, 'patch-0.5/patch05_index.json')),
      entries: patchIndex ? getArrayLength(patchIndex) : 0,
      economyWatch: economyWatch ? getArrayLength(economyWatch) : 0,
      economyItems: economyDigest && economyDigest.summary ? economyDigest.summary.selectedItemCount : 0,
      economyUpdatedAt: economyDigest && economyDigest.updatedAt ? economyDigest.updatedAt : '',
    },
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
      else reject(new Error(`命令退出码 ${code}`));
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
    run.status = currentStopRequested ? 'stopped' : 'failed';
    run.exitCode = currentStopRequested ? null : 1;
    run.error = error.message;
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
    sendJson(res, { tasks: TASKS.map(({ command, ...task }) => task) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/status') {
    const environment = searchParams.get('env') || 'release';
    sendJson(res, {
      currentRun,
      state: getState(),
      summary: getDataSummary(environment),
    });
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
