const fs = require('fs');
const path = require('path');
const { SearchResult, SearchResultDictionary } = require('./ninja_search_proto');
const {
  translateBaseItem,
  translateClass,
  translateItemName,
  translateKeyPassive,
  translateSkill,
  translateStatText
} = require('./translations');
const { selectPrimaryChallengeLeague } = require('./league');

const API_ROOT = 'https://poe.ninja/poe1/api';
const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const outputDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const EQUIPMENT_LIMIT = 100;
const DETAIL_CONCURRENCY = 1;
const DETAIL_REQUEST_DELAY_MS = 900;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRY_AFTER_MS = 15000;
const SLOT_NAMES = {
  1: '头盔',
  2: '手套',
  3: '胸甲',
  4: '项链',
  5: '鞋子',
  6: '副手',
  7: '武器',
  8: '戒指',
  9: '戒指',
  10: '武器',
  11: '腰带',
  12: '珠宝',
  14: '药剂'
};

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`请求超时 ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, { headers: { 'user-agent': 'poe-season-helper/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetchWithTimeout(url, { headers: { 'user-agent': 'poe-season-helper/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getListValue(lists, id, index) {
  const value = lists.get(id)?.[index];
  if (!value) return null;
  if (value.str) return value.str;
  if (value.strs?.length) return value.strs;
  if (value.numbers?.length) return value.numbers;
  // Dictionary key 0 is valid. For list-backed scalar fields it should not be
  // discarded just because protobufjs represents it as the default value.
  return value.number;
}

function translateSkills(value, dictionary) {
  const indexes = Array.isArray(value) ? value : [];
  return indexes.map((index) => translateSkill(dictionary[index])).filter(Boolean);
}

function translateDictionaryList(value, dictionary, translator) {
  const indexes = Array.isArray(value) ? value : [];
  return indexes
    .map((index) => {
      const nameEn = dictionary[index];
      if (!nameEn) return null;
      return {
        name: translator(nameEn),
        nameEn
      };
    })
    .filter(Boolean);
}

function firstScalar(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function compactTextList(values, limit = 4) {
  return (values || [])
    .flatMap((value) => `${value || ''}`.split('\n'))
    .map((value) => value.trim())
    .filter(Boolean)
    .map(translateStatText)
    .slice(0, limit);
}

function compactProperties(properties, limit = 3) {
  return (properties || [])
    .map((item) => {
      const values = (item.values || []).map((value) => Array.isArray(value) ? value[0] : value).filter(Boolean);
      return translateStatText(values.length ? `${item.name}: ${values.join(' / ')}` : item.name);
    })
    .filter(Boolean)
    .slice(0, limit);
}

function compactSockets(item) {
  const socketedGems = new Map((item.socketedItems || []).map((gem) => [gem.socket, gem]));
  return (item.sockets || []).map((socket, index, sockets) => {
    const gem = socketedGems.get(index);
    return {
      index,
      group: socket.group,
      color: socket.sColour || socket.attr || '',
      linkedPrev: index > 0 && sockets[index - 1].group === socket.group,
      gem: gem ? {
        name: translateSkill(gem.baseType || gem.typeLine),
        nameEn: gem.baseType || gem.typeLine || '',
        icon: gem.icon || ''
      } : null
    };
  });
}

function compactItem(wrapper, section) {
  const item = wrapper?.itemData || wrapper;
  if (!item) return null;
  const nameEn = item.name || item.typeLine || item.baseType || '未命名装备';
  const typeLineEn = item.name ? item.typeLine : item.baseType;
  return {
    slot: SLOT_NAMES[wrapper?.itemSlot] || section || '装备',
    section,
    name: translateItemName(nameEn),
    nameEn,
    typeLine: translateBaseItem(typeLineEn),
    typeLineEn: typeLineEn || '',
    baseType: translateBaseItem(item.baseType),
    baseTypeEn: item.baseType || '',
    rarity: item.frameTypeId || '',
    icon: item.icon || '',
    corrupted: Boolean(item.corrupted),
    sockets: compactSockets(item),
    properties: compactProperties(item.properties),
    implicitMods: compactTextList(item.implicitMods, 3),
    explicitMods: compactTextList(item.explicitMods, 5)
  };
}

function compactSkillGroup(group, mainSkill) {
  const gems = (group.allGems || [])
    .map((gem, index) => {
      const nameEn = gem.name || gem.itemData?.baseType || gem.itemData?.typeLine || '';
      const name = translateSkill(nameEn);
      return {
        name,
        nameEn,
        icon: gem.itemData?.icon || '',
        level: gem.level || '',
        quality: gem.quality || '',
        isSupport: Boolean(gem.itemData?.support),
        isMain: index === 0 || name === mainSkill || nameEn === mainSkill
      };
    })
    .filter((gem) => gem.nameEn);
  if (!gems.length) return null;
  return {
    slot: SLOT_NAMES[group.itemSlot] || '技能',
    main: gems[0],
    gems: gems.slice(0, 8)
  };
}

function flattenSkillGems(skillGroups, mainSkill) {
  const seen = new Set();
  const gems = [];
  for (const group of skillGroups) {
    for (const gem of group.gems) {
      const key = gem.nameEn || gem.name;
      if (seen.has(key)) continue;
      seen.add(key);
      gems.push({
        ...gem,
        isMain: gem.isMain || gem.name === mainSkill || gem.nameEn === mainSkill
      });
    }
  }
  return gems.slice(0, 16);
}

function makeSourceUrl(league, account, character) {
  return `https://poe.ninja/poe1/builds/${league.url}/character/${encodeURIComponent(account)}/${encodeURIComponent(character)}`;
}

