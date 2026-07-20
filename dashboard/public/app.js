const state = {
  env: 'release',
  tasks: [],
  status: null,
  activeRunId: '',
  logAutoFollow: true,
  automation: {
    enabled: false,
    taskId: 'daily_publish',
    intervalMinutes: 120,
    jitterMinutes: 10,
    nextRunAt: 0,
  },
  countdown: null,
};

const LOG_BOTTOM_THRESHOLD = 32;
const AUTOMATION_STORAGE_KEY = 'p2-dashboard-automation-v1';
const taskGrid = document.querySelector('#taskGrid');
const summaryEl = document.querySelector('#summary');
const logOutput = document.querySelector('#logOutput');
const logTitle = document.querySelector('#logTitle');
const logFollowStatus = document.querySelector('#logFollowStatus');
const scrollLogBottomBtn = document.querySelector('#scrollLogBottomBtn');
const refreshBtn = document.querySelector('#refreshBtn');
const stopBtn = document.querySelector('#stopBtn');
const automationTaskSelect = document.querySelector('#automationTaskSelect');
const automationIntervalInput = document.querySelector('#automationIntervalInput');
const automationJitterInput = document.querySelector('#automationJitterInput');
const automationSaveBtn = document.querySelector('#automationSaveBtn');
const automationToggleBtn = document.querySelector('#automationToggleBtn');
const automationStatusText = document.querySelector('#automationStatusText');
const automationNextText = document.querySelector('#automationNextText');
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

function statusClass(run) {
  if (!run) return '';
  return `status-${run.status}`;
}

async function requestJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `请求失败: ${res.status}`);
  return data;
}

