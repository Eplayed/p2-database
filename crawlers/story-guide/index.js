const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '../../auto_browser/.env') });
const envConfig = require('../../auto_browser/env-config');

const SOURCE_URL = 'https://www.poe2ggg.com/modules/poe2_deep/library.html?feedView=story&postType=storyGuide';
const API_URL = 'https://www.poe2ggg.com/api/story-guides/public?page=1&limit=50';
const OUTPUT_NAME = 'story_guides.json';
const OUTPUT_DIR = path.join(envConfig.dataDir, 'miniprogram_data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, OUTPUT_NAME);

const OSS_CONFIG = {
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET || 'poe2-all-class',
};

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `https://www.poe2ggg.com${raw}`;
  if (raw.startsWith('../../')) return `https://www.poe2ggg.com/${raw.replace(/^(\.\.\/)+/, '')}`;
  return `https://www.poe2ggg.com/modules/poe2_deep/${raw.replace(/^\.\//, '')}`;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function stripText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toSimplifiedZh(value) {
  const map = {
    '營': '营', '區': '区', '個': '个', '點': '点', '擊': '击', '對': '对', '門': '门', '會': '会',
    '開': '开', '關': '关', '體': '体', '試': '试', '獲': '获', '聖': '圣', '殘': '残', '鎮': '镇',
    '領': '领', '費': '费', '藥': '药', '劑': '剂', '繫': '系', '縛': '缚', '陰': '阴', '離': '离',
    '寶': '宝', '獻': '献', '寶': '宝', '復': '复', '傷': '伤', '彈': '弹', '護': '护', '祕': '秘',
    '靈': '灵', '學': '学', '術': '术', '級': '级', '屬': '属', '電': '电', '閃': '闪', '樣': '样',
    '顯': '显', '數': '数', '據': '据', '終': '终', '後': '后', '戰': '战', '圖': '图', '標': '标',
    '順': '顺', '劇': '剧', '歷': '历', '傳': '传', '義': '义', '亞': '亚', '爾': '尔', '盜': '盗',
    '塢': '坞', '國': '国', '務': '务', '寶': '宝', '庫': '库', '華': '华', '來': '来', '臺': '台',
  };
  return stripText(value).replace(/[^\x00-\x7F]/g, char => map[char] || char);
}

function richTextToLines(contentRich) {
  if (!Array.isArray(contentRich)) return [];
  return contentRich
    .map(segment => {
      if (typeof segment === 'string') return stripText(segment);
      return stripText(segment && (segment.text || segment.content || segment.value || segment.label));
    })
    .filter(Boolean);
}

function splitRewardText(text) {
  return stripText(text)
    .split(/[\n；;]+/)
    .map(item => toSimplifiedZh(item))
    .filter(Boolean);
}

function normalizePoint(point, routeMap) {
  const id = String(point && point.id || '');
  const route = routeMap.get(id) || null;
  const pointRewards = splitRewardText(point && point.description);
  const routeTips = [
    ...splitRewardText(route && route.content),
    ...richTextToLines(route && route.contentRich),
  ];

  return {
    id,
    label: toSimplifiedZh(point && point.label) || id,
    name: toSimplifiedZh(point && (point.name || point.officialName)) || id,
    x: toNumber(point && point.x, 50),
    y: toNumber(point && point.y, 50),
    type: pointRewards.length ? 'reward' : 'main',
    rewards: pointRewards,
    tips: routeTips,
    nextPointId: route && route.toId ? String(route.toId) : '',
    nextPointName: route && route.toLabel ? toSimplifiedZh(route.toLabel) : '',
    buildTitle: route && route.buildSnapshot ? toSimplifiedZh(route.buildSnapshot.title || route.buildSnapshot.characterName) : '',
  };
}

function buildRouteMap(routes) {
  const map = new Map();
  (Array.isArray(routes) ? routes : []).forEach((route, index) => {
    const fromId = String(route && (route.fromId || route.pointId) || '');
    if (!fromId) return;
    map.set(fromId, { ...route, order: index + 1 });
  });
  return map;
}

function normalizeGuide(item) {
  const routeMap = buildRouteMap(item && item.routes);
  const included = new Set(Array.isArray(item && item.includedChapterIds) ? item.includedChapterIds.map(String) : []);
  const chapters = (Array.isArray(item && item.chapters) ? item.chapters : [])
    .filter(chapter => !included.size || included.has(String(chapter && chapter.id)))
    .map((chapter, index) => ({
      id: String(chapter && chapter.id || `chapter-${index + 1}`),
      chapterNumber: toNumber(chapter && chapter.chapterNumber, index + 1),
      title: toSimplifiedZh(chapter && chapter.title) || `第 ${index + 1} 章`,
      imageUrl: normalizeUrl(chapter && chapter.imageUrl),
      points: (Array.isArray(chapter && chapter.points) ? chapter.points : [])
        .map(point => normalizePoint(point, routeMap))
        .filter(point => point.id),
    }))
    .filter(chapter => chapter.imageUrl && chapter.points.length);

  return {
    id: String(item && item.id || ''),
    title: toSimplifiedZh(item && item.title) || '剧情开荒攻略',
    description: toSimplifiedZh(item && item.description),
    authorName: toSimplifiedZh(item && item.authorName) || '未知作者',
    seasonKey: String(item && item.seasonKey || ''),
    modeKey: String(item && item.modeKey || ''),
    className: toSimplifiedZh(item && item.className),
    classKey: String(item && item.classKey || ''),
    classImage: normalizeUrl(item && item.classImage),
    updateTime: String(item && (item.updateTime || item.displayTime || item.uploadTime) || ''),
    hotScore: toNumber(item && item.hotScore),
    viewCount: toNumber(item && item.viewCount),
    chapters,
  };
}

async function fetchStoryGuides() {
  const response = await fetch(API_URL, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 p2-database story-guide crawler',
    },
  });
  if (!response.ok) throw new Error(`请求失败: ${response.status} ${response.statusText}`);
  const body = await response.json();
  const items = body && body.data && Array.isArray(body.data.items) ? body.data.items : [];
  if (!items.length) throw new Error('接口没有返回剧情攻略数据');
  return items.map(normalizeGuide).filter(item => item.id && item.chapters.length);
}

