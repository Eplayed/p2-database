const state = {
  env: 'release',
  tasks: [],
  status: null,
  activeRunId: '',
  logAutoFollow: true,
  automation: {
    enabled: false,
    taskId: 'daily_publish',
    taskIds: ['daily_publish'],
    intervalMinutes: 120,
    jitterMinutes: 10,
    nextRunAt: 0,
  },
  automationRunner: {
    running: false,
    currentIndex: -1,
    total: 0,
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
const automationAddTaskBtn = document.querySelector('#automationAddTaskBtn');
const automationQueueList = document.querySelector('#automationQueueList');
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
const contentResearchBoard = document.querySelector('#contentResearchBoard');
const researchPillarFilter = document.querySelector('#researchPillarFilter');
const researchGameFilter = document.querySelector('#researchGameFilter');
const sideNavLinks = [...document.querySelectorAll('.side-nav-link')];

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
      description: '为自媒体和小程序策略发现玩家问题、海外趋势和可写选题。结果只保存在本地，不上传 OSS。',
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

function getTopicPillar(topic) {
  return topic?.signals?.miniappPage || topic?.miniappPage || '内容观察';
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
  const labels = {
    poe1: 'POE1',
    poe2: 'POE2',
    d4: '暗黑破坏神',
    wow: '魔兽世界',
  };
  return labels[game] || String(game || '-').toUpperCase();
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
          <span>${escapeHtml(item.miniappPage || '内容观察')}</span>
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
      <span>${escapeHtml(topic.miniappPage || '内容观察')}</span>
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
  const filteredTopics = topics
    .filter(topic => selectedPillar === 'all' || getTopicPillar(topic) === selectedPillar)
    .filter(topic => selectedGame === 'all' || topic.game === selectedGame)
    .slice(0, 16);
  const pillars = ['抄BD', '看行情', '解卡点', '新闻资讯', '热点信息', '内容观察'];
  const byPillar = research.byMiniappPage || {};
  const counters = research.counters || {};
  const trend = research.trend || {};

  contentResearchBoard.className = 'content-research-board';
  contentResearchBoard.innerHTML = `
    <div class="research-overview">
      <div>
        <span class="stat-label">生成时间</span>
        <strong>${formatTime(research.generatedAt)}</strong>
      </div>
      <div>
        <span class="stat-label">选题</span>
        <strong>${counters.topics || topics.length || 0}</strong>
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
    <section class="research-section">
      <div class="research-section-head">
        <h3>今天优先写</h3>
        <span>先从高分、可写成文章或能承接小程序入口的选题开始</span>
      </div>
      <div class="research-action-grid">
        ${actionItems.slice(0, 8).map(renderActionItem).join('') || '<p class="content-research-empty">暂无优先选题</p>'}
      </div>
    </section>
    <section class="research-section">
      <div class="research-section-head">
        <h3>内容方向</h3>
        <span>工具入口与自媒体选题一起看</span>
      </div>
      <div class="research-pillar-grid">
        ${pillars.map(pillar => renderResearchPillarCard(pillar, byPillar[pillar] || [])).join('')}
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
  renderAutomationTaskOptions();
  renderTasks();
}

async function loadStatus() {
  const data = await requestJson(`/api/status?env=${state.env}`);
  state.status = data;
  renderSummary(data.summary);
  renderSurveyControl(data.summary);
  renderTasks();
  renderContentResearchBoard();
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
    return data.run;
  } catch (error) {
    window.alert(error.message);
    throw error;
  }
  return null;
}

function normalizeAutomationSettingsInput(saved) {
  if (!saved || typeof saved !== 'object') return null;
  return {
    ...state.automation,
    ...saved,
    taskIds: normalizeAutomationTaskIds(saved.taskIds || (saved.taskId ? [saved.taskId] : [])),
    intervalMinutes: clampNumber(saved.intervalMinutes, 10, 120),
    jitterMinutes: clampNumber(saved.jitterMinutes, 0, 10),
    nextRunAt: Number(saved.nextRunAt) || 0,
    updatedAt: Number(saved.updatedAt) || 0,
  };
}

async function loadAutomationSettings() {
  let localSettings = null;
  let serverSettings = null;
  try {
    const raw = window.localStorage.getItem(AUTOMATION_STORAGE_KEY);
    if (raw) localSettings = normalizeAutomationSettingsInput(JSON.parse(raw));
  } catch (error) {
    console.warn('读取自动运行设置失败:', error);
  }

  try {
    const data = await requestJson('/api/automation-settings');
    serverSettings = normalizeAutomationSettingsInput(data.automation);
  } catch (error) {
    console.warn('读取服务端自动运行设置失败:', error);
  }

  const localUpdatedAt = Number(localSettings?.updatedAt || 0);
  const serverUpdatedAt = Number(serverSettings?.updatedAt || 0);
  const nextSettings = serverUpdatedAt > localUpdatedAt ? serverSettings : localSettings || serverSettings;
  if (nextSettings) {
    state.automation = nextSettings;
    saveAutomationSettings();
  }
}

function saveAutomationSettings() {
  state.automation.updatedAt = Date.now();
  window.localStorage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(state.automation));
}

async function syncAutomationSettingsToServer() {
  try {
    const data = await requestJson('/api/automation-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ automation: state.automation }),
    });
    if (data.automation) {
      state.automation = normalizeAutomationSettingsInput(data.automation) || state.automation;
      window.localStorage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(state.automation));
    }
  } catch (error) {
    console.warn('同步自动运行设置失败:', error);
  }
}

function persistAutomationSettings() {
  saveAutomationSettings();
  syncAutomationSettingsToServer();
}

function getSchedulableTasks() {
  return state.tasks.filter(task => task.id);
}

function normalizeAutomationTaskIds(taskIds) {
  const ids = Array.isArray(taskIds) ? taskIds : [];
  const seen = new Set();
  const normalized = ids
    .map(id => String(id || ''))
    .filter(Boolean)
    .filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  return normalized.length ? normalized : ['daily_publish'];
}

function getAutomationQueue() {
  const availableIds = new Set(getSchedulableTasks().map(task => task.id));
  const queue = normalizeAutomationTaskIds(state.automation.taskIds).filter(taskId => availableIds.has(taskId));
  if (!queue.length && getSchedulableTasks()[0]) queue.push(getSchedulableTasks()[0].id);
  state.automation.taskIds = queue;
  state.automation.taskId = queue[0] || state.automation.taskId;
  return queue;
}

function renderAutomationTaskOptions() {
  if (!automationTaskSelect) return;
  const schedulableTasks = getSchedulableTasks();
  automationTaskSelect.innerHTML = schedulableTasks
    .map(task => `<option value="${task.id}">${task.name}</option>`)
    .join('');
  getAutomationQueue();
  if (schedulableTasks.some(task => task.id === state.automation.taskId)) {
    automationTaskSelect.value = state.automation.taskId;
  } else if (schedulableTasks[0]) {
    state.automation.taskId = schedulableTasks[0].id;
    automationTaskSelect.value = state.automation.taskId;
  }
  renderAutomationQueue();
}

function getAutomationTask() {
  return state.tasks.find(task => task.id === state.automation.taskId);
}

function renderAutomationQueue() {
  if (!automationQueueList) return;
  const queue = getAutomationQueue();
  const currentRun = state.status && state.status.currentRun;
  const disabled = state.automationRunner.running || Boolean(currentRun);
  automationQueueList.innerHTML =
    queue
      .map((taskId, index) => {
        const task = state.tasks.find(item => item.id === taskId);
        if (!task) return '';
        const isCurrent = state.automationRunner.running && state.automationRunner.currentIndex === index;
        return `
          <li class="automation-queue-item ${isCurrent ? 'running' : ''}" draggable="${disabled ? 'false' : 'true'}" data-index="${index}">
            <span class="drag-handle" aria-hidden="true">☰</span>
            <span class="queue-index">${index + 1}</span>
            <div class="queue-copy">
              <strong>${escapeHtml(task.name)}</strong>
              <small>${task.localOnly ? '本地内容研究' : Array.isArray(task.steps) ? '流程任务' : '脚本任务'}</small>
            </div>
            <button class="queue-remove-btn" data-index="${index}" ${disabled || queue.length <= 1 ? 'disabled' : ''}>移除</button>
          </li>
        `;
      })
      .join('');

  automationQueueList.querySelectorAll('.queue-remove-btn').forEach(button => {
    button.addEventListener('click', () => removeAutomationTask(Number(button.dataset.index)));
  });
  automationQueueList.querySelectorAll('.automation-queue-item').forEach(item => {
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
      reorderAutomationTask(fromIndex, toIndex);
    });
  });
}

function addAutomationTask() {
  const taskId = automationTaskSelect.value;
  if (!taskId) return;
  state.automation.taskIds = normalizeAutomationTaskIds([...getAutomationQueue(), taskId]);
  state.automation.taskId = state.automation.taskIds[0];
  persistAutomationSettings();
  renderAutomationQueue();
  updateAutomationUi();
}

function removeAutomationTask(index) {
  const queue = getAutomationQueue();
  if (queue.length <= 1) return;
  queue.splice(index, 1);
  state.automation.taskIds = normalizeAutomationTaskIds(queue);
  state.automation.taskId = state.automation.taskIds[0];
  persistAutomationSettings();
  renderAutomationQueue();
  updateAutomationUi();
}

function reorderAutomationTask(fromIndex, toIndex) {
  const queue = getAutomationQueue();
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return;
  const [moved] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, moved);
  state.automation.taskIds = normalizeAutomationTaskIds(queue);
  state.automation.taskId = state.automation.taskIds[0];
  persistAutomationSettings();
  renderAutomationQueue();
  updateAutomationUi();
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
  const queue = getAutomationQueue();
  const queueNames = queue
    .map(taskId => state.tasks.find(task => task.id === taskId)?.name || taskId)
    .join(' -> ');
  automationToggleBtn.textContent = state.automation.enabled ? '关闭自动运行' : '开启自动运行';
  automationToggleBtn.classList.toggle('active', state.automation.enabled);
  const currentRun = state.status && state.status.currentRun;
  const queueEditingDisabled = state.automationRunner.running || Boolean(currentRun);
  automationTaskSelect.disabled = queueEditingDisabled;
  automationAddTaskBtn.disabled = queueEditingDisabled;
  automationStatusText.textContent = state.automationRunner.running
    ? `队列运行中：${state.automationRunner.currentIndex + 1}/${state.automationRunner.total}`
    : state.automation.enabled
      ? `已开启：${queue.length} 个任务`
      : '未开启';
  automationNextText.textContent = state.automation.enabled
    ? `下次：${formatDateTime(state.automation.nextRunAt)} · ${queueNames || '-'}`
    : '下次：-';
  renderAutomationQueue();
}

function applyAutomationForm() {
  state.automation.taskId = automationTaskSelect.value || state.automation.taskId;
  state.automation.taskIds = getAutomationQueue();
  state.automation.intervalMinutes = clampNumber(automationIntervalInput.value, 10, 120);
  state.automation.jitterMinutes = clampNumber(automationJitterInput.value, 0, 10);
  if (state.automation.enabled) state.automation.nextRunAt = computeNextRunAt();
  persistAutomationSettings();
  syncAutomationForm();
  updateAutomationUi();
}

function toggleAutomation() {
  applyAutomationForm();
  state.automation.enabled = !state.automation.enabled;
  state.automation.nextRunAt = state.automation.enabled ? computeNextRunAt() : 0;
  persistAutomationSettings();
  updateAutomationUi();
}

function getAutomationMessage(queue) {
  const names = queue
    .map(taskId => state.tasks.find(task => task.id === taskId)?.name || taskId)
    .join(' -> ');
  return `倒计时结束后会按顺序运行：${names}。如不想执行，可以取消本次。`;
}

function closeCountdown() {
  if (state.countdown && state.countdown.timer) window.clearInterval(state.countdown.timer);
  state.countdown = null;
  countdownMask.hidden = true;
}

async function executeCountdownTask() {
  const taskIds = state.countdown && state.countdown.taskIds;
  closeCountdown();
  if (!taskIds || !taskIds.length) return;
  await executeAutomationQueue(taskIds);
}

function startAutomationCountdown(taskIds) {
  const queue = taskIds && taskIds.length ? taskIds : getAutomationQueue();
  if (!queue.length || state.countdown) return;
  let seconds = 5;
  countdownTitle.textContent = `即将运行自动队列（${queue.length} 个任务）`;
  countdownMessage.textContent = getAutomationMessage(queue);
  countdownNumber.textContent = seconds;
  countdownMask.hidden = false;

  const timer = window.setInterval(() => {
    seconds -= 1;
    countdownNumber.textContent = seconds;
    if (seconds <= 0) executeCountdownTask();
  }, 1000);

  state.countdown = {
    taskIds: queue,
    timer,
  };
}

function skipCurrentAutomationRun() {
  closeCountdown();
  state.automation.nextRunAt = computeNextRunAt();
  persistAutomationSettings();
  updateAutomationUi();
}

function tickAutomation() {
  if (!state.automation.enabled) return;
  if (state.countdown) return;
  if (!state.automation.nextRunAt) {
    state.automation.nextRunAt = computeNextRunAt();
    persistAutomationSettings();
    updateAutomationUi();
    return;
  }
  if (Date.now() < state.automation.nextRunAt) return;
  if (state.automationRunner.running) return;

  const currentRun = state.status && state.status.currentRun;
  if (currentRun) {
    state.automation.nextRunAt = Date.now() + 5 * 60 * 1000;
    persistAutomationSettings();
    updateAutomationUi();
    return;
  }

  startAutomationCountdown(getAutomationQueue());
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

async function executeAutomationQueue(taskIds) {
  if (state.automationRunner.running) return;
  const queue = taskIds.filter(taskId => state.tasks.some(task => task.id === taskId));
  if (!queue.length) return;

  state.automationRunner = {
    running: true,
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
    state.automation.nextRunAt = computeNextRunAt();
    logTitle.textContent = `自动队列 · ${state.env} · 完成`;
  } catch (error) {
    state.automation.enabled = false;
    state.automation.nextRunAt = 0;
    window.alert(`自动队列已中断：${error.message}`);
  } finally {
    state.automationRunner = {
      running: false,
      currentIndex: -1,
      total: 0,
    };
    persistAutomationSettings();
    updateAutomationUi();
    await loadStatus();
  }
}

function bindAutomation() {
  syncAutomationForm();
  updateAutomationUi();
  automationSaveBtn.addEventListener('click', async () => {
    applyAutomationForm();
    await syncAutomationSettingsToServer();
    window.alert('自动运行设置已保存');
  });
  automationAddTaskBtn.addEventListener('click', addAutomationTask);
  automationToggleBtn.addEventListener('click', toggleAutomation);
  automationIntervalInput.addEventListener('change', applyAutomationForm);
  automationJitterInput.addEventListener('change', applyAutomationForm);
  countdownCancelBtn.addEventListener('click', skipCurrentAutomationRun);
  countdownRunNowBtn.addEventListener('click', executeCountdownTask);
  window.setInterval(() => {
    tickAutomation();
    updateAutomationUi();
  }, 1000);
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
  await loadAutomationSettings();
  bindAutomation();
  refreshBtn.addEventListener('click', loadStatus);
  surveyToggleBtn.addEventListener('click', toggleFeatureSurvey);
  stopBtn.addEventListener('click', stopCurrentTask);
  scrollLogBottomBtn.addEventListener('click', scrollLogToBottom);
  logOutput.addEventListener('scroll', handleLogScroll);
  researchPillarFilter?.addEventListener('change', renderContentResearchBoard);
  researchGameFilter?.addEventListener('change', renderContentResearchBoard);
  updateLogFollowUi();
  await loadTasks();
  await loadStatus();
  window.setInterval(loadStatus, 2500);
}

boot().catch(error => {
  console.error(error);
  logOutput.textContent = error.message;
});
