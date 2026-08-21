const state = {
  env: 'release',
  tasks: [],
  status: null,
  activeRunId: '',
  pinnedLogRunId: '',
  pinnedContextRunId: '',
  logAutoFollow: true,
  automations: {
    game_data: {
      enabled: false,
      group: 'game_data',
      taskId: 'daily_publish',
      taskIds: ['daily_publish'],
      intervalMinutes: 120,
      jitterMinutes: 10,
      nextRunAt: 0,
    },
    self_media: {
      enabled: false,
      group: 'self_media',
      taskId: 'dify_publish_toutiao',
      taskIds: ['dify_publish_toutiao'],
      intervalMinutes: 1440,
      jitterMinutes: 30,
      nextRunAt: 0,
    },
  },
  automationRunner: {
    running: false,
    kind: '',
    currentIndex: -1,
    total: 0,
  },
  countdown: null,
  dify: {
    status: null,
    lastFetchAt: 0,
    openArticle: null,
  },
};

const LOG_BOTTOM_THRESHOLD = 32;
const AUTOMATION_STORAGE_KEY = 'p2-dashboard-automation-v2';
const DIFY_FORM_STORAGE_KEY = 'p2-dashboard-dify-form-v2';
const DIFY_FORM_LEGACY_KEY = 'p2-dashboard-dify-form-v1';
const SELF_MEDIA_INTERVAL_VALUES = [1440, 2880, 4320];
const SELF_MEDIA_PLATFORM_TASK_IDS = ['dify_publish_toutiao', 'dify_publish_xhs', 'dify_publish_wechat'];
// Dify 表单分两层：shared 跨渠道共用（选题、素材等），byChannel 按渠道独立记忆（下拉选项各渠道不同）。
// 渠道档案（字段、选项、文案）由 /api/dify/form-config 下发，前端不硬编码。
const DIFY_SHARED_DEFAULTS = {
  topic: '',
  goal: '帮读者快速了解最新资讯，判断值不值得关注',
  product_entry: '',
  sources: '',
  transcript: '',
  style_reference: '',
};
const DIFY_SHARED_FIELD_IDS = {
  topic: '#difyTopicInput',
  goal: '#difyGoalInput',
  product_entry: '#difyProductInput',
  sources: '#difySourcesInput',
  transcript: '#difyTranscriptInput',
  style_reference: '#difyStyleInput',
};
const taskGrid = document.querySelector('#taskGrid');
const summaryEl = document.querySelector('#summary');
const logOutput = document.querySelector('#logOutput');
const logTitle = document.querySelector('#logTitle');
const logFollowStatus = document.querySelector('#logFollowStatus');
const scrollLogBottomBtn = document.querySelector('#scrollLogBottomBtn');
const refreshBtn = document.querySelector('#refreshBtn');
const stopBtn = document.querySelector('#stopBtn');
const lastSyncText = document.querySelector('#lastSyncText');
const automationTaskSelect = document.querySelector('#automationTaskSelect');
const automationAddTaskBtn = document.querySelector('#automationAddTaskBtn');
const automationQueueList = document.querySelector('#automationQueueList');
const automationIntervalInput = document.querySelector('#automationIntervalInput');
const automationJitterInput = document.querySelector('#automationJitterInput');
const automationSaveBtn = document.querySelector('#automationSaveBtn');
const automationRunNowBtn = document.querySelector('#automationRunNowBtn');
const automationToggleBtn = document.querySelector('#automationToggleBtn');
const automationStatusText = document.querySelector('#automationStatusText');
const automationNextText = document.querySelector('#automationNextText');
const mediaAutomationTaskSelect = document.querySelector('#mediaAutomationTaskSelect');
const mediaAutomationAddTaskBtn = document.querySelector('#mediaAutomationAddTaskBtn');
const mediaAutomationQueueList = document.querySelector('#mediaAutomationQueueList');
const mediaAutomationIntervalInput = document.querySelector('#mediaAutomationIntervalInput');
const mediaAutomationJitterInput = document.querySelector('#mediaAutomationJitterInput');
const mediaAutomationSaveBtn = document.querySelector('#mediaAutomationSaveBtn');
const mediaAutomationRunNowBtn = document.querySelector('#mediaAutomationRunNowBtn');
const mediaAutomationToggleBtn = document.querySelector('#mediaAutomationToggleBtn');
const mediaAutomationStatusText = document.querySelector('#mediaAutomationStatusText');
const mediaAutomationNextText = document.querySelector('#mediaAutomationNextText');
const automationCollapseButtons = [...document.querySelectorAll('.automation-collapse-btn')];
const panelCollapseButtons = [...document.querySelectorAll('.panel-collapse-btn')];
const automationNavDot = document.querySelector('#automationNavDot');
const historyList = document.querySelector('#historyList');
const runStatusPill = document.querySelector('#runStatusPill');
const pillTaskName = document.querySelector('#pillTaskName');
const pillMeta = document.querySelector('#pillMeta');
const pillLogBtn = document.querySelector('#pillLogBtn');
const pillStopBtn = document.querySelector('#pillStopBtn');
const countdownMask = document.querySelector('#countdownMask');
const countdownTitle = document.querySelector('#countdownTitle');
const countdownMessage = document.querySelector('#countdownMessage');
const countdownNumber = document.querySelector('#countdownNumber');
const countdownRunNowBtn = document.querySelector('#countdownRunNowBtn');
const countdownCancelBtn = document.querySelector('#countdownCancelBtn');
const surveyToggleBtn = document.querySelector('#surveyToggleBtn');
const surveyControlStatus = document.querySelector('#surveyControlStatus');
const surveyControlCampaign = document.querySelector('#surveyControlCampaign');
const surveyControlHint = document.querySelector('#surveyControlHint');
const contentResearchBoard = document.querySelector('#contentResearchBoard');
const researchPillarFilter = document.querySelector('#researchPillarFilter');
const researchGameFilter = document.querySelector('#researchGameFilter');
const difyMeta = document.querySelector('#difyMeta');
const difyTodayHead = document.querySelector('#difyTodayHead');
const difyTodayGrid = document.querySelector('#difyTodayGrid');
const difyArticleList = document.querySelector('#difyArticleList');
const difyRunAllBtn = document.querySelector('#difyRunAllBtn');
const difyChannelSelect = document.querySelector('#difyChannelSelect');
const difyTopicInput = document.querySelector('#difyTopicInput');
const difyAutoCandidateSelect = document.querySelector('#difyAutoCandidateSelect');
const difyAutoCandidateRunBtn = document.querySelector('#difyAutoCandidateRunBtn');
const difyAutoCandidateMeta = document.querySelector('#difyAutoCandidateMeta');
const difyChannelFieldsWrap = document.querySelector('#difyChannelFields');
const difyGoalLabel = document.querySelector('#difyGoalLabel');
const difyStyleLabel = document.querySelector('#difyStyleLabel');
const difyGoalInput = document.querySelector('#difyGoalInput');
const difyProductInput = document.querySelector('#difyProductInput');
const difySourcesInput = document.querySelector('#difySourcesInput');
const difyTranscriptInput = document.querySelector('#difyTranscriptInput');
const difyStyleInput = document.querySelector('#difyStyleInput');
const difyResetFormBtn = document.querySelector('#difyResetFormBtn');
const difyCustomRunBtn = document.querySelector('#difyCustomRunBtn');
const difyCustomWrap = document.querySelector('#difyCustomWrap');
const difyFormToggleBtn = document.querySelector('#difyFormToggleBtn');
const difyArticleMask = document.querySelector('#difyArticleMask');
const difyArticleMeta = document.querySelector('#difyArticleMeta');
const difyArticleTitle = document.querySelector('#difyArticleTitle');
const difyArticleContent = document.querySelector('#difyArticleContent');
const difyCopyPublishBtn = document.querySelector('#difyCopyPublishBtn');
const difyCopyAllBtn = document.querySelector('#difyCopyAllBtn');
const difyCloseArticleBtn = document.querySelector('#difyCloseArticleBtn');
const difyPreviewHtmlBtn = document.querySelector('#difyPreviewHtmlBtn');
const sideNavLinks = [...document.querySelectorAll('.side-nav-link')];
const RESEARCH_PILLARS = ['抄BD', '看行情', '解卡点', '新闻资讯', '热点信息', '内容观察'];

