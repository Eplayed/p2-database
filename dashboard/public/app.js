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
  },
  automationRunner: {
    running: false,
    kind: '',
    currentIndex: -1,
    total: 0,
  },
  countdown: null,
  kanban: {
    statuses: [],
    tasks: [],
    composingStatus: '',
    editingTaskId: '',
    expandedTaskIds: new Set(),
    collapsedColumns: new Set(JSON.parse(localStorage.getItem('p2-kanban-collapsed') || '[]')),
  },
};

const LOG_BOTTOM_THRESHOLD = 32;
const AUTOMATION_STORAGE_KEY = 'p2-dashboard-automation-v2';
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
      description: '为自媒体和小程序策略发现玩家问题、海外趋势和可写选题。结果只保存在本地，不上传 OSS。自媒体发文已迁至 media-workbench。',
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

// ── 任务看板 ─────────────────────────────────────────────
// 数据在服务端 runtime/kanban-tasks.json（GET/POST/PATCH/DELETE /api/kanban*）。
// 列状态、composing/editing 属于界面临时态，存 state.kanban，刷新即清。

const kanbanBoard = document.querySelector('#kanbanBoard');
const kanbanAddBtn = document.querySelector('#kanbanAddBtn');
const kanbanNavDot = document.querySelector('#kanbanNavDot');

async function loadKanban() {
  try {
    const data = await requestJson('/api/kanban');
    state.kanban.statuses = data.statuses || [];
    state.kanban.tasks = data.tasks || [];
    renderKanban();
  } catch (error) {
    if (kanbanBoard) kanbanBoard.innerHTML = `<p class="kanban-empty">看板加载失败：${escapeHtml(error.message)}</p>`;
  }
}

function kanbanColumns() {
  return state.kanban.statuses.map(status => ({
    ...status,
    tasks: state.kanban.tasks
      .filter(task => task.status === status.key)
      .sort((a, b) => a.order - b.order),
  }));
}

function renderKanban() {
  if (!kanbanBoard) return;
  kanbanBoard.innerHTML = kanbanColumns().map(column => `
    <div class="kanban-column${state.kanban.collapsedColumns.has(column.key) ? ' is-collapsed' : ''}" data-status="${column.key}">
      <div class="kanban-column-head">
        <button class="kanban-icon-btn kanban-column-toggle" data-toggle-column="${column.key}" type="button" title="展开/收起该列">${state.kanban.collapsedColumns.has(column.key) ? '▸' : '▾'}</button>
        <span class="kanban-column-title">${escapeHtml(column.label)}</span>
        <em class="kanban-count">${column.tasks.length}</em>
        <button class="kanban-icon-btn kanban-column-add" data-add-status="${column.key}" type="button" title="在此列新建任务">+</button>
      </div>
      <div class="kanban-card-list" data-status="${column.key}">
        ${state.kanban.composingStatus === column.key ? renderKanbanComposer(column.key) : ''}
        ${column.tasks.map(task => renderKanbanCard(task)).join('') || (state.kanban.composingStatus === column.key ? '' : '<p class="kanban-empty">拖卡片到这里</p>')}
      </div>
    </div>
  `).join('');
  if (kanbanNavDot) kanbanNavDot.hidden = !state.kanban.tasks.some(task => task.status === 'doing');
  const composer = kanbanBoard.querySelector('.kanban-composer input[name="title"]');
  if (composer) composer.focus();
}

function renderKanbanCard(task) {
  if (state.kanban.editingTaskId === task.id) return renderKanbanEditor(task);
  return `
    <article class="kanban-card" draggable="true" data-task-id="${task.id}">
      <div class="kanban-card-head">
        <span class="kanban-card-title">${escapeHtml(task.title)}</span>
        <span class="kanban-card-actions">
          <button class="kanban-icon-btn" data-edit="${task.id}" type="button" title="编辑">改</button>
          <button class="kanban-icon-btn kanban-danger" data-delete="${task.id}" type="button" title="删除">删</button>
        </span>
      </div>
      ${task.detail ? `<p class="kanban-card-detail${state.kanban.expandedTaskIds.has(task.id) ? ' is-expanded' : ''}" data-toggle-detail="${task.id}" title="点击展开/收起">${escapeHtml(task.detail)}</p>` : ''}
      <time class="kanban-card-time" datetime="${task.updatedAt}">${formatTime(task.updatedAt)}</time>
    </article>
  `;
}

