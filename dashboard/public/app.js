const state = {
  env: 'release',
  tasks: [],
  status: null,
  activeRunId: '',
};

const taskGrid = document.querySelector('#taskGrid');
const summaryEl = document.querySelector('#summary');
const logOutput = document.querySelector('#logOutput');
const logTitle = document.querySelector('#logTitle');
const refreshBtn = document.querySelector('#refreshBtn');
const stopBtn = document.querySelector('#stopBtn');

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

function statusText(run) {
  if (!run) return '未运行';
  if (run.status === 'success') return '成功';
  if (run.status === 'failed') return '失败';
  if (run.status === 'running') return '运行中';
  if (run.status === 'stopping') return '停止中';
  if (run.status === 'stopped') return '已停止';
  return run.status || '未知';
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
      label: '新闻 / 开荒',
      value: `${keyFiles.news?.count || 0} / ${keyFiles.starters?.count || 0}`,
      note: `新闻条数 / 开荒 BD 条数`,
    },
    {
      label: '社区 BD',
      value: keyFiles.community?.count || 0,
      note: keyFiles.community?.updatedAt ? formatTime(keyFiles.community.updatedAt) : '无文件',
    },
    {
      label: '天梯分析',
      value: summary.ladderAnalysis.classes,
      note: summary.ladderAnalysis.file ? formatTime(summary.ladderAnalysis.file.updatedAt) : '无文件',
    },
    {
      label: '0.5 资料',
      value: summary.patch05.entries,
      note: summary.patch05.file ? formatTime(summary.patch05.file.updatedAt) : '无文件',
    },
    {
      label: '调研配置',
      value: keyFiles.surveyConfig ? '已配置' : '无',
      note: keyFiles.surveyConfig ? formatTime(keyFiles.surveyConfig.updatedAt) : 'miniprogram_config',
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

function renderTasks() {
  const currentRun = state.status && state.status.currentRun;
  const runs = (state.status && state.status.state && state.status.state.runs) || {};
  const disabled = Boolean(currentRun);

  taskGrid.innerHTML = state.tasks
    .map(task => {
      const run = runs[task.id];
      const isFlow = Array.isArray(task.steps);
      return `
        <article class="task-card ${isFlow ? 'flow' : ''}">
          <div class="task-title-row">
            <span class="task-title">${task.name}</span>
            ${isFlow ? '<span class="badge">流程</span>' : ''}
          </div>
          <p class="task-desc">${task.description}</p>
          <div class="task-meta">
            状态：<span class="${statusClass(run)}">${statusText(run)}</span><br />
            上次：${run ? formatTime(run.finishedAt || run.startedAt) : '无记录'}
            ${run && run.durationMs ? ` · ${formatDuration(run.durationMs)}` : ''}
          </div>
          <button class="run-btn" data-task-id="${task.id}" ${disabled ? 'disabled' : ''}>
            ${currentRun && currentRun.taskId === task.id ? '运行中...' : '运行'}
          </button>
        </article>
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
  renderTasks();
}

async function loadStatus() {
  const data = await requestJson(`/api/status?env=${state.env}`);
  state.status = data;
  renderSummary(data.summary);
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
    logOutput.textContent = text || '暂无日志';
    logOutput.scrollTop = logOutput.scrollHeight;
  } catch (error) {
    logOutput.textContent = error.message;
  }
}

async function runTask(taskId) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  if (!window.confirm(`在 ${state.env} 环境运行「${task.name}」？`)) return;

  try {
    const data = await requestJson('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, environment: state.env }),
    });
    state.activeRunId = data.run.runId;
    logTitle.textContent = `${data.run.taskName} · ${data.run.environment} · 启动中`;
    logOutput.textContent = '任务已启动，等待日志输出...';
    await loadStatus();
  } catch (error) {
    window.alert(error.message);
  }
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
  refreshBtn.addEventListener('click', loadStatus);
  stopBtn.addEventListener('click', stopCurrentTask);
  await loadTasks();
  await loadStatus();
  window.setInterval(loadStatus, 2500);
}

boot().catch(error => {
  console.error(error);
  logOutput.textContent = error.message;
});
