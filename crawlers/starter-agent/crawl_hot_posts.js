#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '../../auto_browser/.env') });

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '../..');
const INPUT_DIR = path.join(ROOT, 'base-data/starter/agent_posts');
const MANIFEST_FILE = path.join(ROOT, 'base-data/starter/hot_posts_manifest.json');
const DEFAULT_URL = 'https://poe2.caimogu.cc/planner#/plan/community-builds';
const API_ORIGIN = 'https://poe2.caimogu.cc';

const args = process.argv.slice(2);
const TARGET_URL = getArg('--url') || process.env.CAIMOGU_STARTER_HOT_URL || DEFAULT_URL;
const LIMIT = Number(getArg('--limit') || process.env.STARTER_HOT_LIMIT || 20);
const DETAIL_LIMIT = Number(getArg('--detail-limit') || process.env.STARTER_HOT_DETAIL_LIMIT || Math.min(LIMIT, 10));
const NO_DETAIL = args.includes('--no-detail') || process.env.STARTER_HOT_NO_DETAIL === 'true';
const CLEAN = !args.includes('--keep-old') && process.env.STARTER_HOT_KEEP_OLD !== 'true';
const LEAGUE = Number(getArg('--league') || process.env.STARTER_HOT_LEAGUE || 4);
const LEVELING_ONLY = args.includes('--leveling-only') || process.env.STARTER_HOT_LEVELING_ONLY === 'true';