async function fetchCharacterDetail(snapshot, build) {
  const params = new URLSearchParams({
    account: build.account,
    name: build.character,
    overview: snapshot.snapshotName,
    type: snapshot.type || 'exp',
    timeMachine: ''
  });
  const url = `${API_ROOT}/builds/${snapshot.version}/character?${params.toString()}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchWithTimeout(url, { headers: { 'user-agent': 'poe-season-helper/1.0' } });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 3) throw new Error(`${response.status} ${url}`);
    const retryAfter = Number(response.headers.get('Retry-After'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * (attempt + 1);
    if (waitMs > MAX_RETRY_AFTER_MS) throw new Error(`429 限流等待过长，跳过详情`);
    console.warn(`   poe.ninja 限流，等待 ${Math.round(waitMs / 1000)} 秒后重试 ${build.character}`);
    await sleep(waitMs);
  }
  throw new Error(`详情读取失败 ${url}`);
}

function applyCharacterDetail(build, detail) {
  const equipment = (detail.items || []).map((item) => compactItem(item, '装备')).filter(Boolean);
  const flasks = (detail.flasks || []).map((item) => compactItem(item, '药剂')).filter(Boolean);
  const jewels = (detail.jewels || []).map((item) => compactItem(item, '珠宝')).filter(Boolean);
  const skillGroups = (detail.skills || []).map((group) => compactSkillGroup(group, build.mainSkill)).filter(Boolean);
  const skillGems = flattenSkillGems(skillGroups, build.mainSkill);
  const mainSkillIcon = skillGems.find((gem) => gem.isMain)?.icon || skillGems[0]?.icon || build.mainSkillIcon || '';
  return {
    ...build,
    mainSkillIcon,
    skillGems,
    skillGroups,
    equipment,
    flasks,
    jewels,
    itemCount: equipment.length + flasks.length + jewels.length
  };
}

async function enrichBuildDetails(builds, snapshot) {
  const enriched = builds.map((build) => ({ ...build, equipment: [], flasks: [], jewels: [], itemCount: 0 }));
  let cursor = 0;

  async function worker() {
    while (cursor < Math.min(enriched.length, EQUIPMENT_LIMIT)) {
      const index = cursor;
      cursor += 1;
      const build = enriched[index];
      try {
        const detail = await fetchCharacterDetail(snapshot, build);
        enriched[index] = applyCharacterDetail(build, detail);
        console.log(`   装备 ${index + 1}/${Math.min(enriched.length, EQUIPMENT_LIMIT)} ${build.character}: ${enriched[index].itemCount} 件`);
        await sleep(DETAIL_REQUEST_DELAY_MS);
      } catch (error) {
        console.warn(`   装备 ${index + 1}/${Math.min(enriched.length, EQUIPMENT_LIMIT)} ${build.character} 跳过: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
  return enriched;
}