function renderSummary(summary) {
  const keyFiles = summary.keyFiles || {};
  const cards = [
    {
      label: '环境',
      value: summary.environment,
      note: summary.exists ? summary.dataDir : '数据目录不存在',
    },
    {
      label: '输出文件',
      value: summary.fileCount,
      note: 'translated-data 文件数量',
    },
    {
      label: '天梯',
      value: `${summary.ladder.players}`,
      note: `${summary.ladder.classes} 个职业 · ${summary.ladder.updateTime || '无更新时间'}`,
    },
    {
      label: '天梯分析',
      value: summary.ladderAnalysis.classes,
      note: summary.ladderAnalysis.file ? formatTime(summary.ladderAnalysis.file.updatedAt) : '无文件',
    },
    {
      label: '查 BD 索引',
      value: `${summary.ladderBuildIndex.skills} / ${summary.ladderBuildIndex.equipment}`,
      note: summary.ladderBuildIndex.file
        ? `技能 / 传奇装备 · ${formatTime(summary.ladderBuildIndex.file.updatedAt)}`
        : '无索引文件',
    },
    {
      label: '经济摘要',
      value: summary.economy?.items || keyFiles.economyDigest?.count || 0,
      note: summary.economy?.updatedAt
        ? `poe.ninja ${formatTime(summary.economy.updatedAt)}`
        : keyFiles.economyDigest?.updatedAt
          ? formatTime(keyFiles.economyDigest.updatedAt)
          : '无经济摘要',
    },
    {
      label: '国服行情',
      value: summary.economy?.cnMarketItems || keyFiles.cnMarketDigest?.count || 0,
      note: keyFiles.cnMarketDigest?.updatedAt
        ? `DD373 更新 ${formatTime(keyFiles.cnMarketDigest.updatedAt)}`
        : '无 DD373 行情',
    },
    {
      label: '流放急救箱',
      value: keyFiles.problemGuides?.count || 0,
      note: keyFiles.problemGuides?.updatedAt ? formatTime(keyFiles.problemGuides.updatedAt) : '无文件',
    },
  ];

  summaryEl.innerHTML = cards
    .map(
      card => `
        <article class="stat-card">
          <span class="stat-label">${card.label}</span>
          <span class="stat-value">${card.value}</span>
          <span class="stat-note">${card.note}</span>
        </article>
      `
    )
    .join('');
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
      id: 'recommended',
      title: '一键更新',
      description: '只保留当前最常用流程。底层脚本不单独展示，流程会按顺序执行并上传 OSS。',
    },
    {
      id: 'content_research',
      title: '内容研究',
      description: '为自媒体发现玩家问题和高讨论话题。结果只保存在本地选题素材，不会上传 OSS 或改变小程序数据。',
    },
  ];

  const forumSummary = state.status && state.status.forumResearch;
  const forumTaskMeta = task => {
    if (task.id !== 'forum_content_scan') return '';
    if (!forumSummary) return '论坛选题池尚未通过 Dashboard 运行';
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
      return `
        <article class="task-card ${isFlow ? 'flow' : ''} ${task.dangerous ? 'dangerous' : ''}">
          <div class="task-title-row">
            <span class="task-title">${task.name}</span>
            <span class="task-badges">
              ${isFlow ? '<span class="badge">流程</span>' : ''}
              ${task.dangerous ? '<span class="badge danger-badge">谨慎</span>' : ''}
            </span>
          </div>
          <p class="task-desc">${task.description}</p>
          <div class="task-meta">
            状态：<span class="${statusClass(run)}">${statusText(run)}</span><br />
            上次：${run ? formatTime(run.finishedAt || run.startedAt) : '无记录'}
            ${run && run.durationMs ? ` · ${formatDuration(run.durationMs)}` : ''}
            ${forumTaskMeta(task) ? `<br />${forumTaskMeta(task)}` : ''}
          </div>
          <button class="run-btn" data-task-id="${task.id}" ${disabled ? 'disabled' : ''}>
            ${currentRun && currentRun.taskId === task.id ? '运行中...' : '运行'}
          </button>
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
}

async function loadTasks() {
  const data = await requestJson('/api/tasks');
  state.tasks = data.tasks;
  renderAutomationTaskOptions();
  renderTasks();
}

async function loadStatus() {
  const data = await requestJson(`/api/status?env=${state.env}`);
  state.status = data;
  renderSummary(data.summary);
  renderSurveyControl(data.summary);
  renderTasks();
  stopBtn.disabled = !data.currentRun;

  const currentRun = data.currentRun;
  if (currentRun) {
    state.activeRunId = currentRun.runId;
    logTitle.textContent = `${currentRun.taskName} · ${currentRun.environment} · ${statusText(currentRun)}`;
    await loadLog(currentRun.runId);
  } else if (state.activeRunId) {
    await loadLog(state.activeRunId);
  }
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
    state.logAutoFollow = true;
    updateLogFollowUi();
    logTitle.textContent = `${data.run.taskName} · ${data.run.environment} · 启动中`;
    logOutput.textContent = '任务已启动，等待日志输出...';
    await loadStatus();
  } catch (error) {
    window.alert(error.message);
  }
}

function loadAutomationSettings() {
  try {
    const raw = window.localStorage.getItem(AUTOMATION_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.automation = {
      ...state.automation,
      ...saved,
      intervalMinutes: clampNumber(saved.intervalMinutes, 10, 120),
      jitterMinutes: clampNumber(saved.jitterMinutes, 0, 10),
      nextRunAt: Number(saved.nextRunAt) || 0,
    };
  } catch (error) {
    console.warn('读取自动运行设置失败:', error);
  }
}

function saveAutomationSettings() {
  window.localStorage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(state.automation));
}

function renderAutomationTaskOptions() {
  if (!automationTaskSelect) return;
  const schedulableTasks = state.tasks.filter(task => !task.localOnly);
  automationTaskSelect.innerHTML = schedulableTasks
    .map(task => `<option value="${task.id}">${task.name}</option>`)
    .join('');
  if (schedulableTasks.some(task => task.id === state.automation.taskId)) {
    automationTaskSelect.value = state.automation.taskId;
  } else if (schedulableTasks[0]) {
    state.automation.taskId = schedulableTasks[0].id;
    automationTaskSelect.value = state.automation.taskId;
  }
}

function getAutomationTask() {
  return state.tasks.find(task => task.id === state.automation.taskId);
}

function computeNextRunAt(from = Date.now()) {
  const intervalMs = state.automation.intervalMinutes * 60 * 1000;
  const jitterMs = state.automation.jitterMinutes * 60 * 1000;
  const offset = jitterMs ? Math.round((Math.random() * 2 - 1) * jitterMs) : 0;
  return from + Math.max(10 * 60 * 1000, intervalMs + offset);
}

function syncAutomationForm() {
  if (!automationTaskSelect) return;
  automationTaskSelect.value = state.automation.taskId;
  automationIntervalInput.value = state.automation.intervalMinutes;
  automationJitterInput.value = state.automation.jitterMinutes;
}

function updateAutomationUi() {
  const task = getAutomationTask();
  automationToggleBtn.textContent = state.automation.enabled ? '关闭自动运行' : '开启自动运行';
  automationToggleBtn.classList.toggle('active', state.automation.enabled);
  automationStatusText.textContent = state.automation.enabled
    ? `已开启：${task ? task.name : state.automation.taskId}`
    : '未开启';
  automationNextText.textContent = state.automation.enabled
    ? `下次：${formatDateTime(state.automation.nextRunAt)}`
    : '下次：-';
}

function applyAutomationForm() {
  state.automation.taskId = automationTaskSelect.value || state.automation.taskId;
  state.automation.intervalMinutes = clampNumber(automationIntervalInput.value, 10, 120);
  state.automation.jitterMinutes = clampNumber(automationJitterInput.value, 0, 10);
  if (state.automation.enabled) state.automation.nextRunAt = computeNextRunAt();
  saveAutomationSettings();
  syncAutomationForm();
  updateAutomationUi();
}

function toggleAutomation() {
  applyAutomationForm();
  state.automation.enabled = !state.automation.enabled;
  state.automation.nextRunAt = state.automation.enabled ? computeNextRunAt() : 0;
  saveAutomationSettings();
  updateAutomationUi();
}

function getAutomationMessage(task) {
  return '倒计时结束后会自动运行该任务；如不想执行，可以取消本次。';
}

function closeCountdown() {
  if (state.countdown && state.countdown.timer) window.clearInterval(state.countdown.timer);
  state.countdown = null;
  countdownMask.hidden = true;
}

async function executeCountdownTask() {
  const taskId = state.countdown && state.countdown.taskId;
  closeCountdown();
  if (!taskId) return;
  await runTask(taskId, { skipConfirm: true });
  state.automation.nextRunAt = computeNextRunAt();
  saveAutomationSettings();
  updateAutomationUi();
}

function startAutomationCountdown(task) {
  if (!task || state.countdown) return;
  let seconds = 5;
  countdownTitle.textContent = `即将运行：${task.name}`;
  countdownMessage.textContent = getAutomationMessage(task);
  countdownNumber.textContent = seconds;
  countdownMask.hidden = false;

  const timer = window.setInterval(() => {
    seconds -= 1;
    countdownNumber.textContent = seconds;
    if (seconds <= 0) executeCountdownTask();
  }, 1000);

  state.countdown = {
    taskId: task.id,
    timer,
  };
}

function skipCurrentAutomationRun() {
  closeCountdown();
  state.automation.nextRunAt = computeNextRunAt();
  saveAutomationSettings();
  updateAutomationUi();
}

function tickAutomation() {
  if (!state.automation.enabled) return;
  if (state.countdown) return;
  if (!state.automation.nextRunAt) {
    state.automation.nextRunAt = computeNextRunAt();
    saveAutomationSettings();
    updateAutomationUi();
    return;
  }
  if (Date.now() < state.automation.nextRunAt) return;

  const currentRun = state.status && state.status.currentRun;
  if (currentRun) {
    state.automation.nextRunAt = Date.now() + 5 * 60 * 1000;
    saveAutomationSettings();
    updateAutomationUi();
    return;
  }

  startAutomationCountdown(getAutomationTask());
}

function bindAutomation() {
  loadAutomationSettings();
  syncAutomationForm();
  updateAutomationUi();
  automationSaveBtn.addEventListener('click', () => {
    applyAutomationForm();
    window.alert('自动运行设置已保存');
  });
  automationToggleBtn.addEventListener('click', toggleAutomation);
  countdownCancelBtn.addEventListener('click', skipCurrentAutomationRun);
  countdownRunNowBtn.addEventListener('click', executeCountdownTask);
  window.setInterval(() => {
    tickAutomation();
    updateAutomationUi();
  }, 1000);
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
  bindAutomation();
  refreshBtn.addEventListener('click', loadStatus);
  surveyToggleBtn.addEventListener('click', toggleFeatureSurvey);
  stopBtn.addEventListener('click', stopCurrentTask);
  scrollLogBottomBtn.addEventListener('click', scrollLogToBottom);
  logOutput.addEventListener('scroll', handleLogScroll);
  updateLogFollowUi();
  await loadTasks();
  await loadStatus();
  window.setInterval(loadStatus, 2500);
}

boot().catch(error => {
  console.error(error);
  logOutput.textContent = error.message;
});
