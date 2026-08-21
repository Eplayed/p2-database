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
    linkIncludes: ['/poe'],
  },
  {
    id: 'maxroll_poe_builds',
    game: 'poe1',
    source: 'Maxroll POE Build Guides',
    sourceType: 'overseas_reference',
    url: 'https://maxroll.gg/poe/build-guides',
    maxItems: 24,
    defaultTags: ['海外参考', '抄BD', '开荒'],
    linkIncludes: ['/poe'],
  },
  {
    id: 'maxroll_poe_currency',
    game: 'poe1',
    source: 'Maxroll POE Currency',
    sourceType: 'overseas_reference',
    url: 'https://maxroll.gg/poe/category/currency',
    maxItems: 16,
    defaultTags: ['海外参考', '看行情'],
    linkIncludes: ['/poe'],
  },
  {
    id: 'maxroll_d4_news',
    game: 'd4',
    source: 'Maxroll Diablo 4 News',
    sourceType: 'news_reference',
    url: 'https://maxroll.gg/d4/news',
    maxItems: 18,
    defaultTags: ['海外参考', '新闻资讯', '热点信息', '暗黑破坏神'],
    linkIncludes: ['/d4/news'],
  },
  {
    id: 'maxroll_d4_home',
    game: 'd4',
    source: 'Maxroll Diablo 4',
    sourceType: 'overseas_reference',
    url: 'https://maxroll.gg/d4',
    maxItems: 12,
    defaultTags: ['海外参考', '热点信息', '暗黑破坏神'],
    linkIncludes: ['/d4'],
  },
  {
    id: 'wowhead_wow_news',
    game: 'wow',
    source: 'Wowhead WoW News',
    sourceType: 'news_reference',
    url: 'https://www.wowhead.com/news',
    maxItems: 24,
    defaultTags: ['海外参考', '新闻资讯', '热点信息', '魔兽世界'],
    linkIncludes: ['/news'],
  },
  {
    id: 'blizzard_wow_news',
    game: 'wow',
    source: 'Blizzard WoW News',
    sourceType: 'official_news',
    url: 'https://worldofwarcraft.blizzard.com/en-us/news',
    maxItems: 16,
    defaultTags: ['官方资讯', '新闻资讯', '热点信息', '魔兽世界'],
    linkIncludes: ['/news'],
  },
  {
    id: 'd4_cn_news',
    game: 'd4',
    source: '暗黑破坏神4国服官网',
    sourceType: 'official_news',
    platformLane: 'toutiao',
    sourceIntent: '头条号：暗黑4国服官方动态，适合转成普通玩家上车/消费/时间判断',
    url: 'https://d4.blizzard.cn/news/',
    maxItems: 12,
    defaultTags: ['官方资讯', '新闻资讯', '热点信息', '暗黑破坏神', '国服'],
    linkIncludes: ['/news/'],
    lang: 'zh',
  },
  {
    id: 'ithome_rss',
    game: 'digital',
    source: 'IT之家 RSS',
    sourceType: 'news_reference',
    sourceIntent: '中文科技资讯素材源，只有命中游戏、数码、汽车或普通人消费决策时才进入平台候选',
    url: 'https://www.ithome.com/rss/',
    format: 'rss',
    maxItems: 24,
    defaultTags: ['新闻资讯', '热点信息'],
    lang: 'zh',
  },
  {
    id: 'openai_news',
    game: 'ai_tech',
    source: 'OpenAI News',
    sourceType: 'official_news',
    platformLane: 'wechat',
    sourceIntent: '公众号：AI科技赛道，OpenAI 官方资讯',
    url: 'https://openai.com/news/',
    maxItems: 12,
    defaultTags: ['AI科技', '官方资讯', '新闻资讯'],
    linkIncludes: ['/news/'],
  },
  {
    id: 'anthropic_news',
    game: 'ai_tech',
    source: 'Anthropic News',
    sourceType: 'official_news',
    platformLane: 'wechat',
    sourceIntent: '公众号：AI科技赛道，Anthropic 官方资讯',
    url: 'https://www.anthropic.com/news',
    maxItems: 12,
    defaultTags: ['AI科技', '官方资讯', '新闻资讯'],
    linkIncludes: ['/news'],
  },
  {
    id: 'google_ai_blog',
    game: 'ai_tech',
    source: 'Google AI Blog',
    sourceType: 'news_reference',
    platformLane: 'wechat',
    sourceIntent: '公众号：AI科技赛道，Google AI 官方博客',
    url: 'https://blog.google/technology/ai/',
    maxItems: 12,
    defaultTags: ['AI科技', '海外参考', '新闻资讯'],
    linkIncludes: ['/technology/ai/'],
  },
  {
    id: 'dify_blog',
    game: 'ai_tech',
    source: 'Dify Blog',
    sourceType: 'news_reference',
    platformLane: 'wechat',
    sourceIntent: '公众号：AI科技赛道，AI工作流和Agent产品更新',
    url: 'https://dify.ai/blog',
    maxItems: 12,
    defaultTags: ['AI科技', 'AI工具', '工作流', '新闻资讯'],
    linkIncludes: ['/blog'],
  },
  {
    id: 'jiqizhixin_ai',
    game: 'ai_tech',
    source: '机器之心 AI资讯',
    sourceType: 'news_reference',
    platformLane: 'wechat',
    sourceIntent: '公众号：AI科技赛道，中文AI行业资讯',
    url: 'https://www.jiqizhixin.com/',
    maxItems: 12,
    defaultTags: ['AI科技', '中文资讯', '新闻资讯'],
    linkIncludes: ['jiqizhixin.com'],
    lang: 'zh',
  },
  {
    id: 'qbitai_ai',
    game: 'ai_tech',
    source: '量子位 AI资讯',
    sourceType: 'news_reference',
    platformLane: 'wechat',
    sourceIntent: '公众号：AI科技赛道，中文AI产品和行业资讯',
    url: 'https://www.qbitai.com/',
    maxItems: 12,
    defaultTags: ['AI科技', '中文资讯', '新闻资讯'],
    linkIncludes: ['qbitai.com'],
    lang: 'zh',
  },
  {
    id: 'mit_ai',
    game: 'ai_tech',
    source: 'MIT Technology Review AI',
    sourceType: 'news_reference',
    platformLane: 'wechat',
    sourceIntent: '公众号：AI科技赛道，海外AI行业观察',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/',
    maxItems: 10,
    defaultTags: ['AI科技', '海外参考', '行业观察'],
    linkIncludes: ['/s/'],
  },
  {
    id: 'producthunt_feed',
    game: 'ai_tech',
    source: 'Product Hunt Feed',
    sourceType: 'news_reference',
    sourceIntent: '海外产品观察素材源，只有命中 AI 工具、Agent 或工作流时才进入公众号候选',
    url: 'https://www.producthunt.com/feed',
    format: 'rss',
    maxItems: 16,
    defaultTags: ['产品观察', '海外参考'],
  },
  {
    id: 'sspai_feed',
    game: 'ai_tech',
    source: '少数派 RSS',
    sourceType: 'news_reference',
    sourceIntent: '中文效率工具素材源，只有命中 AI、工具工作流或普通人效率场景时才进入公众号候选',
    url: 'https://sspai.com/feed',
    format: 'rss',
    maxItems: 18,
    defaultTags: ['中文资讯'],
    lang: 'zh',
  },
];