function formatTime(value) {
  if (!value) return '无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '无记录';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours} 时 ${minutes % 60} 分`;
  }
  if (minutes > 0) return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`;
  return `${seconds} 秒`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-';
  return formatTime(new Date(timestamp).toISOString());
}

function statusText(run) {
  if (!run) return '未运行';
  if (run.status === 'success') return '成功';
  if (run.status === 'partial') return '部分完成';
  if (run.status === 'failed') return '失败';
  if (run.status === 'running') return '运行中';
  if (run.status === 'stopping') return '停止中';
  if (run.status === 'stopped') return '已停止';
  return run.status || '未知';
}

function clampNumber(value, min, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, number);
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function statusClass(run) {
  if (!run) return '';
  return `status-${run.status}`;
}

const REQUEST_TIMEOUT_MS = 30000;

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `请求失败: ${res.status}`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(REQUEST_TIMEOUT_MS / 1000)} 秒）：${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function renderSummary(summary) {
  const history = (state.status && state.status.state && state.status.state.history) || [];
  const lastRun = history[0] || null;
  const enabledAutomationKinds = getEnabledAutomationKinds();
  const queueLength = enabledAutomationKinds.reduce((sum, kind) => sum + (getAutomation(kind).taskIds || []).length, 0);
  const nextAutomation = getNextAutomationSchedule();
  const cards = [
    {
      label: '环境',
      value: summary.environment,
      valueClass: '',
      note: summary.exists ? summary.dataDir : '数据目录不存在',
    },
    {
      label: '输出文件',
      value: summary.fileCount,
      valueClass: '',
      note: 'translated-data 文件数量',
    },
    {
      label: '最近运行',
      value: lastRun ? statusText(lastRun) : '无记录',
      valueClass: lastRun ? statusClass(lastRun) : '',
      note: lastRun
        ? `${lastRun.taskName || lastRun.taskId} · ${formatTime(lastRun.finishedAt || lastRun.startedAt)}`
        : '运行任务后这里会显示最近结果',
    },
    {
      label: '自动运行',
      value: enabledAutomationKinds.length ? `已开启 · ${enabledAutomationKinds.length} 组 · ${queueLength} 个任务` : '未开启',
      valueClass: enabledAutomationKinds.length ? 'status-success' : '',
      note: nextAutomation
        ? `${getAutomationConfig(nextAutomation.kind).label} · 下次 ${formatDateTime(nextAutomation.nextRunAt)}`
        : '在下方「自动运行」里分别开启游戏数据或自媒体发文队列',
    },
  ];

  const overviewCards = cards
    .map(
      card => `
        <article class="stat-card">
          <span class="stat-label">${card.label}</span>
          <span class="stat-value ${card.valueClass || ''}">${card.value}</span>
          <span class="stat-note">${card.note}</span>
        </article>
      `
    )
    .join('');

  const gameCards = (Array.isArray(summary.games) ? summary.games : [])
    .map(game => {
      const gameSummary = game.summary || {};
      const missing = Array.isArray(game.missingFiles) ? game.missingFiles : [];
      const healthClass = missing.length ? 'warn' : 'ok';
      return `
        <article class="game-health-card ${healthClass}">
          <div class="game-health-head">
            <div>
              <span class="game-badge">${escapeHtml(game.shortName)}</span>
              <h3>${escapeHtml(game.name)}</h3>
              <p>${escapeHtml(game.miniprogram)} · ${escapeHtml(game.dataDir)}</p>
            </div>
            <strong>${missing.length ? `${missing.length} 项缺失` : '健康'}</strong>
          </div>
          <div class="game-health-grid">
            <span><em>赛季</em>${escapeHtml(gameSummary.seasonName || '-')}</span>
            <span><em>天梯</em>${Number(gameSummary.ladderPlayers || 0)} / ${Number(gameSummary.sampledPlayers || 0)}</span>
            <span><em>查 BD</em>${Number(gameSummary.skills || 0)} 技能 · ${Number(gameSummary.equipment || 0)} 装备</span>
            <span><em>行情</em>${Number(gameSummary.economyItems || 0)} 国际 · ${Number(gameSummary.cnMarketItems || 0)} 国服</span>
            <span><em>攻略</em>${Number(gameSummary.guides || 0)} 项</span>
            <span><em>更新</em>${formatTime(gameSummary.updatedAt)}</span>
          </div>
          <div class="game-paths">
            <span>新路径：${escapeHtml(game.canonicalOssPrefix)}</span>
            <span>兼容：${escapeHtml((game.legacyOssPrefixes || []).join('、'))}</span>
          </div>
        </article>
      `;
    })
    .join('');

  summaryEl.innerHTML = `
    <div class="overview-grid">${overviewCards}</div>
    <section class="game-health-grid-wrap">${gameCards}</section>
  `;
}

function renderSurveyControl(summary) {
  const survey = summary && summary.survey ? summary.survey : {};
  const enabled = survey.enabled === true;
  const currentRun = state.status && state.status.currentRun;

  surveyControlStatus.textContent = `当前状态：${enabled ? '已开启' : '已关闭'}（${state.env}）`;
  surveyControlCampaign.textContent = `调研批次：${survey.campaignId || '-'}`;
  surveyControlHint.textContent = enabled
    ? '玩家首页会显示“功能调研”入口；提交一次后本批次不再重复展示。'
    : '关闭后，首页不显示功能调研入口；已提交的数据不会删除。';

  surveyToggleBtn.textContent = enabled ? '关闭功能调研' : '开启功能调研';
  surveyToggleBtn.classList.toggle('active', enabled);
  surveyToggleBtn.disabled = Boolean(currentRun);
}

function renderTasks() {
  const currentRun = state.status && state.status.currentRun;
  const runs = (state.status && state.status.state && state.status.state.runs) || {};
  const disabled = Boolean(currentRun);
  const groups = [
    {
      id: 'game_data',
      title: '游戏数据发布',
      description: '只跑小程序需要的 POE/POE2 数据抓取、聚合和 OSS 上传。适合放进自动运行队列。',
    },
    {
      id: 'content_research',
      title: '内容研究',
      description: '为自媒体和小程序策略发现玩家问题、海外趋势和可写选题。结果只保存在本地，不上传 OSS。',
    },
    {
      id: 'self_media',
      title: '自媒体发文',
      description: '运行 Dify 发文工作流，生成头条号、小红书、公众号草稿。适合放进自媒体自动运行队列，发布前仍要人工复核。',
    },
  ];

  const forumSummary = state.status && state.status.forumResearch;
  const contentSummary = state.status && state.status.contentResearch;
  const forumTaskMeta = task => {
    if (task.id !== 'forum_content_scan') return '';
    if (!forumSummary && !contentSummary) return '内容研究尚未通过 Dashboard 运行';
    if (contentSummary) {
      const counters = contentSummary.counters || {};
      const sources = Array.isArray(contentSummary.sources) ? contentSummary.sources : [];
      const topTopics = Array.isArray(contentSummary.topTopics) ? contentSummary.topTopics.slice(0, 3) : [];
      const byMiniappPage = counters.byMiniappPage || {};
      const exportText = contentSummary.exports?.markdown ? `<br />导出：${escapeHtml(contentSummary.exports.markdown)}` : '';
      const sourceText = sources
        .slice(0, 4)
        .map(source => `${escapeHtml(source.name || source.id)}：${escapeHtml(source.status)} · ${source.topicCount || 0} 条`)
        .join(' / ');
      const topicText = topTopics.length
        ? `<br />高价值选题：${topTopics
            .map(topic => `${escapeHtml(topic.titleCn || topic.title)}(${escapeHtml(topic.signals?.miniappPage || '内容观察')})`)
            .join('、')}`
        : '';
      return `最近研究：${escapeHtml(contentSummary.status)} · 选题 ${counters.topics || 0} 个 · 来源 ${counters.sources || 0} 个 · 抄BD ${
        byMiniappPage['抄BD'] || 0
      } / 看行情 ${byMiniappPage['看行情'] || 0} / 解卡点 ${byMiniappPage['解卡点'] || 0} / 资讯 ${
        byMiniappPage['新闻资讯'] || 0
      } / 热点 ${byMiniappPage['热点信息'] || 0}<br />${sourceText}${topicText} · ${formatTime(
        contentSummary.generatedAt
      )}${exportText}`;
    }
    const d4 = forumSummary.sources?.d2core;
    const poe2 = forumSummary.sources?.caimogu;
    const rows = forumSummary.excel || {};
    const sourceStats = source => {
      const skipped = (source?.skippedExisting ?? 0) + (source?.skippedFilter ?? 0);
      return `${source?.name || '来源'}：列表 ${source?.listCount ?? 0} · 候选 ${source?.eligibleCount ?? 0} · 新增 ${source?.newRows ?? 0} · 跳过 ${skipped}`;
    };
    return `最近采集：${forumSummary.status === 'success' ? '成功' : forumSummary.status === 'partial' ? '部分完成' : '失败'} · 暗黑4 ${rows.d4Rows || 0} 条 / POE2 ${rows.poe2Rows || 0} 条<br />${sourceStats(d4)}<br />${sourceStats(poe2)} · ${formatTime(forumSummary.finishedAt)}`;
  };

  const renderTask = task => {
      const run = runs[task.id];
      const isFlow = Array.isArray(task.steps);
      const metaHtml = forumTaskMeta(task);
      return `
        <article class="task-card ${isFlow ? 'flow' : ''} ${task.dangerous ? 'dangerous' : ''}">
          <div class="task-title-row">
            <span class="task-title">${task.name}</span>
            <span class="task-badges">
              ${task.game ? `<span class="badge game-task-badge">${task.game === 'all' ? 'ALL' : task.game.toUpperCase()}</span>` : ''}
              ${isFlow ? '<span class="badge">流程</span>' : ''}
              ${task.dangerous ? '<span class="badge danger-badge">谨慎</span>' : ''}
            </span>
          </div>
          <p class="task-desc">${task.description}</p>
          <div class="task-meta">
            状态：<span class="${statusClass(run)}">${statusText(run)}</span><br />
            上次：${run ? formatTime(run.finishedAt || run.startedAt) : '无记录'}
            ${run && run.durationMs ? ` · ${formatDuration(run.durationMs)}` : ''}
            ${metaHtml ? `<br />${metaHtml}` : ''}
          </div>
          <div class="task-actions">
            <button class="run-btn" data-task-id="${task.id}" ${disabled ? 'disabled' : ''}>
              ${currentRun && currentRun.taskId === task.id ? '运行中...' : '运行'}
            </button>
            ${run ? `<button class="task-log-btn" type="button" data-run-id="${escapeHtml(run.runId)}">日志</button>` : ''}
          </div>
        </article>
      `;
  };

  taskGrid.innerHTML = groups
    .map(group => {
      const tasks = state.tasks.filter(task => (task.group || 'single') === group.id);
      if (!tasks.length) return '';
      return `
        <section class="task-group">
          <div class="task-group-head">
            <h3>${group.title}</h3>
            <p>${group.description}</p>
          </div>
          <div class="task-grid">${tasks.map(renderTask).join('')}</div>
        </section>
      `;
    })
    .join('');

  taskGrid.querySelectorAll('.run-btn').forEach(button => {
    button.addEventListener('click', () => runTask(button.dataset.taskId));
  });

  taskGrid.querySelectorAll('.task-log-btn').forEach(button => {
    button.addEventListener('click', () => {
      const run = findRunFromStatus(button.dataset.runId, '');
      if (run) viewRunLog(run);
    });
  });
}

function renderHistory() {
  if (!historyList) return;
  const history = (state.status && state.status.state && state.status.state.history) || [];
  if (!history.length) {
    historyList.innerHTML = '<p class="history-empty">还没有运行记录，先在「任务」里运行一个任务。</p>';
    return;
  }
  historyList.innerHTML = history
    .slice(0, 20)
    .map((run, index) => `
      <button class="history-row ${statusClass(run)}" type="button" data-run-id="${escapeHtml(run.runId)}">
        <span class="history-index">${index + 1}</span>
        <span class="history-task">${escapeHtml(run.taskName || run.taskId || '-')}</span>
        <span class="history-env">${escapeHtml(run.environment || '-')}</span>
        <span class="history-status ${statusClass(run)}">${statusText(run)}</span>
        <span class="history-duration">${formatDuration(run.durationMs) || '-'}</span>
        <span class="history-time">${formatTime(run.finishedAt || run.startedAt)}</span>
      </button>
    `)
    .join('');
}

function bindHistory() {
  historyList?.addEventListener('click', event => {
    const row = event.target.closest('[data-run-id]');
    if (!row) return;
    const history = (state.status && state.status.state && state.status.state.history) || [];
    const run = history.find(item => item.runId === row.dataset.runId);
    if (run) viewRunLog(run);
  });
}

function viewRunLog(run) {
  if (!run || !run.runId) return;
  state.activeRunId = run.runId;
  state.pinnedLogRunId = run.runId;
  state.pinnedContextRunId = (state.status && state.status.currentRun && state.status.currentRun.runId) || '';
  state.logAutoFollow = true;
  updateLogFollowUi();
  const timeText = run.finishedAt || run.startedAt ? ` · ${formatTime(run.finishedAt || run.startedAt)}` : '';
  logTitle.textContent = `${run.taskName || run.taskId} · ${run.environment || '-'} · ${statusText(run)}${timeText}`;
  const logsSection = document.querySelector('#logs');
  if (logsSection) logsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  loadLog(run.runId);
}

function updateRunStatusPill() {
  if (!runStatusPill) return;
  const currentRun = state.status && state.status.currentRun;
  if (currentRun) {
    runStatusPill.hidden = false;
    runStatusPill.className = 'run-status-pill running';
    pillTaskName.textContent = currentRun.taskName || currentRun.taskId || '任务运行中';
    const elapsedMs = Date.now() - Date.parse(currentRun.startedAt);
    pillMeta.textContent = `${currentRun.environment || '-'} · 已运行 ${formatElapsed(elapsedMs)}`;
    pillStopBtn.hidden = false;
    return;
  }
  const enabledAutomationKinds = getEnabledAutomationKinds();
  if (enabledAutomationKinds.length) {
    const nextAutomation = getNextAutomationSchedule();
    runStatusPill.hidden = false;
    runStatusPill.className = 'run-status-pill scheduled';
    pillTaskName.textContent = `自动运行已开启 · ${enabledAutomationKinds.length} 组`;
    pillMeta.textContent = nextAutomation
      ? `${getAutomationConfig(nextAutomation.kind).label} 下次 ${formatDateTime(nextAutomation.nextRunAt)}`
      : '等待排期';
    pillStopBtn.hidden = true;
    return;
  }
  runStatusPill.hidden = true;
}

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

function getTopicRouteHint(topic) {
  return topic?.signals?.miniapp?.routeHint || topic?.routeHint || '';
}

function getTopicArticleAngle(topic) {
  return topic?.signals?.articleAngle || topic?.articleAngle || topic?.summaryCn || '';
}

function getTopicVerifyText(topic) {
  if (topic?.verify) return topic.verify;
  if (topic?.sourceType === 'official_news') return '核验官方原文、发布时间和国服适用性';
  if (topic?.sourceType === 'news_reference') return '核验资讯来源时间、版本和官方出处';
  if (topic?.sourceType === 'overseas_reference') return '核验国服适用性和版本差异';
  if (topic?.sourceType === 'forum') return '打开原帖核验玩家真实问题';
  return '写作前核验版本、数值和来源';
}

function getGameLabel(game) {
  const normalized = normalizeTopicGame(game);
  const labels = {
    poe1: 'POE1',
    poe2: 'POE2',
    d4: '暗黑破坏神',
    wow: '魔兽世界',
  };
  return labels[normalized] || String(game || '-').toUpperCase();
}

function normalizeTopicGame(game) {
  return String(game || '').trim().toLowerCase();
}

function createTopicUrl(topic) {
  if (!topic?.url) return '';
  return `<a href="${escapeHtml(topic.url)}" target="_blank" rel="noreferrer">打开来源</a>`;
}

function renderActionItem(item, index) {
  const title = escapeHtml(item.title || item.titleCn || item.title || '未命名选题');
  return `
    <article class="research-action-card">
      <span class="research-rank">${index + 1}</span>
      <div>
        <h4>${title}</h4>
        <p>${escapeHtml(item.articleAngle || '')}</p>
        <div class="research-meta-line">
          <span>${escapeHtml(getTopicPillar(item))}</span>
          <span>${escapeHtml(getGameLabel(item.game))}</span>
          <strong>${Number(item.score || 0)} 分</strong>
          ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">来源</a>` : ''}
        </div>
      </div>
    </article>
  `;
}

function renderResearchPillarCard(pillar, topics) {
  const top = topics.slice(0, 3);
  const score = top[0]?.score || 0;
  return `
    <article class="research-pillar-card">
      <div class="research-pillar-head">
        <span>${pillar}</span>
        <strong>${topics.length}</strong>
      </div>
      <p>${escapeHtml(getTopicRouteHint(top[0]) || '暂无明确小程序承接入口')}</p>
      <ul>
        ${top
          .map(topic => `<li>${escapeHtml(topic.titleCn || topic.title)} <span>${Number(topic.score || 0)}分</span></li>`)
          .join('')}
      </ul>
      <small>最高优先级 ${Number(score)} 分</small>
    </article>
  `;
}

function renderTrendTopic(topic) {
  return `
    <li>
      <span>${escapeHtml(getTopicPillar(topic))}</span>
      <strong>${escapeHtml(topic.title || '未命名选题')}</strong>
      <em>${Number(topic.score || 0)}分</em>
    </li>
  `;
}

function renderTopicRow(topic) {
  const pillar = getTopicPillar(topic);
  const tags = Array.isArray(topic.tags) ? topic.tags.slice(0, 4) : [];
  return `
    <article class="research-topic-row">
      <div class="research-topic-score">${Number(topic.score || 0)}</div>
      <div class="research-topic-main">
        <div class="research-topic-title">
          <span class="research-pill">${escapeHtml(pillar)}</span>
          <h4>${escapeHtml(topic.titleCn || topic.title || '未命名选题')}</h4>
        </div>
        <p>${escapeHtml(getTopicArticleAngle(topic))}</p>
        <div class="research-meta-line">
          <span>${escapeHtml(getGameLabel(topic.game))}</span>
          <span>${escapeHtml(topic.source || '-')}</span>
          <span>${escapeHtml(getTopicVerifyText(topic))}</span>
          ${createTopicUrl(topic)}
        </div>
        ${
          tags.length
            ? `<div class="research-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`
            : ''
        }
      </div>
    </article>
  `;
}

function getPlatformCandidateBundle() {
  return state.status?.contentResearch?.platformCandidates || null;
}

function getTopACandidates() {
  const bundle = getPlatformCandidateBundle();
  return Array.isArray(bundle?.topA) ? bundle.topA : [];
}

function getAllPlatformCandidates() {
  const bundle = getPlatformCandidateBundle();
  if (!Array.isArray(bundle?.platforms)) return [];
  return bundle.platforms.flatMap(group => (Array.isArray(group.candidates) ? group.candidates : []));
}

function findPlatformCandidate(candidateId) {
  if (!candidateId) return null;
  return getAllPlatformCandidates().find(candidate => candidate.id === candidateId) || null;
}

function candidateGradeClass(grade) {
  const normalized = String(grade || 'C').toLowerCase();
  return ['a', 'b', 'c'].includes(normalized) ? `grade-${normalized}` : 'grade-c';
}

function renderPlatformCandidate(candidate, index = 0, compact = false) {
  const tags = Array.isArray(candidate.tags) ? candidate.tags.slice(0, compact ? 2 : 4) : [];
  const gradeClass = candidateGradeClass(candidate.grade);
  const score = Number(candidate.score || 0).toFixed(1).replace(/\.0$/, '');
  return `
    <article class="research-candidate-card ${gradeClass}">
      <div class="research-candidate-top">
        <span class="research-grade ${gradeClass}">${escapeHtml(candidate.grade || 'C')}</span>
        <span>${escapeHtml(candidate.platformLabel || candidate.platform || '-')}</span>
        <strong>${score} 分</strong>
      </div>
      <h4>${escapeHtml(candidate.title || candidate.topic || `候选题材 ${index + 1}`)}</h4>
      <p>${escapeHtml(candidate.articleAngle || '暂无角度说明')}</p>
      <div class="research-meta-line">
        <span>${escapeHtml(candidate.gameLabel || candidate.game || '综合')}</span>
        <span>${escapeHtml(candidate.pillar || '-')}</span>
        <span>${escapeHtml(candidate.source || '-')}</span>
      </div>
      ${candidate.platformRule ? `<small>${escapeHtml(candidate.platformRule)}</small>` : ''}
      ${candidate.reason ? `<small>${escapeHtml(candidate.reason)}</small>` : ''}
      ${
        tags.length
          ? `<div class="research-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`
          : ''
      }
      <div class="research-candidate-actions">
        <button class="ghost-btn research-use-candidate" type="button" data-candidate-id="${escapeHtml(candidate.id)}">采用题材</button>
        ${candidate.url ? `<a class="research-candidate-source" href="${escapeHtml(candidate.url)}" target="_blank" rel="noreferrer">看来源</a>` : ''}
      </div>
    </article>
  `;
}

function renderPlatformCandidateGroup(group) {
  const candidates = Array.isArray(group.candidates) ? group.candidates : [];
  const aCount = candidates.filter(candidate => candidate.grade === 'A').length;
  return `
    <article class="research-platform-column">
      <div class="research-platform-head">
        <h4>${escapeHtml(group.label || group.platform || '-')}</h4>
        <span>${aCount} 个A / ${candidates.length} 条</span>
      </div>
      <div class="research-candidate-list">
        ${candidates.map((candidate, index) => renderPlatformCandidate(candidate, index, true)).join('') || '<p class="content-research-empty">暂无候选题材</p>'}
      </div>
    </article>
  `;
}

function buildCandidateOptionLabel(candidate) {
  const score = Number(candidate.score || 0).toFixed(1).replace(/\.0$/, '');
  const title = candidate.title || candidate.topic || '未命名题材';
  return `${candidate.grade || 'C'}｜${candidate.platformLabel || candidate.platform || '-'}｜${score}分｜${title}`;
}

function renderDifyCandidateOptions(selectedId = '') {
  if (!difyAutoCandidateSelect) return;
  const candidates = getTopACandidates();
  const currentValue = selectedId || difyAutoCandidateSelect.value;
  difyAutoCandidateSelect.innerHTML = '<option value="">请选择 A 级题材</option>';
  for (const candidate of candidates) {
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = buildCandidateOptionLabel(candidate);
    difyAutoCandidateSelect.appendChild(option);
  }
  if (currentValue && candidates.some(candidate => candidate.id === currentValue)) {
    difyAutoCandidateSelect.value = currentValue;
  }
  renderDifyAutoCandidateMeta();
}

function renderDifyAutoCandidateMeta() {
  if (!difyAutoCandidateMeta) return;
  const candidate = findPlatformCandidate(difyAutoCandidateSelect?.value);
  if (!candidate) {
    const count = getTopACandidates().length;
    difyAutoCandidateMeta.textContent = count
      ? `已准备 ${count} 个 A 级题材，选择后可直接生成。`
      : '自动运行只使用 A 级题材；如果没有 A 级题材，先去“内容研究看板”更新候选池。';
    return;
  }
  const score = Number(candidate.score || 0).toFixed(1).replace(/\.0$/, '');
  difyAutoCandidateMeta.textContent = `${candidate.platformLabel || candidate.platform} · ${score} 分 · ${candidate.articleAngle || candidate.reason || '已通过候选池评分'}`;
}

function applyCandidateToDifyForm(candidate) {
  if (!candidate) return;
  const formState = loadDifyFormState();
  formState.channel = candidate.platform || formState.channel;
  formState.shared = { ...DIFY_SHARED_DEFAULTS, ...formState.shared };
  formState.shared.topic = candidate.topic || candidate.title || '';
  formState.shared.goal = candidate.goal || formState.shared.goal || DIFY_SHARED_DEFAULTS.goal;
  formState.shared.product_entry = candidate.productEntry || '';
  formState.shared.sources = candidate.sources || candidate.url || '';
  if (!formState.shared.transcript && candidate.articleAngle) {
    formState.shared.transcript = candidate.articleAngle;
  }
  formState.byChannel = formState.byChannel || {};
  formState.byChannel[formState.channel] = {
    ...(formState.byChannel[formState.channel] || {}),
    ...(candidate.channelFields || {}),
  };
  saveDifyFormState(formState);
  syncDifyForm();
  renderDifyCandidateOptions(candidate.id);
  if (difyCustomWrap?.classList.contains('collapsed')) {
    difyCustomWrap.classList.remove('collapsed');
    syncDifyFormCollapse();
  }
  document.querySelector('#dify')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  difyTopicInput?.focus();
}

function renderContentResearchBoard() {
  if (!contentResearchBoard) return;
  const research = state.status && state.status.contentResearch;
  if (!research) {
    contentResearchBoard.className = 'content-research-empty';
    contentResearchBoard.textContent = '还没有内容研究数据，先运行“更新论坛选题池”。';
    return;
  }

  const topics = Array.isArray(research.topics) ? research.topics : [];
  const actionItems = Array.isArray(research.actionItems) ? research.actionItems : [];
  const selectedPillar = researchPillarFilter?.value || 'all';
  const selectedGame = researchGameFilter?.value || 'all';
  const matchesResearchFilter = topic =>
    (selectedPillar === 'all' || getTopicPillars(topic).includes(selectedPillar)) &&
    (selectedGame === 'all' || normalizeTopicGame(topic.game) === selectedGame);
  const matchedTopics = topics.filter(matchesResearchFilter);
  const matchedActionItems = actionItems.filter(matchesResearchFilter);
  const filteredTopics = matchedTopics
    .slice(0, 16);
  const filteredActionItems = matchedActionItems.slice(0, 8);
  const filteredPillars = selectedPillar === 'all' ? RESEARCH_PILLARS : [selectedPillar];
  const filteredByPillar = matchedTopics.reduce((result, topic) => {
    getTopicPillars(topic).forEach(pillar => {
      if (!result[pillar]) result[pillar] = [];
      result[pillar].push(topic);
    });
    return result;
  }, {});
  const byPillar = research.byMiniappPage || {};
  const counters = research.counters || {};
  const trend = research.trend || {};
  const candidateBundle = research.platformCandidates || {};
  const topACandidates = Array.isArray(candidateBundle.topA) ? candidateBundle.topA : [];
  const candidateGroups = Array.isArray(candidateBundle.platforms) ? candidateBundle.platforms : [];
  const isFiltered = selectedPillar !== 'all' || selectedGame !== 'all';

  contentResearchBoard.className = 'content-research-board';
  contentResearchBoard.innerHTML = `
    <div class="research-overview">
      <div>
        <span class="stat-label">生成时间</span>
        <strong>${formatTime(research.generatedAt)}</strong>
      </div>
      <div>
        <span class="stat-label">${isFiltered ? '筛选选题' : '选题'}</span>
        <strong>${isFiltered ? matchedTopics.length : counters.topics || topics.length || 0}</strong>
      </div>
      <div>
        <span class="stat-label">来源</span>
        <strong>${counters.sources || 0}</strong>
      </div>
      <div>
        <span class="stat-label">导出</span>
        <strong>${escapeHtml(research.exports?.markdown || '-')}</strong>
      </div>
    </div>
    <section class="research-section">
      <div class="research-section-head">
        <h3>本次变化</h3>
        <span>${trend.comparedWith ? `对比 ${formatTime(trend.comparedWith)}` : '首次记录，下一次运行后会出现对比'}</span>
      </div>
      <div class="research-trend-grid">
        <article class="research-trend-card">
          <span>新增选题</span>
          <strong>${Number(trend.newCount || 0)}</strong>
          <ul>${(trend.newTopics || []).slice(0, 4).map(renderTrendTopic).join('') || '<li>暂无新增</li>'}</ul>
        </article>
        <article class="research-trend-card">
          <span>连续出现</span>
          <strong>${Number(trend.returningCount || 0)}</strong>
          <ul>${(trend.persistentTopics || []).slice(0, 4).map(renderTrendTopic).join('') || '<li>暂无连续选题</li>'}</ul>
        </article>
        <article class="research-trend-card compact">
          <span>本次消失</span>
          <strong>${Number(trend.disappearedCount || 0)}</strong>
          <p>连续出现更值得写；只出现一次的标题先当候选观察。</p>
        </article>
      </div>
    </section>
    <section class="research-section research-platform-candidates">
      <div class="research-section-head">
        <h3>三平台候选池</h3>
        <span>${escapeHtml(candidateBundle.note || '每个平台取 10 条候选，按赛道硬门槛筛 A；不合适不硬凑')}</span>
      </div>
      <div class="research-candidate-hero">
        <div class="research-candidate-summary">
          <span class="stat-label">今日 A 级题材</span>
          <strong>${topACandidates.length}</strong>
          <p>按头条号、公众号、小红书各自赛道筛出来。点“采用题材”会带入手动表单；自动稿只采用 A 级，不会跨平台硬套。</p>
        </div>
        <div class="research-candidate-grid">
          ${topACandidates.map((candidate, index) => renderPlatformCandidate(candidate, index)).join('') || '<p class="content-research-empty">今天还没有达到 A 级的题材，先观察，不硬写。</p>'}
        </div>
      </div>
      <div class="research-candidate-platforms">
        ${candidateGroups.map(renderPlatformCandidateGroup).join('') || '<p class="content-research-empty">暂无平台候选数据</p>'}
      </div>
    </section>
    <section class="research-section">
      <div class="research-section-head">
        <h3>今天优先写</h3>
        <span>先从高分、可写成文章或能承接小程序入口的选题开始</span>
      </div>
      <div class="research-action-grid">
        ${filteredActionItems.map(renderActionItem).join('') || '<p class="content-research-empty">当前筛选没有优先选题</p>'}
      </div>
    </section>
    <section class="research-section">
      <div class="research-section-head">
        <h3>内容方向</h3>
        <span>工具入口与自媒体选题一起看</span>
      </div>
      <div class="research-pillar-grid">
        ${filteredPillars.map(pillar => renderResearchPillarCard(pillar, isFiltered ? filteredByPillar[pillar] || [] : byPillar[pillar] || [])).join('')}
      </div>
    </section>
    <section class="research-section">
      <div class="research-section-head">
        <h3>筛选结果</h3>
        <span>${filteredTopics.length} 条 · ${selectedPillar === 'all' ? '全部方向' : selectedPillar} · ${
          selectedGame === 'all' ? '全部游戏' : getGameLabel(selectedGame)
        }</span>
      </div>
      <div class="research-topic-list">
        ${filteredTopics.map(renderTopicRow).join('') || '<p class="content-research-empty">当前筛选没有选题</p>'}
      </div>
    </section>
  `;

  contentResearchBoard.querySelectorAll('.research-use-candidate').forEach(button => {
    button.addEventListener('click', () => {
      applyCandidateToDifyForm(findPlatformCandidate(button.dataset.candidateId));
    });
  });
  renderDifyCandidateOptions();
}

async function loadTasks() {
  const data = await requestJson('/api/tasks');
  state.tasks = data.tasks;
  renderAutomationTaskOptions('game_data');
  renderAutomationTaskOptions('self_media');
  renderTasks();
}

async function loadStatus() {
  const data = await requestJson(`/api/status?env=${state.env}`);
  state.status = data;
  if (lastSyncText) {
    lastSyncText.textContent = `同步于 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  }
  renderSummary(data.summary);
  renderSurveyControl(data.summary);
  renderTasks();
  renderHistory();
  renderContentResearchBoard();
  loadDifyStatus();
  stopBtn.disabled = !data.currentRun;

  const currentRun = data.currentRun;
  if (currentRun && state.pinnedContextRunId && currentRun.runId !== state.pinnedContextRunId) {
    // 新任务开始了，自动退出历史日志回看
    state.pinnedLogRunId = '';
  }
  if (state.pinnedLogRunId) {
    if (currentRun && currentRun.runId === state.pinnedLogRunId) {
      logTitle.textContent = `${currentRun.taskName} · ${currentRun.environment} · ${statusText(currentRun)}`;
      await loadLog(currentRun.runId);
    } else {
      await loadLog(state.pinnedLogRunId);
    }
  } else if (currentRun) {
    state.activeRunId = currentRun.runId;
    logTitle.textContent = `${currentRun.taskName} · ${currentRun.environment} · ${statusText(currentRun)}`;
    await loadLog(currentRun.runId);
  } else if (state.activeRunId) {
    await loadLog(state.activeRunId);
  }
  updateRunStatusPill();
}