function getArg(name) {
  const prefix = `${name}=`;
  const inline = args.find(item => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || `post-${Date.now()}`;
}

function strip(value) {
  return String(value || '').replace(/\r/g, '').replace(/[\t ]+/g, ' ').trim();
}

function uniqBy(items, getKey) {
  const seen = new Set();
  return items.filter(item => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniq(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = strip(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function yamlValue(value) {
  const text = strip(value);
  if (!text) return '';
  return JSON.stringify(text);
}

function parseMetrics(text) {
  const source = String(text || '');
  const readMatch = source.match(/(?:浏览|阅读|查看|views?)[：:\s]*(\d+(?:\.\d+)?)(k|w|万)?/i);
  const replyMatch = source.match(/(?:评论|回复|回帖|replies?)[：:\s]*(\d+(?:\.\d+)?)(k|w|万)?/i);
  const likeMatch = source.match(/(?:点赞|赞|likes?)[：:\s]*(\d+(?:\.\d+)?)(k|w|万)?/i);
  const favMatch = source.match(/(?:收藏|favorites?)[：:\s]*(\d+(?:\.\d+)?)(k|w|万)?/i);
  return {
    views: toMetricNumber(readMatch),
    replies: toMetricNumber(replyMatch),
    likes: toMetricNumber(likeMatch),
    favorites: toMetricNumber(favMatch),
  };
}

function toMetricNumber(match) {
  if (!match) return 0;
  const base = Number(match[1] || 0);
  const unit = String(match[2] || '').toLowerCase();
  if (unit === 'w' || unit === '万') return Math.round(base * 10000);
  if (unit === 'k') return Math.round(base * 1000);
  return Math.round(base);
}

function guessTags(text) {
  const tags = [];
  const source = String(text || '');
  [
    ['升级', /升级|开荒|剧情/],
    ['攻坚', /攻坚|boss|Boss|终局/],
    ['刷图', /刷图|异界|map|maps/i],
    ['低造价', /低造价|廉价|便宜|平民/],
    ['召唤', /召唤|minion|骷髅|幽魂/i],
    ['弓', /弓|箭|游侠/],
    ['法术', /法术|闪电|冰|火|电/],
    ['近战', /近战|锤|斧|剑|战士/],
  ].forEach(([tag, re]) => {
    if (re.test(source)) tags.push(tag);
  });
  return tags;
}

function normalizeUrl(href, baseUrl) {
  if (!href) return '';
  try {
    return new URL(href, baseUrl).toString();
  } catch (error) {
    return href;
  }
}

function cleanBodyText(text) {
  const lines = String(text || '')
    .split('\n')
    .map(line => strip(line))
    .filter(Boolean);
  const useless = /^(登录|注册|搜索|关注|举报|分享|回复|发表评论|加载中|返回顶部)$/;
  return lines
    .filter(line => !useless.test(line))
    .join('\n')
    .slice(0, 30000);
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n')
    .map(strip)
    .filter(Boolean)
    .join('\n');
}

function decodeNoted(value) {
  const raw = String(value || '');
  const match = raw.match(/^data:noted;base64,(.+)$/);
  if (!match) return stripHtml(raw);
  try {
    return stripHtml(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch (error) {
    return '';
  }
}

function flatten(values) {
  const result = [];
  values.forEach(value => {
    if (Array.isArray(value)) result.push(...flatten(value));
    else if (value && typeof value === 'object') result.push(value);
  });
  return result;
}

function getClassMaps(classList) {
  return {
    byCid: new Map((classList || []).map(item => [Number(item.cid), item])),
  };
}

function getClassInfo(cid, classMaps) {
  const current = classMaps.byCid.get(Number(cid));
  if (!current) return { className: '', ascendancy: '' };
  if (current.basic) {
    const basic = classMaps.byCid.get(Number(current.basic));
    return {
      className: basic ? basic.label : '',
      ascendancy: current.label || '',
    };
  }
  return {
    className: current.label || '',
    ascendancy: '',
  };
}

function extractSkillLines(content) {
  const sets = Array.isArray(content && content.skill) ? content.skill : [];
  const lines = [];
  sets.forEach(set => {
    const label = strip(set.label || '默认');
    const items = Array.isArray(set.items) ? set.items : [];
    items.forEach(entry => {
      if (!entry || !entry.main) return;
      const main = strip(entry.main.name || entry.main.label || '');
      const supports = (Array.isArray(entry.items) ? entry.items : [])
        .filter(item => item && !Array.isArray(item))
        .map(item => strip(item.label || item.name || ''))
        .filter(Boolean);
      if (!main) return;
      lines.push(`技能：${label} / ${main}${supports.length ? ` + ${supports.join(' + ')}` : ''}`);
    });
  });
  return uniq(lines).slice(0, 18);
}

function extractEquipmentLines(content) {
  const equips = Array.isArray(content && content.equip) ? content.equip : [];
  return uniq(flatten(equips.map(set => set.items || []))
    .map(item => strip(item.label || item.name || ''))
    .filter(Boolean)
    .map(name => `装备：${name}`))
    .slice(0, 12);
}

function getMainSkill(skillLines, apiItem) {
  const fromLine = String(skillLines[0] || '').match(/\/\s*([^+]+)/);
  if (fromLine) return strip(fromLine[1]);
  const item = apiItem && apiItem.content && Array.isArray(apiItem.content.items) ? apiItem.content.items[0] : null;
  return item ? strip(item.label || item.name || item.key || '') : '';
}

function buildBodyFromApi(post) {
  const detailContent = post.detail && post.detail.content ? post.detail.content : {};
  const noted = decodeNoted(detailContent.noted || '');
  const lines = [
    '## 开荒：BD信息',
    `- 原帖：${post.url}`,
    `- 作者：${post.author || '待确认'}`,
    `- 职业：${post.className || '待确认'}${post.ascendancy ? ` / ${post.ascendancy}` : ''}`,
    `- 标签：${post.tags.join('、') || '热门BD'}`,
    post.ascendancy ? `- 推荐升华：${post.ascendancy}` : '',
    ...(post.skillLines || []).map(line => `- ${line}`),
    ...(post.equipmentLines || []).map(line => `- ${line}`),
    '- 天赋：详见原帖天赋树，候选入库前需要人工确认关键路径。',
    noted ? `\n## 开荒：作者说明\n${noted}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildMarkdown(post) {
  const tags = post.tags && post.tags.length ? post.tags.join(', ') : '热门BD, 待审核';
  const body = post.detail ? buildBodyFromApi(post) : (post.detailText || post.cardText || post.title);
  return `---\n` +
    `title: ${yamlValue(post.title)}\n` +
    `url: ${yamlValue(post.url)}\n` +
    `author: ${yamlValue(post.author || '待确认')}\n` +
    `source: ${yamlValue('踩蘑菇热门BD')}\n` +
    `sourceName: ${yamlValue('踩蘑菇热门BD')}\n` +
    `class: ${yamlValue(post.className || '')}\n` +
    `ascendancy: ${yamlValue(post.ascendancy || '')}\n` +
    `mainSkill: ${yamlValue(post.mainSkill || '')}\n` +
    `tags: ${yamlValue(tags)}\n` +
    `views: ${post.metrics.views || 0}\n` +
    `replies: ${post.metrics.replies || 0}\n` +
    `likes: ${post.metrics.likes || 0}\n` +
    `favorites: ${post.metrics.favorites || 0}\n` +
    `hotScore: ${post.hotScore || 0}\n` +
    `confidence: low\n` +
    `fetchedAt: ${yamlValue(new Date().toISOString())}\n` +
    `---\n\n` +
    `# ${post.title}\n\n` +
    `> 自动抓取自踩蘑菇热门 BD 区。该文件只作为 Agent 候选输入，发布前需要人工审核。\n\n` +
    `${body}\n`;
}

async function fetchPageJson(page, url) {
  return page.evaluate(async target => {
    const response = await fetch(target);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      return { code: -1, msg: text.slice(0, 200), data: null };
    }
  }, url);
}

async function fetchClassList(page) {
  const data = await fetchPageJson(page, 'https://data-resource.caimogu.cc/poe2/planner/assets/allclass.json?v=1.5.2.2');
  return Array.isArray(data) ? data : [];
}

async function fetchBuildDetail(page, planid) {
  if (!planid || NO_DETAIL) return null;
  const response = await fetchPageJson(page, `${API_ORIGIN}/planner/bd?planid=${encodeURIComponent(planid)}`);
  if (!response || response.code !== 0) return null;
  return response.data || null;
}

async function collectBuildsFromApi(page) {
  const classMaps = getClassMaps(await fetchClassList(page));
  const items = [];
  let pageNo = 1;

  while (items.length < LIMIT && pageNo <= 10) {
    const url = `${API_ORIGIN}/planner/bdlist?page=${pageNo}&ps=10&keyword=&endgame=false&leveling=${LEVELING_ONLY ? 'true' : 'false'}&hc=false&ssf=false&league=${LEAGUE}&cid=0`;
    const response = await fetchPageJson(page, url);
    const batch = response && response.data && Array.isArray(response.data.items) ? response.data.items : [];
    items.push(...batch);
    if (!batch.length || (response.data && response.data.last)) break;
    pageNo += 1;
  }

  const posts = [];
  const sliced = items.slice(0, LIMIT);
  for (let i = 0; i < sliced.length; i += 1) {
    const item = sliced[i];
    const detail = i < DETAIL_LIMIT ? await fetchBuildDetail(page, item.planid) : null;
    const detailContent = detail && detail.content ? detail.content : {};
    const classInfo = getClassInfo(item.cid, classMaps);
    const tags = [
      item.leveling && '升级',
      item.endgame && '攻坚',
      item.hc && '硬核模式',
      item.ssf && '独狼模式',
      classInfo.className,
      classInfo.ascendancy,
    ].filter(Boolean);
    const skillLines = detail ? extractSkillLines(detailContent) : [];
    const equipmentLines = detail ? extractEquipmentLines(detailContent) : [];
    const metrics = {
      views: Number(item.views || 0),
      replies: 0,
      likes: Number(item.likes || 0),
      favorites: Number(item.favours || 0),
    };

    posts.push({
      title: strip(item.title),
      planid: item.planid,
      author: strip(item.author || ''),
      updateTime: item.updated || '',
      season: item.league ? `league-${item.league}` : '',
      url: `${API_ORIGIN}/planner#/plan/${item.planid}`,
      cardText: '',
      detail,
      className: classInfo.className,
      ascendancy: classInfo.ascendancy,
      mainSkill: getMainSkill(skillLines, item),
      skillLines,
      equipmentLines,
      tags,
      metrics,
      hotScore: metrics.views + metrics.likes * 50 + metrics.favorites * 100,
    });
  }

  return posts;
}

async function collectBuildCards(page) {
  return page.evaluate(() => {
    function strip(value) {
      return String(value || '').replace(/\r/g, '').replace(/[\t ]+/g, ' ').trim();
    }

    function parseCard(text, href) {
      const lines = String(text || '').split('\n').map(strip).filter(Boolean);
      const titleLine = lines.find(line => {
        if (/^(作者|更新时间|赛季|升级|攻坚|硬核模式|独狼模式)$/.test(line)) return false;
        if (/作者[：:]|更新时间[：:]|赛季[：:]/.test(line)) return false;
        return line.length >= 3 && line.length <= 80;
      }) || lines[0] || '';
      const authorMatch = text.match(/作者[：:]\s*([^|\n]+)/);
      const updateMatch = text.match(/更新时间[：:]\s*([^\n|]+)/);
      const seasonMatch = text.match(/赛季[：:]\s*([^\n|]+)/);
      return {
        title: strip(titleLine),
        author: authorMatch ? strip(authorMatch[1]) : '',
        updateTime: updateMatch ? strip(updateMatch[1]) : '',
        season: seasonMatch ? strip(seasonMatch[1]) : '',
        href: href || '',
        cardText: lines.join('\n'),
      };
    }

    const candidates = [];
    const nodes = Array.from(document.querySelectorAll('.cmg-bg-intro'));
    nodes.forEach(node => {
      const text = strip(node.innerText || '');
      if (text.length < 20 || text.length > 1200) return;
      const looksLikeBuild = /作者[：:].+更新时间[：:]|赛季[：:]/.test(text);
      if (!looksLikeBuild) return;
      const link = node.matches('a[href]') ? node : node.querySelector('a[href]');
      candidates.push(parseCard(text, link ? link.getAttribute('href') : ''));
    });

    return candidates.filter(item => item.title);
  });
}

async function fetchDetail(detailPage, url) {
  if (!url) return '';
  try {
    await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 2500));
    const text = await detailPage.evaluate(() => {
      const selectors = [
        'article',
        'main',
        '[class*="content"]',
        '[class*="detail"]',
        '[class*="post"]',
        '[class*="editor"]',
        'body',
      ];
      const blocks = selectors
        .flatMap(selector => Array.from(document.querySelectorAll(selector)))
        .map(node => node.innerText || '')
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      return blocks[0] || document.body.innerText || '';
    });
    return cleanBodyText(text);
  } catch (error) {
    console.warn(`  ⚠️  详情抓取失败: ${url} (${error.message})`);
    return '';
  }
}

function cleanOldAutoPosts() {
  if (!CLEAN || !fs.existsSync(INPUT_DIR)) return;
  fs.readdirSync(INPUT_DIR)
    .filter(name => /^caimogu-hot-bd-.*\.md$/i.test(name))
    .forEach(name => fs.unlinkSync(path.join(INPUT_DIR, name)));
}

async function crawlStarterHotPosts() {
  ensureDir(INPUT_DIR);
  cleanOldAutoPosts();

  const isHeadless = !args.includes('--headed') && process.env.STARTER_HOT_HEADLESS !== 'false';
  const browser = await puppeteer.launch({
    headless: isHeadless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

    console.log('🚀 抓取踩蘑菇热门 BD 帖候选');
    console.log(`   页面: ${TARGET_URL}`);
    console.log(`   数量: ${LIMIT}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    let posts = await collectBuildsFromApi(page);

    if (!posts.length) {
      for (let i = 0; i < 4; i += 1) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(resolve => setTimeout(resolve, 1200));
      }

      const rawCards = await collectBuildCards(page);
      const cards = uniqBy(rawCards, item => `${item.href || ''}|${item.title}|${item.author || ''}`).slice(0, LIMIT);
      const detailPage = await browser.newPage();
      posts = [];

      for (let i = 0; i < cards.length; i += 1) {
        const card = cards[i];
        const url = normalizeUrl(card.href, page.url());
        const metrics = parseMetrics(card.cardText);
        const tags = guessTags(`${card.title}\n${card.cardText}`);
        const shouldFetchDetail = !NO_DETAIL && url && i < DETAIL_LIMIT;
        const detailText = shouldFetchDetail ? await fetchDetail(detailPage, url) : '';
        const hotScore = metrics.views + metrics.replies * 80 + metrics.likes * 50 + metrics.favorites * 100;
        posts.push({
          ...card,
          url,
          metrics,
          tags,
          hotScore,
          detailText,
        });
      }
    }

    posts.forEach((post, index) => {
      console.log(`   ${index + 1}. ${post.title}${post.url ? ` - ${post.url}` : ''}`);
    });

    const files = posts.map((post, index) => {
      const fileName = `caimogu-hot-bd-${String(index + 1).padStart(2, '0')}-${slugify(post.title)}.md`;
      const filePath = path.join(INPUT_DIR, fileName);
      fs.writeFileSync(filePath, buildMarkdown(post), 'utf8');
      return {
        title: post.title,
        author: post.author,
        url: post.url,
        file: path.relative(ROOT, filePath).split(path.sep).join('/'),
      };
    });

    writeJson(MANIFEST_FILE, {
      schemaVersion: 1,
      source: TARGET_URL,
      fetchedAt: new Date().toISOString(),
      count: files.length,
      detailFetched: NO_DETAIL ? 0 : Math.min(files.length, DETAIL_LIMIT),
      files,
    });

    console.log(`✅ 已生成 ${files.length} 个 Agent 输入文件`);
    console.log(`   目录: ${path.relative(ROOT, INPUT_DIR)}`);
    console.log(`   清单: ${path.relative(ROOT, MANIFEST_FILE)}`);
    console.log('   下一步: npm run agent:starter:dev');
    return files;
  } finally {
    await browser.close();
  }
}

module.exports = { crawlStarterHotPosts };

if (require.main === module) {
  crawlStarterHotPosts().catch(error => {
    console.error('❌ 热门 BD 帖抓取失败:', error.message);
    if (process.env.DEBUG && error.stack) console.error(error.stack);
    process.exit(1);
  });
}