const STATIC_TOPIC_SOURCES = [
  {
    id: 'toutiao_old_player_seed',
    game: 'toutiao_core',
    source: '头条号题材种子：游戏数码汽车硬核杂谈',
    sourceType: 'seed_topic',
    platformLane: 'toutiao',
    sourceIntent: '头条号：游戏、数码、汽车、老玩家硬核杂谈',
    defaultTags: ['内容观察', '老玩家杂谈'],
    topics: [
      {
        title: '一款 ARPG 为什么让成年人玩不下去：不是难，是时间被切碎了',
        description: '适合写成老玩家硬核杂谈，从下班时间、刷图成本、赛季追赶压力切入。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 22 },
      },
      {
        title: '中年玩家最该警惕的不是买断价，是赛季游戏把晚上时间拆没了',
        description: '从普通男性的时间账本写游戏选择，适合头条号观点文。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 20 },
      },
      {
        title: '老电脑还要不要为了新游戏升级显卡：先算每周能玩几小时',
        description: '数码消费判断，把显卡升级、游戏热度和实际使用时长放在一起算。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 18 },
      },
      {
        title: '家庭年收入不高还想换新能源车，先把这几笔隐形成本算清楚',
        description: '汽车普通人账本，适合从通勤、保险、折旧、充电条件落到决策。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 18 },
      },
    ],
  },
  {
    id: 'xhs_female_workplace_seed',
    game: 'xhs_life',
    source: '小红书题材种子：女性玩家情绪职场',
    sourceType: 'seed_topic',
    platformLane: 'xhs',
    sourceIntent: '小红书：女性玩家、情感共鸣、职场成长',
    defaultTags: ['小红书', '女性玩家', '情感共鸣', '职场'],
    topics: [
      {
        title: '女玩家为什么越来越不想开麦：不是玻璃心，是上班已经够累了',
        description: '女性玩家情绪共鸣，适合做 2-3 张卡片：场景、感受、处理方式。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 24 },
      },
      {
        title: '下班只想打两把游戏的人，最怕队友把娱乐玩成考核',
        description: '情绪共鸣和职场疲惫结合，适合小红书收藏/转发。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 21 },
      },
      {
        title: '女生玩游戏被问是不是代练，怎么回才不内耗',
        description: '女性玩家社交场景，适合卡片化表达，不做硬核攻略。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 20 },
      },
      {
        title: '职场新人别把 AI 当捷径：真正省时间的是固定工作流',
        description: '职场成长卡片，适合女性职场赛道，讲具体工作流而不是炫技。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 19 },
      },
      {
        title: '下班回家只想安静打一会儿游戏，不想再被人指挥',
        description: '女性玩家情绪共鸣，适合做“开麦压力、队友控制欲、独处恢复能量”的卡片。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 22 },
      },
      {
        title: '女生玩硬核游戏，最烦的不是打不过，是总有人来教你',
        description: '女性玩家社交场景，带轻吐槽和边界感，适合评论互动。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 21 },
      },
      {
        title: '上班后才懂，周末玩游戏也要做减法',
        description: '职场疲惫和娱乐选择，适合收藏化：删日常、减社交、只保留放松感。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 20 },
      },
      {
        title: '30岁以后买数码产品，别再为了参数熬夜',
        description: '女性职场/生活消费，讲预算、使用频率和真实需求，适合小红书避雷卡片。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 19 },
      },
      {
        title: '不想社交又怕错过机会，职场新人可以先把重复工作交给AI',
        description: '职场成长和AI工具结合，适合做“邮件、纪要、资料整理”三张卡。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 21 },
      },
      {
        title: '游戏里被催进度那一刻，我突然不想上线了',
        description: '女性玩家/情绪共鸣，适合从“娱乐变成KPI”的场景切入。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 20 },
      },
    ],
  },
  {
    id: 'wechat_ai_tech_seed',
    game: 'ai_tech',
    source: '公众号题材种子：AI科技工作流',
    sourceType: 'seed_topic',
    platformLane: 'wechat',
    sourceIntent: '公众号：AI科技、工具实操、工作流、行业观察',
    defaultTags: ['AI科技', 'AI工具', '工作流'],
    topics: [
      {
        title: '普通人用 AI 写文章，真正要搭的是内容工作流',
        description: '公众号 AI 科技长文，拆选题、资料、审稿、发布、复盘五个环节。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 24 },
      },
      {
        title: 'Dify 工作流跑不出好稿，通常不是模型问题，是节点职责混在一起',
        description: 'AI 工作流教程，适合结合自媒体生产案例做长期沉淀。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 22 },
      },
      {
        title: 'AI Agent 适合个人工作室吗：先从可复用流程开始，不要先追全自动',
        description: 'AI 行业观察和普通人应用，适合公众号。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 20 },
      },
      {
        title: '用 Codex 做小程序和内容后台，一个人工作室最该先自动化哪几件事',
        description: 'AI 工具实操，讲开发、数据抓取、内容研究、发文工作台。',
        metrics: { views: 0, replies: 0, likes: 0, heat: 21 },
      },
    ],
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
  ['Diablo IV', '暗黑破坏神4'],
  ['Diablo 4', '暗黑破坏神4'],
  ['World of Warcraft', '魔兽世界'],
  ['WoW', '魔兽世界'],
  ['News', '新闻'],
  ['Patch Notes', '补丁说明'],
  ['Patch', '补丁'],
  ['Hotfixes', '热修'],
  ['Hotfix', '热修'],
  ['Season', '赛季'],
  ['Midnight', '至暗之夜'],
  ['Artificial Intelligence', '人工智能'],
  ['AI Agents', 'AI 智能体'],
  ['Agent', '智能体'],
  ['Workflow', '工作流'],
  ['Automation', '自动化'],
];

const TAG_RULES = [
  { tag: '开荒', keywords: ['league starter', 'starter', 'leveling', '开荒', '升级'] },
  { tag: '抄BD', keywords: ['build', 'bd', 'skill', '技能', '流派'] },
  { tag: '看行情', keywords: ['currency', 'farming', '通货', '行情', '搬砖'] },
  { tag: '解卡点', keywords: ['boss', 'mechanic', 'guide', '升华', '剧情', '异界', '卡点'] },
  { tag: '赛季', keywords: ['league', 'season', '3.29', 'allflame', '赛季'] },
  { tag: '新闻资讯', keywords: ['news', 'announcement', 'announced', 'revealed', 'release', 'patch notes', '新闻', '公告', '发布'] },
  { tag: '热点信息', keywords: ['hotfix', 'patch', 'ptr', 'buff', 'nerf', 'tier list', 'meta', 'campfire', '热点', '热修', '补丁', '改动'] },
  { tag: '暗黑破坏神', keywords: ['diablo', '暗黑', 'd4'] },
  { tag: '魔兽世界', keywords: ['wow', 'world of warcraft', 'warcraft', '魔兽'] },
  { tag: 'AI科技', keywords: ['ai科技', 'artificial intelligence', '人工智能', '大模型', 'chatgpt', 'openai', 'claude', 'gemini', 'deepseek', 'dify', 'codex', 'agent', '智能体', '模型'] },
  { tag: 'AI工具', keywords: ['ai工具', '工具', '产品', '实操', '教程', '效率', '自动化', 'workflow', '工作流'] },
  { tag: '小红书', keywords: ['小红书', '女生', '姐妹', '女性', '女玩家', '情绪', '共鸣', '职场', '上班', '通勤', '避雷', '收藏'] },
  { tag: '女性玩家', keywords: ['女性玩家', '女玩家', '女生', '姐妹', '外观', '幻化', '坐骑', '宠物', '截图', '开麦'] },
  { tag: '情感共鸣', keywords: ['情绪', '共鸣', '焦虑', '治愈', '累', '压力', '内耗', '玻璃心'] },
  { tag: '职场', keywords: ['职场', '上班', '下班', '通勤', '同事', '老板', '技能迁移', '工作流', '新人'] },
  { tag: '数码', keywords: ['数码', '手机', '显卡', '电脑', 'ai设备', '耳机', '平板', '硬件'] },
  { tag: '汽车', keywords: ['汽车', '新能源', '买车', '油耗', '续航', '保险', '折旧', '充电'] },
  { tag: '老玩家杂谈', keywords: ['老玩家', '成年人', '中年', '上班', '下班', '时间', '钱', '生活', '职业', '值不值', '要不要', '回坑'] },
];

const MINIAPP_MAP = [
  { page: '新闻资讯', keywords: ['新闻资讯', '新闻', '公告', 'news', 'announcement', 'revealed', 'release'] },
  { page: '热点信息', keywords: ['热点信息', '热点', 'hotfix', 'patch', 'update', 'ptr', 'buff', 'nerf', 'meta', 'tier list'] },
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
  新闻资讯: {
    pillar: '新闻资讯',
    status: 'content',
    routeHint: '公众号、头条号、论坛帖；写作前用官方公告或一手来源核验',
  },
  热点信息: {
    pillar: '热点信息',
    status: 'content',
    routeHint: '公众号、头条号、论坛帖；适合做版本热点、改动解读和玩家讨论跟踪',
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

function cleanCandidateTitle(title, source = {}) {
  let result = cleanText(title)
    .replace(/\s+\|\s+/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (source.id === 'dify_blog') {
    result = result
      .replace(/^How to\s+How to\s+/i, 'How to ')
      .replace(/\s+In this guide,[\s\S]*$/i, '')
      .replace(/\s+Step-by-step tutorial[\s\S]*$/i, '')
      .replace(/\s+Dify\s+·\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}$/i, '')
      .trim();
  }

  if (source.id === 'producthunt_feed') {
    result = result
      .replace(/\s*-\s*Product Hunt$/i, '')
      .replace(/\s*\|\s*Product Hunt$/i, '')
      .trim();
  }

  if (source.id === 'sspai_feed') {
    result = result
      .replace(/\s*-\s*少数派$/i, '')
      .replace(/\s*\|\s*少数派$/i, '')
      .trim();
  }

  if (result.length > 96) {
    const cutPoints = ['。', '：', ':', '，', ',', ' - ', ' · '];
    for (const marker of cutPoints) {
      const index = result.indexOf(marker);
      if (index >= 18 && index <= 72) {
        result = result.slice(0, index + (marker.trim() ? marker.length : 0)).trim();
        break;
      }
    }
  }

  if (result.length > 96) {
    result = `${result.slice(0, 92).trim()}…`;
  }

  return result;
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
  if (tags.includes('AI科技')) return '适合公众号 AI 科技稿，重点落到工具、工作流、行业变化或普通人应用';
  if (tags.includes('小红书') || tags.includes('女性玩家') || tags.includes('情感共鸣') || tags.includes('职场')) {
    return '适合小红书 2-3 张卡片，重点落到女性玩家、情绪共鸣、职场场景或收藏避雷';
  }
  if (tags.includes('数码') || tags.includes('汽车') || tags.includes('老玩家杂谈')) {
    return '适合头条号硬核杂谈，把游戏、数码或汽车事件落到普通男性的时间、钱和生活决策';
  }
  if (tags.includes('新闻资讯')) return '适合整理成资讯快讯，注意核验发布时间、服务器和版本差异';
  if (tags.includes('热点信息')) return '适合做热点追踪或改动解读，先判断国内玩家是否关心';
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
    news: tags.includes('新闻资讯') ? 20 : 0,
    hot: tags.includes('热点信息') ? 18 : 0,
    season: tags.includes('赛季') ? 10 : 0,
    domesticForum: topic.sourceType === 'forum' ? 15 : 0,
    overseasReference: topic.sourceType === 'overseas_reference' ? 5 : 0,
    newsReference: topic.sourceType === 'news_reference' ? 8 : 0,
    officialNews: topic.sourceType === 'official_news' ? 12 : 0,
    seedTopic: topic.sourceType === 'seed_topic' ? 10 : 0,
    trendReference: topic.sourceType === 'trend_reference' ? 8 : 0,
    platformLane: topic.platformLane ? 12 : 0,
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
    const linkIncludes = Array.isArray(source.linkIncludes) && source.linkIncludes.length ? source.linkIncludes : ['/poe'];
    if (!linkIncludes.some(fragment => url.toLowerCase().includes(String(fragment).toLowerCase()))) continue;
    if (text.length < 8 || text.length > 220) continue;
    if (isGenericNavText(text)) continue;
    seen.add(url);
    links.push({ url, title: text });
    if (links.length >= source.maxItems) break;
  }
  return links;
}

function extractXmlTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = String(block || '').match(pattern);
  if (!match) return '';
  return cleanText(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
}

function extractAtomLink(block) {
  const hrefMatch = String(block || '').match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (hrefMatch) return hrefMatch[1];
  return extractXmlTag(block, 'link');
}

function extractFeedItems(xml, source) {
  const items = [];
  const seen = new Set();
  const blocks = [];
  const itemPattern = /<item\b[\s\S]*?<\/item>/gi;
  const entryPattern = /<entry\b[\s\S]*?<\/entry>/gi;
  let match;
  while ((match = itemPattern.exec(xml))) blocks.push(match[0]);
  while ((match = entryPattern.exec(xml))) blocks.push(match[0]);

  for (const block of blocks) {
    const title = extractXmlTag(block, 'title');
    const rawUrl = extractAtomLink(block) || extractXmlTag(block, 'guid');
    const url = normalizeUrl(rawUrl, source.url);
    if (!title || !url || seen.has(url)) continue;
    if (title.length < 4 || title.length > 220) continue;
    if (isGenericNavText(title)) continue;
    const description =
      extractXmlTag(block, 'description') || extractXmlTag(block, 'summary') || extractXmlTag(block, 'content');
    const publishedAt =
      extractXmlTag(block, 'pubDate') || extractXmlTag(block, 'published') || extractXmlTag(block, 'updated');
    seen.add(url);
    items.push({ url, title, description, publishedAt });
    if (items.length >= source.maxItems) break;
  }

  return items;
}

function isGenericNavText(text) {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^(home|all|tools|store|news|path of exile|path of exile 2 arpg|path of exile arpg|diablo iv|world of warcraft)$/i.test(normalized)) {
    return true;
  }
  if (
    /^(build guides|bosses|currency|league starter|league starters|leveling|maxroll planners|community planners|atlas tree|passive tree|genesis tree|pob import\/export|tier lists|resources|database|planner)( \1)?$/i.test(
      normalized
    )
  ) {
    return true;
  }
  const parts = normalized.split(' ');
  if (parts.length % 2 === 0) {
    const half = parts.length / 2;
    const first = parts.slice(0, half).join(' ');
    const second = parts.slice(half).join(' ');
    if (first === second) return true;
  }
  return false;
}

function extractPageMeta(html) {
  const title = cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const description =
    cleanText((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '') ||
    cleanText((html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '');
  return { title, description };
}

function createTopic(source, item, index) {
  const title = cleanCandidateTitle(item.title, source);
  const tags = classifyTags(`${title} ${item.description || ''}`, source.defaultTags);
  const titleCn = translateTitle(title);
  const miniappPage = pickMiniappPage(title, tags);
  const miniapp = getMiniappInfo(miniappPage);
  return {
    id: `${source.id}_${index + 1}`,
    game: source.game,
    source: source.source,
    sourceType: source.sourceType,
    platformLane: source.platformLane || '',
    sourceIntent: source.sourceIntent || '',
    lang: source.lang || (source.sourceType === 'overseas_reference' || source.sourceType === 'news_reference' || source.sourceType === 'official_news' ? 'en' : 'zh'),
    title,
    titleCn,
    url: item.url,
    publishedAt: item.publishedAt || '',
    crawledAt: new Date().toISOString(),
    tags,
    metrics: item.metrics || { views: 0, replies: 0, likes: 0, heat: 0 },
    signals: {
      painPoint: summarizeAngle(title, tags),
      articleAngle: titleCn,
      miniappPage,
      miniapp,
      platformLane: source.platformLane || '',
      sourceIntent: source.sourceIntent || '',
      confidence: source.sourceType === 'seed_topic' ? 'seed' : source.sourceType === 'overseas_reference' ? 'reference' : 'candidate',
    },
    summaryCn:
      item.description ||
      `${source.source} 发现的 ${tags.filter(tag => tag !== '海外参考').join('、') || '内容'} 信号。写文章前需要核验版本、数值和国服适用性。`,
  };
}

function createStaticSourceReport(source) {
  const startedAt = new Date().toISOString();
  const topics = (source.topics || []).map((item, index) =>
    createTopic(
      source,
      {
        url: item.url || source.url || '',
        title: item.title,
        description: item.description || '',
        publishedAt: item.publishedAt || '',
        metrics: item.metrics || { views: 0, replies: 0, likes: 0, heat: 10 },
      },
      index
    )
  );
  return {
    id: source.id,
    name: source.source,
    game: source.game,
    type: source.sourceType,
    url: source.url || '',
    status: 'success',
    startedAt,
    finishedAt: new Date().toISOString(),
    topicCount: topics.length,
    topics,
  };
}

async function fetchSource(source) {
  const startedAt = new Date().toISOString();
  const response = await fetch(source.url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const isFeed = source.format === 'rss' || /<(rss|feed)\b/i.test(html.slice(0, 500));
  const meta = isFeed ? { title: source.source, description: '' } : extractPageMeta(html);
  const links = isFeed ? extractFeedItems(html, source) : extractLinks(html, source);
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
  const tags = ['论坛', '解卡点', '热点信息'];
  if (report.game === 'poe2' || report.game === 'poe1') tags.push('抄BD');
  if (report.game === 'd4') tags.push('暗黑破坏神');
  const miniappPage = report.game === 'poe2' || report.game === 'poe1' ? '解卡点' : '热点信息';
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
  const directions = ['新闻资讯', '热点信息', '抄BD', '看行情', '解卡点', '内容观察'];
  const selected = [];
  const seen = new Set();

  for (const direction of directions) {
    const matches = topics.filter(topic => (topic.signals?.miniappPage || '内容观察') === direction).slice(0, 2);
    for (const topic of matches) {
      if (seen.has(topic.stableId)) continue;
      seen.add(topic.stableId);
      selected.push(topic);
    }
  }

  for (const topic of topics) {
    if (selected.length >= 12) break;
    if (seen.has(topic.stableId)) continue;
    seen.add(topic.stableId);
    selected.push(topic);
  }

  return selected.slice(0, 12).map(topic => ({
    title: topic.titleCn || topic.title,
    source: topic.source,
    url: topic.url,
    game: topic.game,
    score: topic.score,
    miniappPage: topic.signals?.miniappPage || '内容观察',
    routeHint: topic.signals?.miniapp?.routeHint || '',
    articleAngle: topic.signals?.articleAngle || '',
    verify: getVerifyText(topic),
  }));
}

function getVerifyText(topic) {
  if (topic.sourceType === 'official_news') return '核验官方原文、发布时间和国服适用性';
  if (topic.sourceType === 'news_reference') return '核验资讯来源时间、版本和官方出处';
  if (topic.sourceType === 'overseas_reference') return '核验国服适用性和版本差异';
  if (topic.sourceType === 'forum') return '打开原帖核验玩家真实问题';
  if (topic.sourceType === 'seed_topic') return '平台题材种子，只用于方向筛选；写作前必须补真实来源、截图或新闻链接';
  return '写作前核验版本、数值和来源';
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
      platformLane: topic.platformLane || '',
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
      platformLane: topic.platformLane || '',
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

  const groups = ['抄BD', '看行情', '解卡点', '新闻资讯', '热点信息', '内容观察'];
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
    .filter(report => report.type === 'forum')
    .map(createForumTopic);

  for (const source of STATIC_TOPIC_SOURCES) {
    const report = createStaticSourceReport(source);
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
      note: source.sourceIntent || '平台题材种子：用于补齐候选池，写作前需要补充真实来源。',
    });
    topics.push(...report.topics);
    console.log(`✅ ${report.name}: ${report.topicCount} 个平台候选题`);
  }

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