function renderKanbanComposer(status) {
  return `
    <form class="kanban-composer" data-compose-status="${status}">
      <input class="kanban-input" name="title" maxlength="200" placeholder="任务标题（必填）" required />
      <textarea class="kanban-textarea" name="detail" rows="2" maxlength="2000" placeholder="补充说明（可选）：背景、下一步、验收标准"></textarea>
      <div class="kanban-composer-actions">
        <button class="ghost-btn" type="submit">保存</button>
        <button class="ghost-btn" type="button" data-cancel-compose="1">取消</button>
      </div>
    </form>
  `;
}

function renderKanbanEditor(task) {
  return `
    <form class="kanban-composer" data-edit-task-id="${task.id}">
      <input class="kanban-input" name="title" maxlength="200" value="${escapeHtml(task.title)}" required />
      <textarea class="kanban-textarea" name="detail" rows="2" maxlength="2000">${escapeHtml(task.detail || '')}</textarea>
      <div class="kanban-composer-actions">
        <button class="ghost-btn" type="submit">保存</button>
        <button class="ghost-btn" type="button" data-cancel-edit="1">取消</button>
      </div>
    </form>
  `;
}

// 计算落点索引：拖拽卡片相对各卡片中点的位置（排除自身，避免同列移动时把自己算进去）
function computeKanbanDropIndex(list, clientY, taskId) {
  const cards = [...list.querySelectorAll('.kanban-card')].filter(card => card.dataset.taskId !== taskId);
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return cards.length;
}

async function moveKanbanTaskUi(taskId, status, index) {
  const task = state.kanban.tasks.find(item => item.id === taskId);
  if (!task) return;
  // 乐观更新：本地先按目标列重排，失败再回源重载
  const columnTasks = state.kanban.tasks
    .filter(item => item.status === status && item.id !== taskId)
    .sort((a, b) => a.order - b.order);
  const clamped = Math.max(0, Math.min(index, columnTasks.length));
  columnTasks.splice(clamped, 0, task);
  task.status = status;
  columnTasks.forEach((item, order) => { item.order = order; });
  renderKanban();
  try {
    await requestJson(`/api/kanban/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, index: clamped }),
    });
  } catch (error) {
    window.alert(`移动失败：${error.message}`);
    await loadKanban();
  }
}

async function saveKanbanComposer(form) {
  const status = form.dataset.composeStatus;
  const title = form.elements.title.value.trim();
  if (!title) return;
  try {
    await requestJson('/api/kanban/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, detail: form.elements.detail.value.trim(), status }),
    });
    state.kanban.composingStatus = '';
    await loadKanban();
  } catch (error) {
    window.alert(`保存失败：${error.message}`);
  }
}

async function saveKanbanEditor(form) {
  const taskId = form.dataset.editTaskId;
  const title = form.elements.title.value.trim();
  if (!title) return;
  try {
    await requestJson(`/api/kanban/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, detail: form.elements.detail.value.trim() }),
    });
    state.kanban.editingTaskId = '';
    await loadKanban();
  } catch (error) {
    window.alert(`保存失败：${error.message}`);
  }
}

async function deleteKanbanTask(taskId) {
  const task = state.kanban.tasks.find(item => item.id === taskId);
  if (!task) return;
  if (!window.confirm(`删除任务「${task.title}」？`)) return;
  try {
    await requestJson(`/api/kanban/tasks/${taskId}`, { method: 'DELETE' });
    state.kanban.tasks = state.kanban.tasks.filter(item => item.id !== taskId);
    renderKanban();
  } catch (error) {
    window.alert(`删除失败：${error.message}`);
  }
}

