#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const RUNTIME_DIR = path.join(ROOT, 'dashboard', 'runtime');
const OUTPUT_FILE = path.join(RUNTIME_DIR, 'content-research.json');
const MARKDOWN_FILE = path.join(RUNTIME_DIR, 'content-research-topics.md');
const HISTORY_FILE = path.join(RUNTIME_DIR, 'content-research-history.json');
const FORUM_SUMMARY_FILE = path.join(RUNTIME_DIR, 'forum-content-scan.json');

const SOURCE_CONFIGS = [
  {
    id: 'maxroll_poe_home',
    game: 'poe1',
    source: 'Maxroll POE',
    sourceType: 'overseas_reference',
    url: 'https://maxroll.gg/poe',
    maxItems: 12,
    defaultTags: ['海外参考'],
  },
  {
    id: 'maxroll_poe_builds',
    game: 'poe1',
    source: 'Maxroll POE Build Guides',
    sourceType: 'overseas_reference',
    url: 'https://maxroll.gg/poe/build-guides',
    maxItems: 24,
    defaultTags: ['海外参考', '抄BD', '开荒'],
  },
  {
    id: 'maxroll_poe_currency',
    game: 'poe1',
    source: 'Maxroll POE Currency',
    sourceType: 'overseas_reference',
    url: 'https://maxroll.gg/poe/category/currency',
    maxItems: 16,
    defaultTags: ['海外参考', '看行情'],
  },
];

const TERM_MAP = [
  ['League Starter', '开荒流派'],
  ['Build Guides', 'BD 攻略'],
  ['Build Guide', 'BD 攻略'],
  ['Leveling', '升级'],
  ['Currency', '通货'],
  ['Bossing', '打 Boss'],
  ['Mapping', '刷图'],
  ['Crafting', '制作'],
  ['Mechanics', '机制'],
  ['Tier Lists', '梯度榜'],
  ['Witch', '女巫'],
  ['Necromancer', '死灵师'],
  ['Elementalist', '元素使'],
  ['Ranger', '游侠'],
  ['Deadeye', '锐眼'],
  ['Duelist', '决斗者'],
  ['Champion', '冠军'],
  ['Marauder', '野蛮人'],
  ['Templar', '圣堂武僧'],
  ['Shadow', '暗影刺客'],
  ['Scion', '贵族'],
  ['Last Updated', '更新'],
  ['Path of Exile', '流放之路'],
];

const TAG_RULES = [
  { tag: '开荒', keywords: ['league starter', 'starter', 'leveling', '开荒', '升级'] },
  { tag: '抄BD', keywords: ['build', 'bd', 'skill', '技能', '流派'] },
  { tag: '看行情', keywords: ['currency', 'farming', '通货', '行情', '搬砖'] },
  { tag: '解卡点', keywords: ['boss', 'mechanic', 'guide', '升华', '剧情', '异界', '卡点'] },
  { tag: '赛季', keywords: ['league', 'season', '3.29', 'allflame', '赛季'] },
];

const MINIAPP_MAP = [
  { page: '抄BD', keywords: ['开荒', '抄BD', '技能', '流派', 'build', 'league starter'] },
  { page: '看行情', keywords: ['看行情', '通货', 'currency', 'farming'] },
  { page: '解卡点', keywords: ['解卡点', 'boss', 'mechanic', '升华', '剧情', '异界'] },
];

const MINIAPP_PAGE_INFO = {
  抄BD: {
    pillar: '抄BD',
    status: 'existing',
    routeHint: 'POE1/POE2 天梯榜、BD 详情、技能查 BD、装备查 BD',
  },
  看行情: {
    pillar: '看行情',
    status: 'existing',
    routeHint: 'POE1/POE2 行情页、今日换算、国际服/国服行情参考',
  },
  解卡点: {
    pillar: '解卡点',
    status: 'existing',
    routeHint: '流放急救箱、剧情/升华/异界排查条目',
  },
  内容观察: {
    pillar: '内容观察',
    status: 'research_only',
    routeHint: '先写文章验证需求，暂不直接做小程序入口',
  },
};

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
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number.parseInt(number, 10)));
}

function cleanText(value) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString().replace(/#.*$/, '');
  } catch (error) {
    return '';
  }
}