async function toggleFeatureSurvey() {
  const survey = state.status && state.status.summary && state.status.summary.survey;
  const enabled = !(survey && survey.enabled === true);
  const action = enabled ? '开启' : '关闭';
  if (!window.confirm(`确定${action} ${state.env} 环境的功能调研吗？`)) return;

  surveyToggleBtn.disabled = true;
  try {
    const data = await requestJson('/api/survey-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: state.env, enabled }),
    });
    window.alert(`${action}成功，已同步到 OSS：${data.remotePath}`);
    await loadStatus();
  } catch (error) {
    window.alert(error.message);
    await loadStatus();
  }
}

async function stopCurrentTask() {
  const currentRun = state.status && state.status.currentRun;
  if (!currentRun) return;
  if (!window.confirm(`停止当前任务「${currentRun.taskName}」？`)) return;

  try {
    await requestJson('/api/stop', { method: 'POST' });
    await loadStatus();
  } catch (error) {
    window.alert(error.message);
  }
}

async function loadLog(runId) {
  if (!runId) return;
  try {
    const res = await fetch(`/api/logs?runId=${encodeURIComponent(runId)}`);
    const text = await res.text();
    const shouldFollow = state.logAutoFollow || isLogNearBottom();
    const nextText = text || '暂无日志';
    if (logOutput.textContent !== nextText) {
      const previousScrollTop = logOutput.scrollTop;
      logOutput.textContent = nextText;
      if (shouldFollow) scrollLogToBottom();
      else logOutput.scrollTop = previousScrollTop;
    }
  } catch (error) {
    logOutput.textContent = error.message;
  }
}