function bindKanban() {
  if (!kanbanBoard) return;

  kanbanAddBtn?.addEventListener('click', () => {
    state.kanban.composingStatus = 'todo';
    state.kanban.editingTaskId = '';
    renderKanban();
  });

  kanbanBoard.addEventListener('click', event => {
    const columnToggle = event.target.closest('[data-toggle-column]');
    if (columnToggle) {
      const key = columnToggle.dataset.toggleColumn;
      if (state.kanban.collapsedColumns.has(key)) {
        state.kanban.collapsedColumns.delete(key);
      } else {
        state.kanban.collapsedColumns.add(key);
      }
      localStorage.setItem('p2-kanban-collapsed', JSON.stringify([...state.kanban.collapsedColumns]));
      renderKanban();
      return;
    }
    const detailToggle = event.target.closest('[data-toggle-detail]');
    if (detailToggle) {
      const taskId = detailToggle.dataset.toggleDetail;
      if (state.kanban.expandedTaskIds.has(taskId)) {
        state.kanban.expandedTaskIds.delete(taskId);
      } else {
        state.kanban.expandedTaskIds.add(taskId);
      }
      renderKanban();
      return;
    }
    const addButton = event.target.closest('[data-add-status]');
    if (addButton) {
      state.kanban.composingStatus = addButton.dataset.addStatus;
      state.kanban.editingTaskId = '';
      renderKanban();
      return;
    }
    if (event.target.closest('[data-cancel-compose]')) {
      state.kanban.composingStatus = '';
      renderKanban();
      return;
    }
    if (event.target.closest('[data-cancel-edit]')) {
      state.kanban.editingTaskId = '';
      renderKanban();
      return;
    }
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
      state.kanban.editingTaskId = editButton.dataset.edit;
      state.kanban.composingStatus = '';
      renderKanban();
      return;
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      deleteKanbanTask(deleteButton.dataset.delete);
    }
  });

  kanbanBoard.addEventListener('submit', event => {
    const form = event.target.closest('form.kanban-composer');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.composeStatus) saveKanbanComposer(form);
    else if (form.dataset.editTaskId) saveKanbanEditor(form);
  });

  // 拖拽换状态/排序：原生 HTML5 DnD，委托到看板容器
  kanbanBoard.addEventListener('dragstart', event => {
    const card = event.target.closest('.kanban-card');
    if (!card) return;
    event.dataTransfer.setData('text/plain', card.dataset.taskId);
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  });

  kanbanBoard.addEventListener('dragend', () => {
    kanbanBoard.querySelectorAll('.kanban-card.is-dragging').forEach(card => card.classList.remove('is-dragging'));
    kanbanBoard.querySelectorAll('.kanban-column.is-drag-over').forEach(column => column.classList.remove('is-drag-over'));
  });

  kanbanBoard.addEventListener('dragover', event => {
    const list = event.target.closest('.kanban-card-list');
    if (!list) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    kanbanBoard.querySelectorAll('.kanban-column.is-drag-over').forEach(column => {
      if (column.dataset.status !== list.dataset.status) column.classList.remove('is-drag-over');
    });
    list.closest('.kanban-column').classList.add('is-drag-over');
  });

  kanbanBoard.addEventListener('drop', event => {
    const list = event.target.closest('.kanban-card-list');
    if (!list) return;
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const index = computeKanbanDropIndex(list, event.clientY, taskId);
    moveKanbanTaskUi(taskId, list.dataset.status, index);
  });
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
      ${
        candidate.url
          ? `<div class="research-candidate-actions"><a class="research-candidate-source" href="${escapeHtml(candidate.url)}" target="_blank" rel="noreferrer">看来源</a></div>`
          : ''
      }
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
          <p>按头条号、公众号、小红书各自赛道筛出来。发文生成在 media-workbench（端口 5180）操作，这里只做候选池观察与排序。</p>
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
}

async function loadTasks() {
  const data = await requestJson('/api/tasks');
  state.tasks = data.tasks;
  renderAutomationTaskOptions('game_data');
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

const AUTOMATION_KINDS = ['game_data'];
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
};

function getAutomationKind(kind) {
  return AUTOMATION_KINDS.includes(kind) ? kind : 'game_data';
}

function normalizeAutomationInterval(value, kind = 'game_data', fallback = 120) {
  return clampNumber(value, 10, fallback);
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
    intervalMinutes: 120,
    jitterMinutes: 10,
    nextRunAt: 0,
    updatedAt: 0,
  };
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
  return state.tasks.filter(task => task.id && task.group === automationKind);
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
      const taskType = task.localOnly
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
  bindKanban();
  bindHistory();
  await loadKanban();
  await loadTasks();
  await loadAutomationSettings();
  bindAutomation();
  refreshBtn.addEventListener('click', () => {
    loadStatus();
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
  window.setInterval(loadStatus, 2500);
}

boot().catch(error => {
  console.error(error);
  logOutput.textContent = error.message;
});
