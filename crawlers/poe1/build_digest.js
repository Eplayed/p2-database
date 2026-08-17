const fs = require('fs');
const path = require('path');
const {
  translateBaseItem,
  translateClass,
  translateItemName,
  translateKeyPassive,
  translateSkill,
  translateStatText
} = require('./translations');

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const outputDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const QQ_ROOT = 'https://poe.qq.com/act/a202010118poena';
const DEFAULT_SEASON = process.env.POE1_SEASON || 's29_normal';
const NEXT_SEASON = process.env.POE1_NEXT_SEASON || 's30_normal';
const NEXT_SEASON_START = new Date(process.env.POE1_NEXT_SEASON_START || '2026-07-31T10:00:00+08:00').getTime();
const DETAIL_LIMIT = Number(process.env.POE1_DETAIL_LIMIT || 100);
const DETAIL_CONCURRENCY = Number(process.env.POE1_DETAIL_CONCURRENCY || 2);
const DETAIL_REQUEST_DELAY_MS = Number(process.env.POE1_DETAIL_DELAY_MS || 250);
const REQUEST_TIMEOUT_MS = 20000;
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
  13: '副手',
  14: '药剂'
};
const SEASON_LABELS = {
  s29_normal: '费西亚的遗产',
  s30_normal: '永火之咒'
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

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    headers: {
      'user-agent': 'poe-season-helper/1.0',
      referer: `${QQ_ROOT}/challenge/index.html`
    },
    ...options
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function tryFetchJson(url) {
  try {
    return await fetchJson(url);
  } catch (error) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPreferredSnapshotName() {
  if (Date.now() >= NEXT_SEASON_START) return NEXT_SEASON;
  return DEFAULT_SEASON;
}

async function fetchRankInfo() {
  const preferred = getPreferredSnapshotName();
  const candidates = Array.from(new Set([preferred, DEFAULT_SEASON, 's29_normal']));
  for (const snapshotName of candidates) {
    const url = `${QQ_ROOT}/js/rankinfo_${encodeURIComponent(snapshotName)}.json`;
    const data = await tryFetchJson(url);
    if (data && Array.isArray(data.names) && Array.isArray(data.accounts)) {
      return { snapshotName, url, data };
    }
    console.warn(`   国服天梯快照暂不可用: ${snapshotName}`);
  }
  throw new Error('未找到可用的国服天梯快照');
}

function djb2Hash(value) {
  const text = String(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (((hash << 5) - hash) + text.charCodeAt(index)) & 0xFFFFFFFF;
  }
  hash >>>= 0;
  return (`00000000${hash.toString(16)}`).slice(-8);
}

function makeBuildId(account, character) {
  return `${account}-${character}`.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').toLowerCase();
}

function getArrayValue(values, index, fallback = null) {
  return Array.isArray(values) && values[index] !== undefined ? values[index] : fallback;
}

function normalizeText(value) {
  return `${value || ''}`.replace(/\r/g, '').trim();
}

function compactTextList(values, limit = 4) {
  return (values || [])
    .flatMap((value) => normalizeText(value).split('\n'))
    .map((value) => translateStatText(value.trim()))
    .filter(Boolean)
    .slice(0, limit);
}

function compactProperties(properties, limit = 4) {
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
      color: socket.sColour || socket.attr || socket.colour || '',
      linkedPrev: index > 0 && sockets[index - 1].group === socket.group,
      gem: gem ? {
        name: translateSkill(gem.baseType || gem.typeLine || gem.name),
        nameEn: gem.baseType || gem.typeLine || gem.name || '',
        icon: gem.icon || ''
      } : null
    };
  });
}