function isLogNearBottom() {
  return logOutput.scrollHeight - logOutput.scrollTop - logOutput.clientHeight <= LOG_BOTTOM_THRESHOLD;
}

function updateLogFollowUi() {
  logFollowStatus.textContent = state.logAutoFollow ? '自动跟随日志' : '已暂停自动跟随';
  logFollowStatus.classList.toggle('paused', !state.logAutoFollow);
  scrollLogBottomBtn.hidden = state.logAutoFollow;
}

function scrollLogToBottom() {
  state.logAutoFollow = true;
  logOutput.scrollTop = logOutput.scrollHeight;
  updateLogFollowUi();
}

function appendDashboardWarning(message) {
  const text = `[warn] ${message}`;
  if (logOutput) {
    logOutput.textContent = logOutput.textContent
      ? `${logOutput.textContent}\n\n${text}`
      : text;
  }
  console.warn(message);
}

function handleLogScroll() {
  state.logAutoFollow = isLogNearBottom();
  updateLogFollowUi();
}

async function runTask(taskId, options = {}) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  const warning = task.dangerous ? '\n\n这是谨慎操作，请确认你已经检查过候选数据。' : '';
  if (!options.skipConfirm && !window.confirm(`在 ${state.env} 环境运行「${task.name}」？${warning}`)) return;

  try {
    const data = await requestJson('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, environment: state.env }),
    });
    state.activeRunId = data.run.runId;
    state.pinnedLogRunId = '';
    state.pinnedContextRunId = '';
    state.logAutoFollow = true;
    updateLogFollowUi();
    logTitle.textContent = `${data.run.taskName} · ${data.run.environment} · 启动中`;
    logOutput.textContent = '任务已启动，等待日志输出...';
    await loadStatus();
    return data.run;
  } catch (error) {
    if (options.skipConfirm) appendDashboardWarning(error.message);
    else window.alert(error.message);
    throw error;
  }
  return null;
}

async function loadDifyStatus(force = false) {
  const now = Date.now();
  const difyRunning = Boolean(state.status && state.status.currentRun && String(state.status.currentRun.taskId).startsWith('dify_'));
  if (!force && now - state.dify.lastFetchAt < (difyRunning ? 2500 : 15000)) return;
  try {
    state.dify.status = await requestJson('/api/dify/status');
    state.dify.lastFetchAt = now;
    renderDifyPanel();
  } catch (error) {
    state.dify.lastFetchAt = Date.now();
    difyMeta.textContent = `自媒体状态加载失败：${error.message}`;
  }
}

