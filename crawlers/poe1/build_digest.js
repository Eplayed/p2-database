const fs = require('fs');
const path = require('path');
const { SearchResult, SearchResultDictionary } = require('./ninja_search_proto');
const { translateClass, translateKeyPassive, translateSkill } = require('./translations');
const { selectPrimaryChallengeLeague } = require('./league');

const API_ROOT = 'https://poe.ninja/poe1/api';
const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const outputDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'poe-season-helper/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'poe-season-helper/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
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
      sourceUrl: `https://poe.ninja/builds/${league.url}/character/${encodeURIComponent(account)}/${encodeURIComponent(character)}`
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
  const builds = makeBuilds(result, dictionaries, league);
  const output = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: { name: 'poe.ninja POE1 Builds', url: `https://poe.ninja/builds/${league.url}` },
    league: { name: league.name, url: league.url, displayName: league.displayName },
    totalCharacters: result.total,
    builds,
    popularSkills: makePopularSkills(result, dictionaries)
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