function sortGuides(guides) {
  return guides.slice().sort((a, b) => {
    const timeDiff = Date.parse(b.updateTime || '') - Date.parse(a.updateTime || '');
    if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
    return (b.hotScore || 0) - (a.hotScore || 0);
  });
}

async function uploadIfNeeded(filePath) {
  if (!process.argv.includes('--upload')) return;
  if (!OSS_CONFIG.accessKeyId || !OSS_CONFIG.accessKeySecret || !OSS_CONFIG.bucket) {
    console.warn('OSS 配置不完整，跳过上传');
    return;
  }
  const client = new OSS(OSS_CONFIG);
  const remotePath = `${envConfig.ossPath}miniprogram_data/${OUTPUT_NAME}`;
  await client.put(remotePath, filePath, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'max-age=300',
    },
  });
  console.log(`已上传 OSS: ${remotePath}`);
}

async function main() {
  console.log(`剧情攻略抓取环境: ${envConfig.isProd ? 'release' : 'dev'}`);
  const guides = sortGuides(await fetchStoryGuides());
  const payload = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: {
      name: 'poe2ggg 剧情攻略',
      url: SOURCE_URL,
      api: API_URL,
      checkedAt: new Date().toISOString(),
      confidence: 'medium',
    },
    guides,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`已生成: ${OUTPUT_PATH}`);
  console.log(`攻略数: ${guides.length}`);
  console.log(`章节数: ${guides.reduce((sum, guide) => sum + guide.chapters.length, 0)}`);
  await uploadIfNeeded(OUTPUT_PATH);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { fetchStoryGuides, normalizeGuide };