function renderDifyPanel() {
  const status = state.dify.status;
  if (!status) return;
  const currentRun = state.status && state.status.currentRun;
  const disabled = Boolean(currentRun);

  const cronParts = [];
  cronParts.push(status.configOk ? '<span class="dify-ok">头条号密钥已配置</span>' : '<span class="dify-warn">头条号缺 config.json 或 API Key</span>');
  cronParts.push(status.wechatConfigOk ? '<span class="dify-ok">公众号密钥已配置</span>' : '<span class="dify-warn">公众号缺 wechat_api_key（导入 07 工作流后在 config.json 填入）</span>');
  cronParts.push(status.xhsConfigOk ? '<span class="dify-ok">小红书密钥已配置</span>' : '<span class="dify-warn">小红书缺 xhs_api_key（导入 06 工作流后在 config.json 填入）</span>');
  if (status.cron.installed) {
    cronParts.push(`定时：${status.cron.scheduleText} · 下次 ${status.cron.nextRun ? formatTime(status.cron.nextRun) : '-'}`);
  } else {
    cronParts.push('<span class="dify-warn">crontab 未安装定时任务</span>');
  }
  if (status.cron.logTail) {
    const lastLine = status.cron.logTail.split('\n').filter(Boolean).pop() || '';
    cronParts.push(`最近一次：${escapeHtml(lastLine.slice(0, 80))}`);
  }
  difyMeta.innerHTML = cronParts.join('<span class="dify-meta-divider">·</span>');

  const planCards = (status.todayPlan || []).map(task => `
    <article class="dify-plan-card ${task.done ? 'done' : ''}">
      <div class="dify-plan-head">
        <span class="badge">篇${task.index}</span>
        <strong>${escapeHtml(task.article_type)}</strong>
        <span class="dify-plan-state">${task.done ? '已有稿件' : '待生成'}</span>
      </div>
      <p>${escapeHtml(task.goal || '')}</p>
      ${task.ref_account ? `<p class="dify-plan-ref">参考公众号：${escapeHtml(task.ref_account)}</p>` : ''}
      <div class="dify-plan-actions">
        <button class="run-btn" data-dify-index="${task.index}" ${disabled ? 'disabled' : ''}>${task.done ? '重新生成' : '生成此篇'}</button>
        ${task.done ? `<button class="ghost-btn" data-dify-view="${task.index}">查看</button>` : ''}
      </div>
    </article>
  `).join('');
  difyTodayGrid.innerHTML = planCards || '<p class="dify-empty">今天不在发布日程（一/三/五/日），可以随时手动运行。</p>';
  difyTodayHead.textContent = status.today ? `今日计划（${status.today}${status.inSchedule ? '' : ' · 非发布日'}）` : '今日计划';
  difyRunAllBtn.disabled = disabled || !status.inSchedule;
  difyCustomRunBtn.disabled = disabled;
  difyResetFormBtn.disabled = disabled;
  // 表单控件由渠道档案动态渲染，锁定态走 class，避免与渲染时序耦合
  difyCustomWrap.classList.toggle('is-locked', disabled);

  const articleRows = (status.articles || []).map(article => {
    const statusClass = article.status.includes('可以发布') ? 'dify-ok' : 'dify-warn';
    const customBadge = article.custom ? '<span class="badge dify-custom-badge">自定义</span>' : '';
    const channelBadge =
      article.channel === 'xhs'
        ? '<span class="badge dify-xhs-badge">小红书</span>'
        : article.channel === 'wechat'
          ? '<span class="badge dify-wechat-badge">公众号</span>'
          : '';
    const htmlBadge = article.hasHtml ? '<span class="badge dify-wechat-badge">已排版</span>' : '';
    return `
      <button class="dify-article-row" data-dify-article-date="${article.date}" data-dify-article-file="${escapeHtml(article.fileName)}" data-dify-article-html="${article.hasHtml ? '1' : ''}">
        <span class="dify-article-date">${article.date.slice(5)}</span>
        <span class="dify-article-title">${article.title ? escapeHtml(article.title) : escapeHtml(article.fileName)}</span>
        <span class="dify-article-type">${channelBadge}${customBadge}${htmlBadge}${escapeHtml(article.type)}</span>
        <span class="${statusClass}">${escapeHtml(article.status || '未知')}</span>
        <span class="dify-article-words">${article.words != null ? `${article.words} 字` : ''}</span>
      </button>
    `;
  }).join('');
  difyArticleList.innerHTML = articleRows || '<p class="dify-empty">还没有生成过文章。</p>';
  difyArticleList.classList.toggle('scrollable', (status.articles || []).length > 10);
}

async function runDifyTask(taskId, confirmText) {
  if (!window.confirm(confirmText)) return;
  try {
    const data = await requestJson('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, environment: state.env }),
    });
    state.activeRunId = data.run.runId;
    state.pinnedLogRunId = '';
    state.pinnedContextRunId = '';
    state.logAutoFollow = true;
    updateLogFollowUi();
    logTitle.textContent = `${data.run.taskName} · ${data.run.environment} · 启动中`;
    logOutput.textContent = '任务已启动，等待日志输出...';
    await loadStatus();
    await loadDifyStatus(true);
  } catch (error) {
    window.alert(error.message);
  }
}

async function openDifyArticle(date, fileName, hasHtml = false) {
  state.dify.openArticle = { date, fileName, hasHtml };
  difyArticleMeta.textContent = `${date} · ${fileName.replace(/^(\d+|custom|xhs_\w+|wechat_\w+)_/, '').replace(/\.md$/, '')}`;
  difyArticleTitle.textContent = '加载中...';
  difyArticleContent.textContent = '';
  if (difyPreviewHtmlBtn) difyPreviewHtmlBtn.hidden = !hasHtml;
  difyArticleMask.hidden = false;
  try {
    const data = await requestJson(`/api/dify/article?date=${encodeURIComponent(date)}&file=${encodeURIComponent(fileName)}`);
    state.dify.openArticle.content = data.content;
    difyArticleTitle.textContent = (data.content.match(/【标题候选[^】]*】\s*\n1[.、]\s*(.*)/) || [])[1] || fileName;
    difyArticleContent.textContent = data.content;
  } catch (error) {
    difyArticleTitle.textContent = '加载失败';
    difyArticleContent.textContent = error.message;
  }
}

async function copyDifyArticle(mode) {
  const article = state.dify.openArticle;
  if (!article || !article.content) return;
  let text = article.content;
  if (mode === 'publish') {
    const divider = text.indexOf('\n\n---\n\n【审计报告】');
    if (divider > 0) text = text.slice(0, divider);
  }
  try {
    await navigator.clipboard.writeText(text.trim());
    const isXhs = article.fileName.startsWith('xhs_');
    const isWechat = article.fileName.startsWith('wechat_');
    window.alert(mode === 'publish'
      ? (isXhs
          ? '发布稿已复制，可粘贴到小红书发布页（标题、卡片脚本、正文、标签都在里面）。'
          : isWechat
            ? '发布稿已复制，可粘贴到公众号编辑器。'
            : '发布稿已复制，可粘贴到头条号编辑器。')
      : '全文已复制。');
  } catch (error) {
    window.alert(`复制失败：${error.message}`);
  }
}

// ── Dify 自定义表单 ─────────────────────────────────────────────
// 渠道档案（字段/选项/文案）来自 /api/dify/form-config，是唯一事实来源；
// 前端只做三件事：按档案渲染渠道专属下拉、按渠道分桶记忆、提交时原样回传。

let difyChannels = [];
let difyChannelSelects = {};

function readJsonStorage(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key)) || {};
  } catch (error) {
    return {};
  }
}

// v1 旧存储是单桶平铺，迁移为 v2 的按渠道分桶结构，迁移完即清除
function migrateLegacyDifyForm() {
  const legacy = readJsonStorage(DIFY_FORM_LEGACY_KEY);
  if (!Object.keys(legacy).length) return null;
  const legacyChannelKey = legacy.channel === '小红书' ? 'xhs' : legacy.channel === '公众号' ? 'wechat' : 'toutiao';
  const legacyToChannelFields = {
    toutiao: ['ref_account', 'platform', 'article_type'],
    xhs: ['niche', 'note_type', 'ref_blogger'],
    wechat: ['ref_account', 'article_type'],
  };
  const state = { channel: legacyChannelKey, shared: {}, byChannel: {} };
  for (const [key, value] of Object.entries(legacy)) {
    if (key === 'channel') continue;
    const targetChannel = Object.keys(legacyToChannelFields).find(ch => legacyToChannelFields[ch].includes(key));
    if (targetChannel) {
      state.byChannel[targetChannel] = { ...state.byChannel[targetChannel], [key]: value };
    } else {
      state.shared[key] = value;
    }
  }
  window.localStorage.removeItem(DIFY_FORM_LEGACY_KEY);
  return state;
}

function loadDifyFormState() {
  const migrated = migrateLegacyDifyForm();
  const state = migrated || readJsonStorage(DIFY_FORM_STORAGE_KEY);
  const fallback = difyChannels[0];
  if (!difyChannels.some(profile => profile.key === state.channel)) state.channel = fallback ? fallback.key : '';
  state.shared = { ...DIFY_SHARED_DEFAULTS, ...state.shared };
  state.byChannel = state.byChannel || {};
  return state;
}

function saveDifyFormState(state) {
  window.localStorage.setItem(DIFY_FORM_STORAGE_KEY, JSON.stringify(state));
}

function currentDifyProfile(state) {
  return difyChannels.find(profile => profile.key === state.channel) || difyChannels[0];
}

// 选项不在档案内（如旧存储的过时选项）时回落首项，与服务端 custom-run 的软校验一致
function pickDifyOption(field, value) {
  return field.options.includes(value) ? value : field.options[0];
}

function buildDifySelect(field, value) {
  const select = document.createElement('select');
  select.dataset.difyField = field.key;
  for (const option of field.options) {
    const optionEl = document.createElement('option');
    optionEl.value = option;
    optionEl.textContent = option;
    select.appendChild(optionEl);
  }
  select.value = pickDifyOption(field, value);
  return select;
}

// 切换渠道时整体重建：渠道下拉、渠道专属字段、goal/style 文案
function renderDifyChannelUI(state) {
  const profile = currentDifyProfile(state);
  if (!profile) return;

  difyChannelSelect.innerHTML = '';
  for (const item of difyChannels) {
    const optionEl = document.createElement('option');
    optionEl.value = item.key;
    optionEl.textContent = item.label;
    optionEl.selected = item.key === profile.key;
    difyChannelSelect.appendChild(optionEl);
  }

  difyChannelFieldsWrap.innerHTML = '';
  difyChannelSelects = {};
  const savedFields = state.byChannel[profile.key] || {};
  for (const field of profile.fields) {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = field.label;
    const select = buildDifySelect(field, savedFields[field.key]);
    difyChannelSelects[field.key] = select;
    label.append(span, select);
    difyChannelFieldsWrap.appendChild(label);
  }

  difyGoalLabel.textContent = profile.copy.goalLabel;
  difyGoalInput.placeholder = profile.copy.goalPlaceholder;
  difyStyleLabel.textContent = profile.copy.styleLabel;
  difyStyleInput.placeholder = profile.copy.stylePlaceholder;
  difyCustomRunBtn.textContent = profile.copy.runButton;
}