function compactItem(wrapper, section) {
  const item = wrapper?.itemData || wrapper;
  if (!item) return null;
  const nameRaw = normalizeText(item.name || item.typeLine || item.baseType || '未命名装备');
  const typeLineRaw = normalizeText(item.name ? item.typeLine : item.baseType);
  return {
    slot: SLOT_NAMES[wrapper?.itemSlot] || section || '装备',
    section,
    name: translateItemName(nameRaw),
    nameEn: nameRaw,
    typeLine: translateBaseItem(typeLineRaw),
    typeLineEn: typeLineRaw || '',
    baseType: translateBaseItem(item.baseType),
    baseTypeEn: item.baseType || '',
    rarity: item.frameTypeId || item.frameType || '',
    icon: item.icon || '',
    corrupted: Boolean(item.corrupted),
    sockets: compactSockets(item),
    properties: compactProperties(item.properties),
    implicitMods: compactTextList(item.implicitMods, 4),
    explicitMods: compactTextList(item.explicitMods, 6)
  };
}

function gemName(gem) {
  return normalizeText(gem?.name || gem?.itemData?.baseType || gem?.itemData?.typeLine);
}

function gemIcon(gem) {
  return gem?.itemData?.icon || '';
}

function compactSkillGroup(group, mainSkill) {
  const mainGems = Array.isArray(group.gem) && group.gem.length ? group.gem : [];
  const supportGems = Array.isArray(group.supportGems) ? group.supportGems : [];
  const allGems = mainGems.length || supportGems.length ? [...mainGems, ...supportGems] : (group.allGems || []);
  const gems = allGems
    .map((gem, index) => {
      const nameEn = gemName(gem);
      const name = translateSkill(nameEn);
      return {
        name,
        nameEn,
        icon: gemIcon(gem),
        level: gem.level || '',
        quality: gem.quality || '',
        isSupport: Boolean(gem.itemData?.support || /（辅）|\(辅\)|Support/i.test(nameEn)),
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
  return gems.slice(0, 18);
}

function pickMainSkillFromDetail(detail, fallback) {
  const groups = Array.isArray(detail.skills) ? detail.skills : [];
  const dpsSkills = groups
    .flatMap((group) => group.dps || [])
    .filter((item) => item.name && Number(item.dps) > 0)
    .sort((a, b) => Number(b.dps || 0) - Number(a.dps || 0));
  if (dpsSkills[0]?.name) return translateSkill(dpsSkills[0].name);
  const mainGem = groups.flatMap((group) => group.gem || []).map(gemName).find(Boolean);
  return translateSkill(mainGem || fallback);
}

function compactKeyPassives(build, detail) {
  const keyStones = Array.isArray(detail.keyStones) ? detail.keyStones : [];
  if (!keyStones.length) return build.keyPassives || [];
  return keyStones.map((passive) => ({
    name: translateKeyPassive(passive.name),
    nameEn: passive.name || '',
    icon: passive.icon || '',
    type: 'Keystone',
    typeLabel: '关键天赋',
    stats: compactTextList(passive.stats, 5)
  }));
}

function makeSourceUrl(snapshotName, account, character) {
  return `${QQ_ROOT}/challenge/index.html?season=${encodeURIComponent(snapshotName)}&account=${encodeURIComponent(account)}&character=${encodeURIComponent(character)}`;
}

async function fetchCharacterDetail(snapshotName, build) {
  const hash = djb2Hash(`${build.account}_${build.character}`);
  const url = `${QQ_ROOT}/js/char/${encodeURIComponent(snapshotName)}/${hash}.json`;
  return fetchJson(url);
}

function makeInitialBuilds(rankInfo, snapshotName) {
  const limit = Math.min(rankInfo.names.length, 300);
  const builds = [];
  for (let index = 0; index < limit; index += 1) {
    const character = getArrayValue(rankInfo.names, index, '');
    const account = getArrayValue(rankInfo.accounts, index, '');
    if (!character || !account) continue;
    const classNameEn = rankInfo.classNames[getArrayValue(rankInfo.classes, index, -1)] || '';
    const activeSkillIndexes = Array.from(new Set(getArrayValue(rankInfo.activeSkillUse, index, [])));
    const skills = activeSkillIndexes
      .map((skillIndex) => rankInfo.activeSkills[skillIndex])
      .filter(Boolean)
      .map((skill) => translateSkill(skill.name));
    const mainSkillData = activeSkillIndexes.map((skillIndex) => rankInfo.activeSkills[skillIndex]).find(Boolean);
    const rank = Number(getArrayValue(rankInfo.ladderRanks, index, index + 1));
    builds.push({
      id: makeBuildId(account, character),
      rank: Number.isFinite(rank) ? rank : index + 1,
      character,
      account,
      level: Number(getArrayValue(rankInfo.levels, index, 0)) || 0,
      className: translateClass(classNameEn),
      classNameEn,
      leagueName: SEASON_LABELS[snapshotName] || snapshotName,
      mainSkill: translateSkill(mainSkillData?.name || skills[0] || ''),
      mainSkillEn: mainSkillData?.name || '',
      mainSkillIcon: mainSkillData?.icon || '',
      skills: skills.slice(0, 6),
      keyPassives: [],
      stats: {
        life: getArrayValue(rankInfo.life, index),
        energyShield: getArrayValue(rankInfo.energyShield, index),
        mana: getArrayValue(rankInfo.mana, index),
        armour: getArrayValue(rankInfo.armour, index),
        evasionRating: getArrayValue(rankInfo.evasionRating, index),
        fireResist: getArrayValue(rankInfo.fireResist, index),
        coldResist: getArrayValue(rankInfo.coldResist, index),
        lightningResist: getArrayValue(rankInfo.lightningResist, index),
        chaosResist: getArrayValue(rankInfo.chaosResist, index),
        movementSpeed: getArrayValue(rankInfo.movementSpeed, index),
        effectiveHitPool: getArrayValue(rankInfo.totalEHP, index),
        maxHitPhysical: getArrayValue(rankInfo.maxHitPhysical, index)
      },
      summary: `国服天梯第 ${Number.isFinite(rank) ? rank : index + 1} 名角色`,
      sourceUrl: makeSourceUrl(snapshotName, account, character)
    });
  }
  return builds.sort((a, b) => a.rank - b.rank);
}

function applyCharacterDetail(build, detail) {
  const mainSkill = pickMainSkillFromDetail(detail, build.mainSkill);
  const equipment = (detail.items || []).map((item) => compactItem(item, '装备')).filter(Boolean);
  const flasks = (detail.flasks || []).map((item) => compactItem(item, '药剂')).filter(Boolean);
  const jewels = (detail.jewels || []).map((item) => compactItem(item, '珠宝')).filter(Boolean);
  const skillGroups = (detail.skills || []).map((group) => compactSkillGroup(group, mainSkill)).filter(Boolean);
  const skillGems = flattenSkillGems(skillGroups, mainSkill);
  const mainSkillGem = skillGems.find((gem) => gem.isMain) || skillGems[0];
  const passiveSelection = Array.isArray(detail.passiveSelection) ? detail.passiveSelection : [];
  const keyPassives = compactKeyPassives(build, detail);
  const detailSections = {
    equipment: equipment.length + flasks.length + jewels.length,
    skills: skillGroups.length || skillGems.length || (Array.isArray(build.skills) ? build.skills.length : 0),
    passives: keyPassives.length,
    passiveTree: Boolean(detail.passiveTreeImage || detail.passiveTreeUrl || passiveSelection.length)
  };
  return {
    ...build,
    level: Number(detail.level || build.level) || build.level,
    className: translateClass(detail.class || build.classNameEn),
    classNameEn: detail.class || build.classNameEn,
    leagueName: build.leagueName || detail.league || '',
    mainSkill,
    mainSkillEn: mainSkillGem?.nameEn || build.mainSkillEn || mainSkill,
    mainSkillIcon: mainSkillGem?.icon || build.mainSkillIcon || '',
    skills: skillGems.filter((gem) => !gem.isSupport).map((gem) => gem.name).slice(0, 6),
    skillGems,
    skillGroups,
    equipment,
    flasks,
    jewels,
    keyPassives,
    passiveNodeCount: passiveSelection.length,
    passiveTreeName: '国服天赋树',
    passiveTreeUrl: detail.passiveTreeUrl || '',
    passiveTreeImage: detail.passiveTreeImage || '',
    sourceUrl: detail.passiveTreeUrl || build.sourceUrl,
    hasPathOfBuilding: Boolean(detail.pathOfBuildingExport),
    itemCount: equipment.length + flasks.length + jewels.length,
    detailAvailable: detailSections.equipment > 0 || detailSections.skills > 0 || keyPassives.length > 0 || detailSections.passiveTree,
    detailSections
  };
}

async function enrichBuildDetails(builds, snapshotName) {
  const enriched = builds.map((build) => ({
    ...build,
    equipment: [],
    flasks: [],
    jewels: [],
    itemCount: 0,
    detailAvailable: false,
    detailSections: { equipment: 0, skills: Array.isArray(build.skills) ? build.skills.length : 0, passives: 0, passiveTree: false }
  }));
  const total = Math.min(enriched.length, DETAIL_LIMIT);
  let cursor = 0;

  async function worker() {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      const build = enriched[index];
      try {
        const detail = await fetchCharacterDetail(snapshotName, build);
        enriched[index] = applyCharacterDetail(build, detail);
        console.log(`   详情 ${index + 1}/${total} ${build.character}: ${enriched[index].itemCount} 件`);
      } catch (error) {
        console.warn(`   详情 ${index + 1}/${total} ${build.character} 跳过: ${error.message}`);
      }
      if (DETAIL_REQUEST_DELAY_MS > 0) await sleep(DETAIL_REQUEST_DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, DETAIL_CONCURRENCY) }, worker));
  return enriched;
}

function makePopularSkills(rankInfo) {
  const counter = new Map();
  for (const skills of rankInfo.activeSkillUse || []) {
    for (const skillIndex of new Set(skills || [])) {
      const skill = rankInfo.activeSkills[skillIndex];
      if (!skill?.name) continue;
      const current = counter.get(skill.name) || { name: translateSkill(skill.name), nameEn: skill.name, icon: skill.icon || '', count: 0 };
      current.count += 1;
      if (!current.icon && skill.icon) current.icon = skill.icon;
      counter.set(skill.name, current);
    }
  }
  return Array.from(counter.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function makeLeague(snapshotName, rankInfo) {
  const displayName = SEASON_LABELS[snapshotName] || SEASON_LABELS[rankInfo.season] || rankInfo.season || snapshotName;
  return {
    name: rankInfo.season || snapshotName,
    url: snapshotName,
    displayName
  };
}

async function buildDigest() {
  const { snapshotName, url, data: rankInfo } = await fetchRankInfo();
  const league = makeLeague(snapshotName, rankInfo);
  const builds = await enrichBuildDetails(makeInitialBuilds(rankInfo, snapshotName), snapshotName);
  const output = {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    source: { name: '国服官方天梯', url: `${QQ_ROOT}/challenge/index.html`, dataUrl: url },
    league,
    totalCharacters: rankInfo.total || builds.length,
    snapshotName,
    generatedAt: rankInfo.generatedAt || '',
    builds,
    popularSkills: makePopularSkills(rankInfo)
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'ladder_digest.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`✅ POE1 国服天梯摘要已生成: ${outputPath}`);
  console.log(`   赛季: ${league.displayName} (${snapshotName}) | 样本: ${output.totalCharacters} | 展示角色: ${builds.length}`);
  return output;
}

if (require.main === module) {
  buildDigest().catch((error) => {
    console.error('❌ POE1 国服天梯摘要生成失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildDigest, makeInitialBuilds, makePopularSkills, djb2Hash };