function makeBuilds(result, dictionaries, league) {
  const lists = new Map(result.valueLists.map((list) => [list.id, list.values]));
  const classDictionary = dictionaries.get('class') || [];
  const gemDictionary = dictionaries.get('gem') || [];
  const keyPassiveDictionary = dictionaries.get('keypassive') || [];
  const limit = Math.min(lists.get('name')?.length || 0, 100);
  const builds = [];

  for (let index = 0; index < limit; index += 1) {
    const character = getListValue(lists, 'name', index);
    const account = getListValue(lists, 'account', index);
    const level = getListValue(lists, 'level', index);
    const classIndex = getListValue(lists, 'class', index);
    const skills = translateSkills(getListValue(lists, 'skills', index), gemDictionary);
    const keyPassives = translateDictionaryList(getListValue(lists, 'keypassives', index), keyPassiveDictionary, translateKeyPassive);
    // The public search result may include private/incomplete characters with
    // no indexed main skill. They are not useful for a "copy this build" list.
    if (!character || !account || !level || !skills.length) continue;

    const className = translateClass(classDictionary[classIndex]);
    const mainSkill = skills[0] || '未识别主技能';
    builds.push({
      id: `${account}-${character}`.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase(),
      rank: index + 1,
      character,
      account,
      level,
      className,
      classNameEn: classDictionary[classIndex] || '',
      mainSkill,
      skills: skills.slice(0, 5),
      keyPassives: keyPassives.slice(0, 10),
      stats: {
        life: firstScalar(getListValue(lists, 'life', index)),
        energyShield: firstScalar(getListValue(lists, 'energyshield', index)),
        effectiveHitPool: firstScalar(getListValue(lists, 'ehp', index)),
        dps: firstScalar(getListValue(lists, 'dps', index))
      },
      summary: `${league.displayName} 天梯第 ${index + 1} 名角色`,
      sourceUrl: makeSourceUrl(league, account, character)
    });
  }
  return builds;
}

function makePopularSkills(result, dictionaries) {
  const skillDimension = result.dimensions.find((dimension) => dimension.id === 'skills');
  const skills = dictionaries.get('gem') || [];
  if (!skillDimension) return [];
  return skillDimension.counts
    .map((item) => ({ name: translateSkill(skills[item.key]), nameEn: skills[item.key], count: item.count }))
    .filter((item) => item.nameEn && item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function getSkillIconMap(builds) {
  const iconMap = new Map();
  for (const build of builds) {
    for (const gem of build.skillGems || []) {
      if (gem.nameEn && gem.icon && !iconMap.has(gem.nameEn)) iconMap.set(gem.nameEn, gem.icon);
      if (gem.name && gem.icon && !iconMap.has(gem.name)) iconMap.set(gem.name, gem.icon);
    }
  }
  return iconMap;
}

async function getDictionaries(result) {
  const needed = result.dictionaries.filter((item) => item.id === 'class' || item.id === 'gem' || item.id === 'keypassive');
  const entries = await Promise.all(needed.map(async (item) => {
    const buffer = await fetchBuffer(`${API_ROOT}/builds/dictionary/${item.hash}`);
    return [item.id, SearchResultDictionary.decode(buffer).values];
  }));
  return new Map(entries);
}

async function buildDigest() {
  const indexState = await fetchJson(`${API_ROOT}/data/index-state`);
  const league = selectPrimaryChallengeLeague(indexState.buildLeagues, indexState.snapshotVersions);
  if (!league) throw new Error('未找到当前 POE1 赛季');
  const snapshot = indexState.snapshotVersions.find((item) => item.url === league.url && item.type === 'exp');
  if (!snapshot) throw new Error(`未找到 ${league.name} 的天梯快照`);

  const payload = await fetchBuffer(`${API_ROOT}/builds/${snapshot.version}/search?overview=${encodeURIComponent(snapshot.snapshotName)}`);
  const result = SearchResult.decode(payload).result;
  if (!result?.total) throw new Error('天梯搜索结果为空');
  const dictionaries = await getDictionaries(result);
  const builds = await enrichBuildDetails(makeBuilds(result, dictionaries, league), snapshot);
  const skillIconMap = getSkillIconMap(builds);
  const popularSkills = makePopularSkills(result, dictionaries).map((skill) => ({
    ...skill,
    icon: skillIconMap.get(skill.nameEn) || skillIconMap.get(skill.name) || ''
  }));
  const output = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: { name: 'poe.ninja POE1 Builds', url: `https://poe.ninja/builds/${league.url}` },
    league: { name: league.name, url: league.url, displayName: league.displayName },
    totalCharacters: result.total,
    builds,
    popularSkills
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'ladder_digest.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`✅ POE1 天梯摘要已生成: ${outputPath}`);
  console.log(`   赛季: ${league.name} | 样本: ${result.total} | 展示角色: ${builds.length}`);
  return output;
}

if (require.main === module) {
  buildDigest().catch((error) => {
    console.error('❌ POE1 天梯摘要生成失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildDigest, makeBuilds, makePopularSkills };