function applyDifyFormValues(state) {
  renderDifyChannelUI(state);
  for (const [key, selector] of Object.entries(DIFY_SHARED_FIELD_IDS)) {
    const element = document.querySelector(selector);
    if (element) element.value = state.shared[key] != null ? state.shared[key] : '';
  }
}

function syncDifyForm() {
  applyDifyFormValues(loadDifyFormState());
}

function syncDifyFormCollapse() {
  if (!difyCustomWrap || !difyFormToggleBtn) return;
  difyFormToggleBtn.textContent = difyCustomWrap.classList.contains('collapsed') ? '展开表单' : '收起表单';
}

function initDifyFormCollapse() {
  if (!difyCustomWrap) return;
  // 下拉是记忆不是输入，只看 shared 内容是否有自定义来决定展开
  const state = loadDifyFormState();
  const hasCustomValues = Object.entries(state.shared)
    .some(([key, value]) => value && value !== DIFY_SHARED_DEFAULTS[key]);
  difyCustomWrap.classList.toggle('collapsed', !hasCustomValues);
  syncDifyFormCollapse();
}

// 从 DOM 收集表单值：shared 跨渠道共用，渠道字段写入当前渠道的桶
function collectDifyForm(persist = true) {
  const state = loadDifyFormState();
  for (const key of Object.keys(DIFY_SHARED_DEFAULTS)) {
    const element = document.querySelector(DIFY_SHARED_FIELD_IDS[key]);
    state.shared[key] = element ? element.value.trim() : '';
  }
  const profile = currentDifyProfile(state);
  if (profile) {
    const bucket = {};
    for (const field of profile.fields) {
      const select = difyChannelSelects[field.key];
      bucket[field.key] = select ? select.value : pickDifyOption(field, '');
    }
    state.byChannel[profile.key] = bucket;
  }
  if (persist) saveDifyFormState(state);
  return { state, profile };
}

async function runDifyCustom() {
  const { state, profile } = collectDifyForm();
  if (!profile) return;
  if (!state.shared.goal) {
    window.alert(`「${profile.copy.goalLabel}」必填，请填写后再生成。`);
    difyGoalInput.focus();
    return;
  }
  const payload = {
    workflow: profile.key,
    ...state.shared,
    ...(state.byChannel[profile.key] || {}),
  };
  const topicText = state.shared.topic ? `「${state.shared.topic}」` : '自动找热点';
  const typeText = profile.fields.map(field => `${field.label}：${payload[field.key]}`).join(' · ');
  if (!window.confirm(`按表单生成${profile.copy.targetName}？\n${typeText} · 选题：${topicText}\n约 1-3 分钟，消耗 Dify API 额度。`)) return;

  await submitDifyRun(payload);
}

function buildDifyPayloadFromCandidate(candidate) {
  const profile = difyChannels.find(item => item.key === candidate.platform) || difyChannels[0];
  if (!profile) return null;
  return {
    workflow: profile.key,
    topic: candidate.topic || candidate.title || '',
    goal: candidate.goal || `把「${candidate.title || candidate.topic || '候选题材'}」写成可发布文章。`,
    product_entry: candidate.productEntry || '',
    sources: candidate.sources || candidate.url || '',
    transcript: candidate.articleAngle || candidate.reason || '',
    style_reference: '',
    candidate_id: candidate.id || '',
    candidate_topic_id: candidate.topicId || '',
    candidate_platform: candidate.platform || profile.key,
    candidate_title: candidate.title || candidate.topic || '',
    candidate_source: candidate.source || '',
    candidate_url: candidate.url || '',
    candidate_score: candidate.score || '',
    candidate_reason: candidate.reason || '',
    ...(candidate.channelFields || {}),
  };
}

async function runDifyAutoCandidate() {
  const candidate = findPlatformCandidate(difyAutoCandidateSelect?.value);
  if (!candidate) {
    window.alert('请先选择一个 A 级题材。');
    return;
  }
  const payload = buildDifyPayloadFromCandidate(candidate);
  if (!payload) {
    window.alert('自媒体表单配置还没加载完成，请刷新后重试。');
    return;
  }
  const score = Number(candidate.score || 0).toFixed(1).replace(/\.0$/, '');
  if (!window.confirm(`采用 A 级题材直接生成？\n${candidate.platformLabel || candidate.platform} · ${score} 分\n${candidate.title || candidate.topic}\n约 1-3 分钟，消耗 Dify API 额度。`)) return;
  await submitDifyRun(payload);
}

async function submitDifyRun(payload) {
  try {
    const data = await requestJson('/api/dify/custom-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.activeRunId = data.run.runId;
    state.pinnedLogRunId = '';
    state.pinnedContextRunId = '';
    state.logAutoFollow = true;
    updateLogFollowUi();
    logTitle.textContent = `${data.run.taskName} · 启动中`;
    logOutput.textContent = '任务已启动，等待日志输出...';
    await loadStatus();
    await loadDifyStatus(true);
  } catch (error) {
    window.alert(error.message);
  }
}

// 渠道档案从服务端加载后初始化表单；加载失败则禁用生成入口，避免用过期选项提交
async function bindDifyPanel() {
  try {
    const config = await requestJson('/api/dify/form-config');
    difyChannels = config.channels || [];
  } catch (error) {
    difyChannels = [];
    window.alert('自媒体表单配置加载失败，请刷新页面重试。');
  }
  const formReady = difyChannels.length > 0;
  difyCustomRunBtn.disabled = !formReady;
  difyResetFormBtn.disabled = !formReady;
  if (!formReady) return;

  syncDifyForm();
  initDifyFormCollapse();
  renderDifyCandidateOptions();
  document.querySelectorAll('#difyCustomWrap input, #difyCustomWrap textarea').forEach(element => {
    element.addEventListener('change', () => collectDifyForm());
  });
  difyAutoCandidateSelect?.addEventListener('change', renderDifyAutoCandidateMeta);
  difyAutoCandidateRunBtn?.addEventListener('click', runDifyAutoCandidate);
  difyChannelFieldsWrap.addEventListener('change', () => collectDifyForm());
  difyChannelSelect?.addEventListener('change', () => {
    // 先按存储里的旧渠道把 DOM 值落桶，再把存储切到新渠道并按其档案重建表单
    collectDifyForm();
    const state = loadDifyFormState();
    state.channel = difyChannelSelect.value;
    saveDifyFormState(state);
    syncDifyForm();
  });
  difyFormToggleBtn?.addEventListener('click', () => {
    difyCustomWrap.classList.toggle('collapsed');
    syncDifyFormCollapse();
  });
  difyResetFormBtn.addEventListener('click', () => {
    window.localStorage.removeItem(DIFY_FORM_STORAGE_KEY);
    syncDifyForm();
  });
  difyCustomRunBtn.addEventListener('click', runDifyCustom);
  difyRunAllBtn.addEventListener('click', () => {
    runDifyTask('dify_publish_all', '生成今日全部文章？每篇约 1-3 分钟，消耗 Dify API 额度。');
  });
  difyTodayGrid.addEventListener('click', event => {
    const runButton = event.target.closest('[data-dify-index]');
    if (runButton) {
      const index = runButton.dataset.difyIndex;
      runDifyTask(`dify_publish_${index}`, `生成今日第 ${index} 篇？约 1-3 分钟，消耗 Dify API 额度。`);
      return;
    }
    const viewButton = event.target.closest('[data-dify-view]');
    if (viewButton) {
      const status = state.dify.status;
      const task = status && status.todayPlan.find(item => String(item.index) === viewButton.dataset.difyView);
      if (task) openDifyArticle(status.today, task.fileName);
    }
  });
  difyArticleList.addEventListener('click', event => {
    const row = event.target.closest('[data-dify-article-date]');
    if (row) openDifyArticle(row.dataset.difyArticleDate, row.dataset.difyArticleFile, row.dataset.difyArticleHtml === '1');
  });
  difyPreviewHtmlBtn?.addEventListener('click', () => {
    const article = state.dify.openArticle;
    if (!article) return;
    const htmlFile = article.fileName.replace(/\.md$/, '.html');
    window.open(`/api/dify/article-html?date=${encodeURIComponent(article.date)}&file=${encodeURIComponent(htmlFile)}`, '_blank');
  });
  difyCopyPublishBtn.addEventListener('click', () => copyDifyArticle('publish'));
  difyCopyAllBtn.addEventListener('click', () => copyDifyArticle('all'));
  difyCloseArticleBtn.addEventListener('click', () => {
    difyArticleMask.hidden = true;
  });
  difyArticleMask.addEventListener('click', event => {
    if (event.target === difyArticleMask) difyArticleMask.hidden = true;
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !difyArticleMask.hidden) difyArticleMask.hidden = true;
  });
}


const AUTOMATION_KINDS = ['game_data', 'self_media'];
const AUTOMATION_CONFIG = {
  game_data: {
    label: '游戏数据',
    defaultTaskId: 'daily_publish',
    selectors: {
      taskSelect: automationTaskSelect,
      addTaskBtn: automationAddTaskBtn,
      queueList: automationQueueList,
      intervalInput: automationIntervalInput,
      jitterInput: automationJitterInput,
      saveBtn: automationSaveBtn,
      runNowBtn: automationRunNowBtn,
      toggleBtn: automationToggleBtn,
      statusText: automationStatusText,
      nextText: automationNextText,
    },
  },
  self_media: {
    label: '自媒体发文',
    defaultTaskId: 'dify_publish_toutiao',
    selectors: {
      taskSelect: mediaAutomationTaskSelect,
      addTaskBtn: mediaAutomationAddTaskBtn,
      queueList: mediaAutomationQueueList,
      intervalInput: mediaAutomationIntervalInput,
      jitterInput: mediaAutomationJitterInput,
      saveBtn: mediaAutomationSaveBtn,
      runNowBtn: mediaAutomationRunNowBtn,
      toggleBtn: mediaAutomationToggleBtn,
      statusText: mediaAutomationStatusText,
      nextText: mediaAutomationNextText,
    },
  },
};

function getAutomationKind(kind) {
  return AUTOMATION_KINDS.includes(kind) ? kind : 'game_data';
}

function normalizeAutomationInterval(value, kind = 'game_data', fallback = 120) {
  const automationKind = getAutomationKind(kind);
  const number = clampNumber(value, automationKind === 'self_media' ? 30 : 10, fallback);
  if (automationKind === 'self_media' && !SELF_MEDIA_INTERVAL_VALUES.includes(number)) {
    return SELF_MEDIA_INTERVAL_VALUES.includes(fallback) ? fallback : 1440;
  }
  return number;
}

function getAutomationConfig(kind) {
  return AUTOMATION_CONFIG[getAutomationKind(kind)];
}

function createDefaultAutomationSettings(kind) {
  const automationKind = getAutomationKind(kind);
  const config = getAutomationConfig(automationKind);
  return {
    enabled: false,
    group: automationKind,
    taskId: config.defaultTaskId,
    taskIds: [config.defaultTaskId],
    intervalMinutes: automationKind === 'self_media' ? 1440 : 120,
    jitterMinutes: automationKind === 'self_media' ? 30 : 10,
    nextRunAt: 0,
    updatedAt: 0,
  };
}