function translateTitle(title) {
  let result = title;
  for (const [from, to] of TERM_MAP) {
    result = result.replace(new RegExp(from, 'gi'), to);
  }
  return result.replace(/\s+\|\s+/g, ' · ').trim();
}

function classifyTags(text, defaults = []) {
  const haystack = String(text || '').toLowerCase();
  const tags = new Set(defaults);
  for (const rule of TAG_RULES) {
    if (rule.keywords.some(keyword => haystack.includes(keyword.toLowerCase()))) {
      tags.add(rule.tag);
    }
  }
  return [...tags];
}

function pickMiniappPage(text, tags) {
  const haystack = `${text} ${tags.join(' ')}`.toLowerCase();
  const match = MINIAPP_MAP.find(item => item.keywords.some(keyword => haystack.includes(keyword.toLowerCase())));
  return match ? match.page : '内容观察';
}

function getMiniappInfo(page) {
  return MINIAPP_PAGE_INFO[page] || MINIAPP_PAGE_INFO['内容观察'];
}

function summarizeAngle(title, tags) {
  if (tags.includes('开荒')) return '新赛季开荒选择与抄 BD 需求';
  if (tags.includes('看行情')) return '玩家关心通货变化、搬砖收益和物价波动';
  if (tags.includes('解卡点')) return '玩家遇到机制、Boss、剧情或升华卡点';
  if (tags.includes('抄BD')) return '玩家想知道哪些技能和职业值得参考';
  return '可作为选题观察，写作前需要再次判断玩家痛点';
}

function scoreTopic(topic) {
  const tags = topic.tags || [];
  const breakdown = {
    base: 20,
    starter: tags.includes('开荒') ? 25 : 0,
    build: tags.includes('抄BD') ? 20 : 0,
    economy: tags.includes('看行情') ? 15 : 0,
    rescue: tags.includes('解卡点') ? 15 : 0,
    season: tags.includes('赛季') ? 10 : 0,
    domesticForum: topic.sourceType === 'forum' && (topic.game === 'poe1' || topic.game === 'poe2') ? 15 : 0,
    overseasReference: topic.sourceType === 'overseas_reference' ? 5 : 0,
    publishedAt: topic.publishedAt ? 5 : 0,
  };
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return {
    total: Math.min(total, 100),
    breakdown,
  };
}

