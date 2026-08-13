#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_NAME = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';

const GAMES = {
  poe2: {
    id: 'poe2',
    name: '流放之路2：降临',
    shortName: 'POE2',
    dataDir: path.join(ROOT, 'translated-data', ENV_NAME),
    canonicalOssPrefix: `poe2/${ENV_NAME}/`,
    legacyOssPrefixes: [`poe2-ladders/${ENV_NAME}/`],
    miniprogram: 'daily-talk',
    files: {
      ladderAnalysis: 'ladder_analysis.json',
      ladderBuildIndex: 'miniprogram_data/ladder_build_index.json',
      economyDigest: 'miniprogram_data/economy_digest.json',
      internationalMarketCatalog: 'miniprogram_data/international_market_catalog.json',
      cnMarketDigest: 'miniprogram_data/cn_market_digest.json',
      dailyReturnDigest: 'miniprogram_data/daily_return_digest.json',
      followUpdates: 'miniprogram_data/follow_updates.json',
      problemGuides: 'miniprogram_data/problem_guides.json',
      problemGuidesManifest: 'miniprogram_data/problem_guides_manifest.json',
    },
  },
  poe1: {
    id: 'poe1',
    name: '流放之路',
    shortName: 'POE1',
    dataDir: path.join(ROOT, 'translated-data', 'poe1', ENV_NAME),
    canonicalOssPrefix: `poe1/${ENV_NAME}/`,
    legacyOssPrefixes: [`poe1-season/${ENV_NAME}/`],
    miniprogram: 'poe-mini',
    files: {
      ladderDigest: 'miniprogram_data/ladder_digest.json',
      economyDigest: 'miniprogram_data/economy_digest.json',
      cnEconomyDigest: 'miniprogram_data/cn_economy_digest.json',
      officialStarterBuilds: 'miniprogram_data/official_starter_builds.json',
      starterBuilds: 'miniprogram_data/starter_builds.json',
      starterTermsEnrichment: 'miniprogram_data/starter_terms_enrichment.json',
      storyGuide: 'miniprogram_data/story_guide.json',
    },
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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function relativeToRoot(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function statFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return {
    path: relativeToRoot(filePath),
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

function countFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(dirPath)) {
    if (name === '.DS_Store') continue;
    const filePath = path.join(dirPath, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) count += countFiles(filePath);
    else count += 1;
  }
  return count;
}

function arrayLength(data, keys = []) {
  if (Array.isArray(data)) return data.length;
  for (const key of keys) {
    if (Array.isArray(data && data[key])) return data[key].length;
  }
  if (data && data.summary && Number.isFinite(Number(data.summary.itemCount))) return Number(data.summary.itemCount);
  if (data && data.summary && Number.isFinite(Number(data.summary.selectedItemCount))) return Number(data.summary.selectedItemCount);
  if (data && Number.isFinite(Number(data.totalPlayers))) return Number(data.totalPlayers);
  if (data && Number.isFinite(Number(data.totalCharacters))) return Number(data.totalCharacters);
  return 0;
}

function summarizeKnownFile(config, key, relativePath) {
  const filePath = path.join(config.dataDir, relativePath);
  const info = statFile(filePath);
  const data = info ? readJson(filePath, null) : null;
  return {
    key,
    path: relativePath,
    exists: Boolean(info),
    size: info ? info.size : 0,
    updatedAt: info ? info.updatedAt : '',
    count: data ? arrayLength(data, ['items', 'builds', 'skills', 'equipment', 'guides', 'categories']) : 0,
  };
}

function createPoe2Summary(config) {
  const ladderAnalysis = readJson(path.join(config.dataDir, 'ladder_analysis.json'), {});
  const ladderBuildIndex = readJson(path.join(config.dataDir, 'miniprogram_data/ladder_build_index.json'), {});
  const economyDigest = readJson(path.join(config.dataDir, 'miniprogram_data/economy_digest.json'), {});
  const cnMarketDigest = readJson(path.join(config.dataDir, 'miniprogram_data/cn_market_digest.json'), {});
  const problemGuides = readJson(path.join(config.dataDir, 'miniprogram_data/problem_guides.json'), {});

  return {
    seasonName: economyDigest.league?.displayName || economyDigest.league?.name || cnMarketDigest.game?.league || '',
    updatedAt: [
      ladderAnalysis.updateTime,
      ladderBuildIndex.updatedAt,
      economyDigest.updatedAt,
      cnMarketDigest.updatedAt,
    ].filter(Boolean).sort().pop() || '',
    ladder: {
      players: Number(ladderAnalysis.totalPlayers || ladderBuildIndex.totalPlayers || 0),
      sampledPlayers: Number(ladderAnalysis.sampledPlayers || 0),
      classes: Array.isArray(ladderAnalysis.classDistribution) ? ladderAnalysis.classDistribution.length : 0,
      skills: Array.isArray(ladderBuildIndex.skills) ? ladderBuildIndex.skills.length : 0,
      equipment: Array.isArray(ladderBuildIndex.equipment) ? ladderBuildIndex.equipment.length : 0,
    },
    economy: {
      internationalItems: Number(economyDigest.summary?.selectedItemCount || economyDigest.summary?.itemCount || 0),
      cnItems: Number(cnMarketDigest.summary?.availableCount || 0),
      coreRate: economyDigest.coreRates?.divineToExalted ? `1D≈${economyDigest.coreRates.divineToExalted}E` : '',
    },
    guides: {
      problemGuides: Array.isArray(problemGuides.items) ? problemGuides.items.length : 0,
    },
  };
}

function createPoe1Summary(config) {
  const ladderDigest = readJson(path.join(config.dataDir, 'miniprogram_data/ladder_digest.json'), {});
  const economyDigest = readJson(path.join(config.dataDir, 'miniprogram_data/economy_digest.json'), {});
  const cnEconomyDigest = readJson(path.join(config.dataDir, 'miniprogram_data/cn_economy_digest.json'), {});
  const officialStarterBuilds = readJson(path.join(config.dataDir, 'miniprogram_data/official_starter_builds.json'), {});
  const starterBuilds = readJson(path.join(config.dataDir, 'miniprogram_data/starter_builds.json'), {});
  const storyGuide = readJson(path.join(config.dataDir, 'miniprogram_data/story_guide.json'), {});

  return {
    seasonName: cnEconomyDigest.league?.displayName || economyDigest.league?.displayName || ladderDigest.league?.displayName || '',
    updatedAt: [
      ladderDigest.updatedAt,
      economyDigest.updatedAt,
      cnEconomyDigest.updatedAt,
      officialStarterBuilds.updatedAt,
    ].filter(Boolean).sort().pop() || '',
    ladder: {
      players: Number(ladderDigest.totalCharacters || 0),
      sampledPlayers: Array.isArray(ladderDigest.builds) ? ladderDigest.builds.length : 0,
      classes: new Set((Array.isArray(ladderDigest.builds) ? ladderDigest.builds : []).map(item => item.className).filter(Boolean)).size,
      skills: Array.isArray(ladderDigest.popularSkills) ? ladderDigest.popularSkills.length : 0,
      equipment: 0,
    },
    economy: {
      internationalItems: Number(economyDigest.core?.length || 0),
      cnItems: Number(cnEconomyDigest.core?.length || 0),
      coreRate: cnEconomyDigest.exchange?.label || economyDigest.exchange?.label || '',
    },
    guides: {
      officialStarterBuilds: arrayLength(officialStarterBuilds, ['builds', 'items']),
      starterBuilds: arrayLength(starterBuilds, ['builds', 'items']),
      storyChapters: arrayLength(storyGuide, ['chapters']),
    },
  };
}

function createManifest(gameId) {
  const config = GAMES[gameId];
  if (!config) throw new Error(`未知游戏: ${gameId}`);
  const miniprogramDir = path.join(config.dataDir, 'miniprogram_data');
  const fileEntries = Object.entries(config.files).map(([key, relativePath]) => summarizeKnownFile(config, key, relativePath));
  const manifest = {
    schemaVersion: 1,
    game: config.id,
    gameName: config.name,
    shortName: config.shortName,
    env: ENV_NAME,
    miniprogram: config.miniprogram,
    generatedAt: new Date().toISOString(),
    localDataDir: relativeToRoot(config.dataDir),
    canonicalOssPrefix: config.canonicalOssPrefix,
    legacyOssPrefixes: config.legacyOssPrefixes,
    miniprogramDataPrefix: `${config.canonicalOssPrefix}miniprogram_data/`,
    summary: gameId === 'poe2' ? createPoe2Summary(config) : createPoe1Summary(config),
    files: Object.fromEntries(fileEntries.map(item => [item.key, item.path])),
    health: {
      status: fileEntries.some(item => !item.exists) ? 'warn' : 'ok',
      exists: fs.existsSync(config.dataDir),
      fileCount: countFiles(config.dataDir),
      miniprogramFileCount: countFiles(miniprogramDir),
      missingFiles: fileEntries.filter(item => !item.exists).map(item => item.key),
      knownFiles: fileEntries,
    },
  };

  writeJson(path.join(config.dataDir, 'game_manifest.json'), manifest);
  writeJson(path.join(config.dataDir, 'miniprogram_data', 'manifest.json'), manifest);
  return manifest;
}

function createRegistryEntry(manifest) {
  return {
    game: manifest.game,
    gameName: manifest.gameName,
    shortName: manifest.shortName,
    canonicalOssPrefix: manifest.canonicalOssPrefix,
    legacyOssPrefixes: manifest.legacyOssPrefixes,
    manifestPath: `${manifest.canonicalOssPrefix}miniprogram_data/manifest.json`,
    localDataDir: manifest.localDataDir,
    summary: manifest.summary,
    health: {
      status: manifest.health.status,
      fileCount: manifest.health.fileCount,
      miniprogramFileCount: manifest.health.miniprogramFileCount,
      missingFiles: manifest.health.missingFiles,
    },
  };
}

function buildGameManifests(gameIds = Object.keys(GAMES)) {
  const manifests = gameIds.map(createManifest);
  const registryPath = path.join(ROOT, 'translated-data', `manifest.${ENV_NAME}.json`);
  const previousRegistry = readJson(registryPath, { games: [] });
  const entriesByGame = new Map((previousRegistry.games || []).map(entry => [entry.game, entry]));
  manifests.forEach(manifest => {
    entriesByGame.set(manifest.game, createRegistryEntry(manifest));
  });
  const registry = {
    schemaVersion: 1,
    env: ENV_NAME,
    generatedAt: new Date().toISOString(),
    games: Object.keys(GAMES).map(gameId => entriesByGame.get(gameId)).filter(Boolean),
  };
  writeJson(registryPath, registry);
  return { registry, manifests };
}

if (require.main === module) {
  const gameArg = process.argv.find(arg => arg.startsWith('--game='));
  const gameIds = gameArg ? gameArg.slice('--game='.length).split(',').map(item => item.trim()).filter(Boolean) : Object.keys(GAMES);
  const { registry, manifests } = buildGameManifests(gameIds);
  console.log(`✅ 游戏 manifest 已生成: ${manifests.map(item => item.game).join(', ')}`);
  console.log(`   环境: ${registry.env}`);
  manifests.forEach(manifest => {
    console.log(`   - ${manifest.shortName}: ${manifest.health.miniprogramFileCount} 个小程序数据文件，缺失 ${manifest.health.missingFiles.length} 项`);
  });
}

module.exports = {
  GAMES,
  buildGameManifests,
  createManifest,
};