function migrateAutomationTaskId(taskId) {
  if (taskId === 'dify_publish_all' || taskId === 'dify_publish_1' || taskId === 'dify_publish_2') return 'dify_publish_toutiao';
  return taskId;
}

function getAutomation(kind) {
  const automationKind = getAutomationKind(kind);
  if (!state.automations[automationKind]) {
    state.automations[automationKind] = createDefaultAutomationSettings(automationKind);
  }
  return state.automations[automationKind];
}

function getEnabledAutomationKinds() {
  return AUTOMATION_KINDS.filter(kind => getAutomation(kind).enabled === true);
}

function getNextAutomationSchedule() {
  return getEnabledAutomationKinds()
    .map(kind => ({ kind, nextRunAt: Number(getAutomation(kind).nextRunAt || 0) }))
    .filter(item => item.nextRunAt > 0)
    .sort((a, b) => a.nextRunAt - b.nextRunAt)[0] || null;
}

function normalizeAutomationTaskIds(taskIds, kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const availableIds = new Set(getSchedulableTasks(automationKind).map(task => task.id));
  const seen = new Set();
  const normalized = (Array.isArray(taskIds) ? taskIds : [])
    .map(id => String(id || ''))
    .map(migrateAutomationTaskId)
    .filter(id => availableIds.has(id))
    .filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const fallback = getAutomationConfig(automationKind).defaultTaskId;
  return normalized.length ? normalized : [fallback];
}

function normalizeAutomationSettingsInput(saved, kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const defaults = createDefaultAutomationSettings(automationKind);
  if (!saved || typeof saved !== 'object') return defaults;
  const taskIds = normalizeAutomationTaskIds(saved.taskIds || (saved.taskId ? [saved.taskId] : []), automationKind);
  return {
    ...defaults,
    ...saved,
    group: automationKind,
    taskId: taskIds[0],
    taskIds,
    intervalMinutes: normalizeAutomationInterval(saved.intervalMinutes, automationKind, defaults.intervalMinutes),
    jitterMinutes: clampNumber(saved.jitterMinutes, 0, defaults.jitterMinutes),
    nextRunAt: Number(saved.nextRunAt) || 0,
    updatedAt: Number(saved.updatedAt) || 0,
  };
}

function normalizeAutomationBundleInput(saved) {
  const raw = saved && typeof saved === 'object' ? saved : {};
  const isLegacyFlat = raw.taskId || raw.taskIds || raw.intervalMinutes || raw.enabled || raw.nextRunAt;
  return {
    game_data: normalizeAutomationSettingsInput(isLegacyFlat ? raw : raw.game_data, 'game_data'),
    self_media: normalizeAutomationSettingsInput(isLegacyFlat ? {} : raw.self_media, 'self_media'),
  };
}

function storeAutomationSettingsLocal() {
  window.localStorage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(state.automations));
}

async function loadAutomationSettings() {
  let localSettings = null;
  let serverSettings = null;
  try {
    const raw = window.localStorage.getItem(AUTOMATION_STORAGE_KEY);
    if (raw) localSettings = normalizeAutomationBundleInput(JSON.parse(raw));
  } catch (error) {
    console.warn('读取自动运行设置失败:', error);
  }

  try {
    const data = await requestJson('/api/automation-settings');
    serverSettings = normalizeAutomationBundleInput(data.automation);
  } catch (error) {
    console.warn('读取服务端自动运行设置失败:', error);
  }

  AUTOMATION_KINDS.forEach(kind => {
    const local = localSettings && localSettings[kind];
    const server = serverSettings && serverSettings[kind];
    const localUpdatedAt = Number(local?.updatedAt || 0);
    const serverUpdatedAt = Number(server?.updatedAt || 0);
    state.automations[kind] = serverUpdatedAt > localUpdatedAt ? server : local || server || createDefaultAutomationSettings(kind);
  });
  storeAutomationSettingsLocal();
}

function saveAutomationSettings(kind) {
  if (kind) getAutomation(kind).updatedAt = Date.now();
  storeAutomationSettingsLocal();
}

async function syncAutomationSettingsToServer() {
  try {
    const data = await requestJson('/api/automation-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automation: state.automations }),
    });
    if (data.automation) {
      state.automations = normalizeAutomationBundleInput(data.automation);
      storeAutomationSettingsLocal();
    }
  } catch (error) {
    console.warn('同步自动运行设置失败:', error);
  }
}

function persistAutomationSettings(kind) {
  saveAutomationSettings(kind);
  syncAutomationSettingsToServer();
}

function getSchedulableTasks(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const tasks = state.tasks.filter(task => task.id && task.group === automationKind);
  if (automationKind !== 'self_media') return tasks;
  const byId = new Map(tasks.map(task => [task.id, task]));
  return SELF_MEDIA_PLATFORM_TASK_IDS.map(id => byId.get(id)).filter(Boolean);
}

function getAutomationQueue(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const settings = getAutomation(automationKind);
  const availableIds = new Set(getSchedulableTasks(automationKind).map(task => task.id));
  const queue = normalizeAutomationTaskIds(settings.taskIds, automationKind).filter(taskId => availableIds.has(taskId));
  if (!queue.length && getSchedulableTasks(automationKind)[0]) queue.push(getSchedulableTasks(automationKind)[0].id);
  settings.taskIds = queue;
  settings.taskId = queue[0] || settings.taskId;
  return queue;
}

function renderAutomationTaskOptions(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const elements = getAutomationConfig(automationKind).selectors;
  if (!elements.taskSelect) return;
  const settings = getAutomation(automationKind);
  const schedulableTasks = getSchedulableTasks(automationKind);
  elements.taskSelect.innerHTML = schedulableTasks
    .map(task => `<option value="${task.id}">${task.name}</option>`)
    .join('');
  getAutomationQueue(automationKind);
  if (schedulableTasks.some(task => task.id === settings.taskId)) {
    elements.taskSelect.value = settings.taskId;
  } else if (schedulableTasks[0]) {
    settings.taskId = schedulableTasks[0].id;
    elements.taskSelect.value = settings.taskId;
  }
  renderAutomationQueue(automationKind);
}

function renderAutomationQueue(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const elements = getAutomationConfig(automationKind).selectors;
  if (!elements.queueList) return;
  const queue = getAutomationQueue(automationKind);
  const currentRun = state.status && state.status.currentRun;
  const disabled = state.automationRunner.running || Boolean(currentRun);
  elements.queueList.innerHTML = queue
    .map((taskId, index) => {
      const task = state.tasks.find(item => item.id === taskId);
      if (!task) return '';
      const isCurrent = state.automationRunner.running && state.automationRunner.kind === automationKind && state.automationRunner.currentIndex === index;
      const gameLabel = task.game === 'all' ? 'ALL' : String(task.game || '').toUpperCase();
      const taskType = automationKind === 'self_media'
        ? '生成草稿'
        : task.localOnly
          ? '本地内容研究'
          : Array.isArray(task.steps)
            ? '流程任务'
            : '脚本任务';
      return `
        <li class="automation-queue-item ${isCurrent ? 'running' : ''}" draggable="${disabled ? 'false' : 'true'}" data-kind="${automationKind}" data-index="${index}">
          <span class="drag-handle" aria-hidden="true">☰</span>
          <span class="queue-index">${index + 1}</span>
          <div class="queue-copy">
            <strong>${escapeHtml(task.name)}</strong>
            <small>${escapeHtml(gameLabel)} · ${taskType}</small>
          </div>
          <button class="queue-remove-btn" data-kind="${automationKind}" data-index="${index}" ${disabled || queue.length <= 1 ? 'disabled' : ''}>移除</button>
        </li>
      `;
    })
    .join('');

  elements.queueList.querySelectorAll('.queue-remove-btn').forEach(button => {
    button.addEventListener('click', () => removeAutomationTask(button.dataset.kind, Number(button.dataset.index)));
  });
  elements.queueList.querySelectorAll('.automation-queue-item').forEach(item => {
    item.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', item.dataset.index);
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', event => event.preventDefault());
    item.addEventListener('drop', event => {
      event.preventDefault();
      const fromIndex = Number(event.dataTransfer.getData('text/plain'));
      const toIndex = Number(item.dataset.index);
      reorderAutomationTask(item.dataset.kind, fromIndex, toIndex);
    });
  });
}

function addAutomationTask(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const elements = getAutomationConfig(automationKind).selectors;
  const settings = getAutomation(automationKind);
  const taskId = elements.taskSelect && elements.taskSelect.value;
  if (!taskId) return;
  settings.taskIds = normalizeAutomationTaskIds([...getAutomationQueue(automationKind), taskId], automationKind);
  settings.taskId = settings.taskIds[0];
  persistAutomationSettings(automationKind);
  renderAutomationQueue(automationKind);
  updateAutomationUi();
}

function removeAutomationTask(kind, index) {
  const automationKind = getAutomationKind(kind);
  const settings = getAutomation(automationKind);
  const queue = getAutomationQueue(automationKind);
  if (queue.length <= 1) return;
  queue.splice(index, 1);
  settings.taskIds = normalizeAutomationTaskIds(queue, automationKind);
  settings.taskId = settings.taskIds[0];
  persistAutomationSettings(automationKind);
  renderAutomationQueue(automationKind);
  updateAutomationUi();
}

function reorderAutomationTask(kind, fromIndex, toIndex) {
  const automationKind = getAutomationKind(kind);
  const settings = getAutomation(automationKind);
  const queue = getAutomationQueue(automationKind);
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return;
  const [moved] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, moved);
  settings.taskIds = normalizeAutomationTaskIds(queue, automationKind);
  settings.taskId = settings.taskIds[0];
  persistAutomationSettings(automationKind);
  renderAutomationQueue(automationKind);
  updateAutomationUi();
}

function computeNextRunAt(kind = 'game_data', from = Date.now()) {
  const settings = getAutomation(kind);
  const intervalMs = settings.intervalMinutes * 60 * 1000;
  const jitterMs = settings.jitterMinutes * 60 * 1000;
  const offset = jitterMs ? Math.round((Math.random() * 2 - 1) * jitterMs) : 0;
  return from + Math.max(10 * 60 * 1000, intervalMs + offset);
}

function syncAutomationForm(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const settings = getAutomation(automationKind);
  const elements = getAutomationConfig(automationKind).selectors;
  if (!elements.taskSelect) return;
  elements.taskSelect.value = settings.taskId;
  elements.intervalInput.value = settings.intervalMinutes;
  elements.jitterInput.value = settings.jitterMinutes;
}