function createDedupeKey(topic) {
  const urlKey = topic.url ? topic.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase() : '';
  if (urlKey) return `url:${urlKey}`;
  return `title:${String(topic.title || topic.titleCn || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

function createStableId(topic) {
  const key = createDedupeKey(topic);
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

function extractLinks(html, source) {
  const links = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html))) {
    const url = normalizeUrl(match[1], source.url);
    const text = cleanText(match[2]);
    if (!url || seen.has(url)) continue;
    if (!url.includes('/poe')) continue;
    if (text.length < 8 || text.length > 220) continue;
    if (/^(home|all|tools|store|news|path of exile)$/i.test(text)) continue;
    seen.add(url);
    links.push({ url, title: text });
    if (links.length >= source.maxItems) break;
  }
  return links;
}

function extractPageMeta(html) {
  const title = cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const description =
    cleanText((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '') ||
    cleanText((html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '');
  return { title, description };
}

function createTopic(source, item, index) {
  const tags = classifyTags(`${item.title} ${item.description || ''}`, source.defaultTags);
  const titleCn = translateTitle(item.title);
  const miniappPage = pickMiniappPage(item.title, tags);
  const miniapp = getMiniappInfo(miniappPage);
  return {
    id: `${source.id}_${index + 1}`,
    game: source.game,
    source: source.source,
    sourceType: source.sourceType,
    lang: source.sourceType === 'overseas_reference' ? 'en' : 'zh',
    title: item.title,
    titleCn,
    url: item.url,
    publishedAt: item.publishedAt || '',
    crawledAt: new Date().toISOString(),
    tags,
    metrics: item.metrics || { views: 0, replies: 0, likes: 0, heat: 0 },
    signals: {
      painPoint: summarizeAngle(item.title, tags),
      articleAngle: titleCn,
      miniappPage,
      miniapp,
      confidence: source.sourceType === 'overseas_reference' ? 'reference' : 'candidate',
    },
    summaryCn:
      item.description ||
      `${source.source} 发现的 ${tags.filter(tag => tag !== '海外参考').join('、') || '内容'} 信号。写文章前需要核验版本、数值和国服适用性。`,
  };
}

async function fetchSource(source) {
  const startedAt = new Date().toISOString();
  const response = await fetch(source.url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const meta = extractPageMeta(html);
  const links = extractLinks(html, source);
  const seedItems = links.length ? links : [{ url: source.url, title: meta.title, description: meta.description }];
  const topics = seedItems.map((item, index) => createTopic(source, item, index));
  return {
    id: source.id,
    name: source.source,
    game: source.game,
    type: source.sourceType,
    url: source.url,
    status: 'success',
    startedAt,
    finishedAt: new Date().toISOString(),
    topicCount: topics.length,
    topics,
  };
}

function createForumSourceReports() {
  const forumSummary = readJson(FORUM_SUMMARY_FILE, null);
  if (!forumSummary) return [];

  const reports = [];
  const caimogu = forumSummary.sources?.caimogu;
  if (caimogu) {
    reports.push({
      id: 'caimogu_poe2_forum',
      name: '踩蘑菇 POE2',
      game: 'poe2',
      type: 'forum',
      status: caimogu.status || forumSummary.status || 'unknown',
      url: 'https://poe2.caimogu.cc/',
      topicCount: Number(caimogu.eligibleCount || 0),
      newRows: Number(caimogu.newRows || 0),
      skipped: Number(caimogu.skippedExisting || 0) + Number(caimogu.skippedFilter || 0),
      note: '来自现有 QClaw 论坛采集，明细保存在本地论坛数据工作簿。',
    });
  }

  const d2core = forumSummary.sources?.d2core;
  if (d2core) {
    reports.push({
      id: 'd2core_d4_forum',
      name: 'D2Core 暗黑4',
      game: 'd4',
      type: 'forum',
      status: d2core.status || forumSummary.status || 'unknown',
      url: '',
      topicCount: Number(d2core.eligibleCount || 0),
      newRows: Number(d2core.newRows || 0),
      skipped: Number(d2core.skippedExisting || 0) + Number(d2core.skippedFilter || 0),
      note: '保留给自媒体横向选题对照，不属于流放之路数据。',
    });
  }

  return reports;
}

function createForumTopic(report) {
  const tags = ['论坛', '解卡点'];
  if (report.game === 'poe2' || report.game === 'poe1') tags.push('抄BD');
  const miniappPage = report.game === 'poe2' || report.game === 'poe1' ? '解卡点' : '内容观察';
  return {
    id: `${report.id}_summary`,
    game: report.game,
    source: report.name,
    sourceType: 'forum',
    lang: 'zh',
    title: `${report.name} 玩家讨论信号`,
    titleCn: `${report.name} 玩家讨论信号`,
    url: report.url || '',
    publishedAt: '',
    crawledAt: new Date().toISOString(),
    tags,
    metrics: {
      views: 0,
      replies: 0,
      likes: 0,
      heat: Number(report.topicCount || 0) + Number(report.newRows || 0) * 5,
    },
    signals: {
      painPoint: '国内玩家问题与高讨论话题',
      articleAngle: `${report.name} 新增 ${report.newRows || 0} 条，候选 ${report.topicCount || 0} 条，可从本地论坛工作簿继续筛选。`,
      miniappPage,
      miniapp: getMiniappInfo(miniappPage),
      confidence: 'candidate',
    },
    summaryCn: report.note || '论坛摘要只用于发现玩家问题，写文章前需要打开原帖和一手资料核验。',
  };
}

function dedupeTopics(topics) {
  const seen = new Map();
  for (const topic of topics) {
    const key = createDedupeKey(topic);
    const current = seen.get(key);
    if (!current) {
      seen.set(key, topic);
      continue;
    }

    const currentScore = scoreTopic(current).total;
    const nextScore = scoreTopic(topic).total;
    if (nextScore > currentScore) seen.set(key, topic);
  }
  return [...seen.values()];
}

function countBy(items, getKey) {
  return items.reduce((result, item) => {
    const key = getKey(item) || 'unknown';
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function createActionItems(topics) {
  return topics.slice(0, 10).map(topic => ({
    title: topic.titleCn || topic.title,
    source: topic.source,
    url: topic.url,
    game: topic.game,
    score: topic.score,
    miniappPage: topic.signals?.miniappPage || '内容观察',
    routeHint: topic.signals?.miniapp?.routeHint || '',
    articleAngle: topic.signals?.articleAngle || '',
    verify: topic.sourceType === 'overseas_reference' ? '核验国服适用性和版本差异' : '打开原帖核验玩家真实问题',
  }));
}

function createHistorySnapshot(output) {
  return {
    generatedAt: output.generatedAt,
    status: output.status,
    counters: output.counters,
    topStableIds: output.topTopics.map(topic => topic.stableId),
    topics: output.topics.map(topic => ({
      stableId: topic.stableId,
      title: topic.titleCn || topic.title,
      game: topic.game,
      source: topic.source,
      score: topic.score,
      miniappPage: topic.signals?.miniappPage || '内容观察',
      url: topic.url,
    })),
  };
}

function loadHistory() {
  const history = readJson(HISTORY_FILE, []);
  return Array.isArray(history) ? history : [];
}

function createTrend(scoredTopics, previousSnapshot) {
  const previousTopics = Array.isArray(previousSnapshot?.topics) ? previousSnapshot.topics : [];
  const previousIds = new Set(previousTopics.map(topic => topic.stableId).filter(Boolean));
  const currentIds = new Set(scoredTopics.map(topic => topic.stableId).filter(Boolean));
  const newTopics = scoredTopics.filter(topic => !previousIds.has(topic.stableId));
  const returningTopics = scoredTopics.filter(topic => previousIds.has(topic.stableId));
  const disappearedTopics = previousTopics.filter(topic => !currentIds.has(topic.stableId));
  return {
    comparedWith: previousSnapshot?.generatedAt || '',
    newCount: newTopics.length,
    returningCount: returningTopics.length,
    disappearedCount: disappearedTopics.length,
    newTopics: newTopics.slice(0, 8).map(topic => ({
      stableId: topic.stableId,
      title: topic.titleCn || topic.title,
      game: topic.game,
      source: topic.source,
      score: topic.score,
      miniappPage: topic.signals?.miniappPage || '内容观察',
      url: topic.url,
    })),
    persistentTopics: returningTopics.slice(0, 8).map(topic => ({
      stableId: topic.stableId,
      title: topic.titleCn || topic.title,
      game: topic.game,
      source: topic.source,
      score: topic.score,
      miniappPage: topic.signals?.miniappPage || '内容观察',
      url: topic.url,
    })),
  };
}

function writeHistory(output, history) {
  const nextHistory = [createHistorySnapshot(output), ...history]
    .filter((item, index, items) => items.findIndex(other => other.generatedAt === item.generatedAt) === index)
    .slice(0, 30);
  writeJson(HISTORY_FILE, nextHistory);
}

function createMarkdown(output) {
  const lines = [];
  lines.push('# 内容研究选题池');
  lines.push('');
  lines.push(`生成时间：${output.generatedAt}`);
  lines.push(`选题数量：${output.counters.topics}，来源：${output.counters.sources}，失败来源：${output.counters.failedSources}`);
  if (output.trend?.comparedWith) {
    lines.push(
      `趋势：新增 ${output.trend.newCount}，连续出现 ${output.trend.returningCount}，消失 ${output.trend.disappearedCount}`
    );
  }
  lines.push('');
  lines.push('> 只用于自媒体选题和小程序策略判断；论坛与海外攻略不是事实源，写作前需要二次核验。');
  lines.push('');
  if (output.trend?.newTopics?.length) {
    lines.push('## 本次新增');
    lines.push('');
    for (const topic of output.trend.newTopics) {
      lines.push(`- ${topic.title}｜${topic.miniappPage}｜${topic.score} 分${topic.url ? `｜${topic.url}` : ''}`);
    }
    lines.push('');
  }

  lines.push('## 优先写');
  lines.push('');

  for (const item of output.actionItems) {
    lines.push(`### ${item.title}`);
    lines.push('');
    lines.push(`- 分数：${item.score}`);
    lines.push(`- 游戏：${item.game}`);
    lines.push(`- 来源：${item.source}`);
    lines.push(`- 小程序承接：${item.miniappPage}（${item.routeHint || '暂无'}）`);
    lines.push(`- 文章角度：${item.articleAngle}`);
    lines.push(`- 核验动作：${item.verify}`);
    if (item.url) lines.push(`- 链接：${item.url}`);
    lines.push('');
  }

  const groups = ['抄BD', '看行情', '解卡点', '内容观察'];
  for (const group of groups) {
    const items = output.topics.filter(topic => topic.signals?.miniappPage === group).slice(0, 8);
    if (!items.length) continue;
    lines.push(`## ${group}`);
    lines.push('');
    for (const topic of items) {
      lines.push(`- ${topic.titleCn || topic.title}｜${topic.source}｜${topic.score} 分${topic.url ? `｜${topic.url}` : ''}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const sourceReports = createForumSourceReports();
  const topics = sourceReports
    .filter(report => report.type === 'forum' && (report.game === 'poe1' || report.game === 'poe2'))
    .map(createForumTopic);

  for (const source of SOURCE_CONFIGS) {
    try {
      const report = await fetchSource(source);
      sourceReports.push({
        id: report.id,
        name: report.name,
        game: report.game,
        type: report.type,
        status: report.status,
        url: report.url,
        topicCount: report.topicCount,
        newRows: 0,
        skipped: 0,
        note: '海外参考源：只保存标题、摘要、标签和链接，不搬运全文。',
      });
      topics.push(...report.topics);
      console.log(`✅ ${report.name}: ${report.topicCount} 个参考选题`);
    } catch (error) {
      sourceReports.push({
        id: source.id,
        name: source.source,
        game: source.game,
        type: source.sourceType,
        status: 'failed',
        url: source.url,
        topicCount: 0,
        newRows: 0,
        skipped: 0,
        error: error.message,
        note: '抓取失败不影响论坛选题池，可下次重试。',
      });
      console.warn(`⚠️ ${source.source}: ${error.message}`);
    }
  }

  const dedupedTopics = dedupeTopics(topics).map(topic => ({
    ...topic,
    stableId: createStableId(topic),
  }));
  const scoredTopics = dedupedTopics
    .map(topic => {
      const score = scoreTopic(topic);
      return {
        ...topic,
        score: score.total,
        scoreBreakdown: score.breakdown,
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const history = loadHistory();
  const previousSnapshot = history[0] || null;
  const trend = createTrend(scoredTopics, previousSnapshot);

  const output = {
    generatedAt: new Date().toISOString(),
    status: sourceReports.some(source => source.status === 'success') ? 'success' : 'failed',
    counters: {
      topics: scoredTopics.length,
      sources: sourceReports.length,
      failedSources: sourceReports.filter(source => source.status === 'failed').length,
      deduped: topics.length - scoredTopics.length,
      byGame: countBy(scoredTopics, topic => topic.game),
      byType: countBy(scoredTopics, topic => topic.sourceType),
      byMiniappPage: countBy(scoredTopics, topic => topic.signals?.miniappPage),
    },
    sources: sourceReports,
    topTopics: scoredTopics.slice(0, 12),
    actionItems: createActionItems(scoredTopics),
    trend,
    history: {
      file: path.relative(ROOT, HISTORY_FILE),
      retainedRuns: Math.min(history.length + 1, 30),
    },
    exports: {
      markdown: path.relative(ROOT, MARKDOWN_FILE),
    },
    topics: scoredTopics,
    note: '内容研究只用于自媒体选题和小程序策略判断；论坛与海外攻略不是事实源，写作前需用官方公告、游戏内数据或权威数据库核验。',
  };

  writeJson(OUTPUT_FILE, output);
  writeText(MARKDOWN_FILE, createMarkdown(output));
  writeHistory(output, history);
  console.log(`\n内容研究选题池已生成: ${path.relative(ROOT, OUTPUT_FILE)}`);
  console.log(`Markdown 已导出: ${path.relative(ROOT, MARKDOWN_FILE)}`);
  console.log(
    `趋势: 新增 ${output.trend.newCount} 个，连续出现 ${output.trend.returningCount} 个，消失 ${output.trend.disappearedCount} 个`
  );
  console.log(
    `选题 ${output.counters.topics} 个，去重 ${output.counters.deduped} 个，来源 ${output.counters.sources} 个，失败来源 ${output.counters.failedSources} 个`
  );
}

main().catch(error => {
  console.error(`内容研究生成失败: ${error.message}`);
  process.exit(1);
});