function updateAutomationUi() {
  AUTOMATION_KINDS.forEach(kind => {
    const settings = getAutomation(kind);
    const config = getAutomationConfig(kind);
    const elements = config.selectors;
    const queue = getAutomationQueue(kind);
    const queueNames = queue
      .map(taskId => state.tasks.find(task => task.id === taskId)?.name || taskId)
      .join(' -> ');
    if (!elements.toggleBtn) return;
    elements.toggleBtn.textContent = settings.enabled ? '关闭自动运行' : '开启自动运行';
    elements.toggleBtn.classList.toggle('active', settings.enabled);
    const currentRun = state.status && state.status.currentRun;
    const queueEditingDisabled = state.automationRunner.running || Boolean(currentRun);
    elements.taskSelect.disabled = queueEditingDisabled;
    elements.addTaskBtn.disabled = queueEditingDisabled;
    elements.runNowBtn.disabled = queueEditingDisabled || Boolean(state.countdown);
    elements.statusText.textContent = state.automationRunner.running && state.automationRunner.kind === kind
      ? `队列运行中：${state.automationRunner.currentIndex + 1}/${state.automationRunner.total}`
      : settings.enabled
        ? `已开启：${queue.length} 个任务`
        : '未开启';
    elements.nextText.textContent = settings.enabled
      ? `下次：${formatDateTime(settings.nextRunAt)} · ${queueNames || '-'}`
      : '下次：-';
    renderAutomationQueue(kind);
  });
  if (automationNavDot) automationNavDot.hidden = getEnabledAutomationKinds().length === 0;
}

function applyAutomationForm(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const settings = getAutomation(automationKind);
  const elements = getAutomationConfig(automationKind).selectors;
  settings.taskId = (elements.taskSelect && elements.taskSelect.value) || settings.taskId;
  settings.taskIds = getAutomationQueue(automationKind);
  settings.intervalMinutes = normalizeAutomationInterval(elements.intervalInput.value, automationKind, settings.intervalMinutes);
  settings.jitterMinutes = clampNumber(elements.jitterInput.value, 0, settings.jitterMinutes);
  if (settings.enabled) settings.nextRunAt = computeNextRunAt(automationKind);
  persistAutomationSettings(automationKind);
  syncAutomationForm(automationKind);
  updateAutomationUi();
}

function toggleAutomation(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  applyAutomationForm(automationKind);
  const settings = getAutomation(automationKind);
  settings.enabled = !settings.enabled;
  settings.nextRunAt = settings.enabled ? computeNextRunAt(automationKind) : 0;
  persistAutomationSettings(automationKind);
  updateAutomationUi();
  updateRunStatusPill();
}

function runAutomationQueueNow(kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  if (state.automationRunner.running || (state.status && state.status.currentRun)) return;
  applyAutomationForm(automationKind);
  startAutomationCountdown(getAutomationQueue(automationKind), automationKind);
  updateAutomationUi();
}

function getAutomationMessage(queue, kind = 'game_data') {
  const names = queue
    .map(taskId => state.tasks.find(task => task.id === taskId)?.name || taskId)
    .join(' -> ');
  return `倒计时结束后会运行「${getAutomationConfig(kind).label}」队列：${names}。如不想执行，可以取消本次。`;
}

function closeCountdown() {
  if (state.countdown && state.countdown.timer) window.clearInterval(state.countdown.timer);
  state.countdown = null;
  countdownMask.hidden = true;
}

async function executeCountdownTask() {
  const taskIds = state.countdown && state.countdown.taskIds;
  const kind = state.countdown && state.countdown.kind;
  closeCountdown();
  if (!taskIds || !taskIds.length) return;
  await executeAutomationQueue(taskIds, kind);
}

function startAutomationCountdown(taskIds, kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  const queue = taskIds && taskIds.length ? taskIds : getAutomationQueue(automationKind);
  if (!queue.length || state.countdown) return;
  let seconds = 5;
  countdownTitle.textContent = `即将运行${getAutomationConfig(automationKind).label}队列（${queue.length} 个任务）`;
  countdownMessage.textContent = getAutomationMessage(queue, automationKind);
  countdownNumber.textContent = seconds;
  countdownMask.hidden = false;

  const timer = window.setInterval(() => {
    seconds -= 1;
    countdownNumber.textContent = seconds;
    if (seconds <= 0) executeCountdownTask();
  }, 1000);

  state.countdown = {
    kind: automationKind,
    taskIds: queue,
    timer,
  };
}

function skipCurrentAutomationRun() {
  const kind = state.countdown && state.countdown.kind;
  closeCountdown();
  if (kind) {
    getAutomation(kind).nextRunAt = computeNextRunAt(kind);
    persistAutomationSettings(kind);
  }
  updateAutomationUi();
}

function tickAutomation() {
  if (state.countdown || state.automationRunner.running) return;
  const currentRun = state.status && state.status.currentRun;
  for (const kind of AUTOMATION_KINDS) {
    const settings = getAutomation(kind);
    if (!settings.enabled) continue;
    if (!settings.nextRunAt) {
      settings.nextRunAt = computeNextRunAt(kind);
      persistAutomationSettings(kind);
      updateAutomationUi();
      continue;
    }
    if (Date.now() < settings.nextRunAt) continue;
    if (currentRun) {
      settings.nextRunAt = Date.now() + 5 * 60 * 1000;
      persistAutomationSettings(kind);
      updateAutomationUi();
      continue;
    }
    startAutomationCountdown(getAutomationQueue(kind), kind);
    break;
  }
}

async function executeAutomationQueue(taskIds, kind = 'game_data') {
  const automationKind = getAutomationKind(kind);
  if (state.automationRunner.running) return;
  const queue = taskIds.filter(taskId => state.tasks.some(task => task.id === taskId));
  if (!queue.length) return;

  state.automationRunner = {
    running: true,
    kind: automationKind,
    currentIndex: 0,
    total: queue.length,
  };
  updateAutomationUi();

  try {
    for (let index = 0; index < queue.length; index += 1) {
      state.automationRunner.currentIndex = index;
      updateAutomationUi();
      const run = await runTask(queue[index], { skipConfirm: true });
      if (!run) throw new Error('任务未启动');
      await waitForRunCompletion(run.runId, queue[index]);
    }
    getAutomation(automationKind).nextRunAt = computeNextRunAt(automationKind);
    logTitle.textContent = `${getAutomationConfig(automationKind).label}自动队列 · ${state.env} · 完成`;
  } catch (error) {
    getAutomation(automationKind).enabled = false;
    getAutomation(automationKind).nextRunAt = 0;
    logTitle.textContent = `${getAutomationConfig(automationKind).label}自动队列 · ${state.env} · 已中断`;
    appendDashboardWarning(`${getAutomationConfig(automationKind).label}自动队列已中断：${error.message}`);
  } finally {
    state.automationRunner = {
      running: false,
      kind: '',
      currentIndex: -1,
      total: 0,
    };
    persistAutomationSettings(automationKind);
    updateAutomationUi();
    await loadStatus();
  }
}

function bindAutomation() {
  AUTOMATION_KINDS.forEach(kind => {
    const elements = getAutomationConfig(kind).selectors;
    syncAutomationForm(kind);
    if (!elements.saveBtn) return;
    elements.saveBtn.addEventListener('click', async () => {
      applyAutomationForm(kind);
      await syncAutomationSettingsToServer();
      window.alert(`${getAutomationConfig(kind).label}自动运行设置已保存`);
    });
    elements.addTaskBtn.addEventListener('click', () => addAutomationTask(kind));
    elements.runNowBtn.addEventListener('click', () => runAutomationQueueNow(kind));
    elements.toggleBtn.addEventListener('click', () => toggleAutomation(kind));
    elements.intervalInput.addEventListener('change', () => applyAutomationForm(kind));
    elements.jitterInput.addEventListener('change', () => applyAutomationForm(kind));
  });
  automationCollapseButtons.forEach(button => {
    button.addEventListener('click', () => {
      const kind = getAutomationKind(button.dataset.automationKind);
      const group = document.querySelector(`.automation-group[data-automation-kind="${kind}"]`);
      if (!group) return;
      const collapsed = group.classList.toggle('collapsed');
      button.textContent = collapsed ? '展开' : '收起';
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  });
  updateAutomationUi();
  countdownCancelBtn.addEventListener('click', skipCurrentAutomationRun);
  countdownRunNowBtn.addEventListener('click', executeCountdownTask);
  window.setInterval(() => {
    tickAutomation();
    updateAutomationUi();
    updateRunStatusPill();
  }, 1000);
}

function bindPanelCollapses() {
  panelCollapseButtons.forEach(button => {
    const targetId = button.dataset.collapseTarget;
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      const collapsed = target.classList.contains('collapsed');
      button.textContent = collapsed ? '展开' : '收起';
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    button.addEventListener('click', () => {
      const targetId = button.dataset.collapseTarget;
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      const collapsed = target.classList.toggle('collapsed');
      button.textContent = collapsed ? '展开' : '收起';
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  });
}

function findRunFromStatus(runId, taskId) {
  const status = state.status || {};
  const history = (status.state && status.state.history) || [];
  const fromHistory = history.find(run => run.runId === runId);
  if (fromHistory) return fromHistory;
  const fromRuns = status.state && status.state.runs && status.state.runs[taskId];
  return fromRuns && fromRuns.runId === runId ? fromRuns : null;
}

async function waitForRunCompletion(runId, taskId) {
  while (true) {
    await sleep(2500);
    await loadStatus();
    const currentRun = state.status && state.status.currentRun;
    if (currentRun && currentRun.runId === runId) continue;
    const run = findRunFromStatus(runId, taskId);
    if (!run) continue;
    if (run.status === 'success') return run;
    throw new Error(`任务「${run.taskName || taskId}」${statusText(run)}${run.error ? `：${run.error}` : ''}`);
  }
}

function bindWorkbenchNav() {
  sideNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      sideNavLinks.forEach(item => item.classList.remove('active'));
      link.classList.add('active');
    });
  });

  window.addEventListener(
    'scroll',
    () => {
      const visible = sideNavLinks
        .map(link => {
          const section = document.querySelector(link.getAttribute('href'));
          if (!section) return null;
          return {
            link,
            top: Math.abs(section.getBoundingClientRect().top - 32),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.top - b.top)[0];
      if (!visible) return;
      sideNavLinks.forEach(item => item.classList.toggle('active', item === visible.link));
    },
    { passive: true }
  );
}

function bindEnvSwitch() {
  document.querySelectorAll('.env-btn').forEach(button => {
    button.addEventListener('click', async () => {
      state.env = button.dataset.env;
      document.querySelectorAll('.env-btn').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      await loadStatus();
    });
  });
}

async function boot() {
  bindEnvSwitch();
  bindWorkbenchNav();
  bindPanelCollapses();
  bindDifyPanel();
  bindHistory();
  await loadTasks();
  await loadAutomationSettings();
  bindAutomation();
  refreshBtn.addEventListener('click', () => {
    loadStatus();
    loadDifyStatus(true);
  });
  surveyToggleBtn.addEventListener('click', toggleFeatureSurvey);
  stopBtn.addEventListener('click', stopCurrentTask);
  pillStopBtn?.addEventListener('click', stopCurrentTask);
  pillLogBtn?.addEventListener('click', () => {
    const currentRun = state.status && state.status.currentRun;
    if (currentRun) {
      viewRunLog(currentRun);
    } else {
      const logsSection = document.querySelector('#logs');
      if (logsSection) logsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  scrollLogBottomBtn.addEventListener('click', scrollLogToBottom);
  logOutput.addEventListener('scroll', handleLogScroll);
  researchPillarFilter?.addEventListener('change', renderContentResearchBoard);
  researchGameFilter?.addEventListener('change', renderContentResearchBoard);
  updateLogFollowUi();
  await loadStatus();
  await loadDifyStatus(true);
  window.setInterval(loadStatus, 2500);
}

boot().catch(error => {
  console.error(error);
  logOutput.textContent = error.message;
});
