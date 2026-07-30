const fs = require('fs');
const path = require('path');

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const sourcePath = path.join(__dirname, '../../base-data/poe1/starter_builds_source.json');
const ladderPath = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data/ladder_digest.json');
const outputDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const outputPath = path.join(outputDir, 'starter_terms_enrichment.json');
const baseOutputPath = path.join(__dirname, '../../base-data/poe1/starter_terms_enrichment.json');

const SKILL_SECTION_KEYS = new Set(['skills', 'leveling']);
const EQUIPMENT_SECTION_KEYS = new Set(['equipment', 'mechanics']);
const PASSIVE_SECTION_KEYS = new Set(['passives', 'ascendancy']);
const NOISE_WORDS = new Set([
  'BD', 'Boss', 'POB', 'DPS', 'A', 'B', 'T16', 'POE', 'POE1',
  'Act', 'Map', 'Maps', 'Level', 'Lv', 'Mana', 'Life', 'ES'
]);
const NOISE_ZH = new Set([
  '自动', '持续时间', '生命偷取', '击中印记', '动量冲锋', '主技能', '副技能',
  '光环', '位移技能', '防御技能', '诅咒', '前期', '后期', '过渡', '核心', '推荐'
]);

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[·・'’`:\-\s_]/g, '')
    .replace(/[^\da-z\u4e00-\u9fa5]/g, '')
    .trim();
}

function normalizeEnglish(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/support gem$/i, '')
    .replace(/\s+support$/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function cleanChineseTerm(value) {
  const text = String(value || '')
    .replace(/^[\s，。；、:：+\-/|·>→]+/, '')
    .replace(/[\s，。；、:：+\-/|·>→]+$/, '')
    .trim();
  const parts = text.split(/[，。；、:：+\-/|>→]/).map((item) => item.trim()).filter(Boolean);
  const tail = parts[parts.length - 1] || text;
  return tail
    .replace(/^(?:主技能|副技能|光环|位移技能|防御技能|诅咒|前期|后期|过渡|核心|推荐|可选)\s*/, '')
    .replace(/^\d+\s*级\s*转/, '')
    .replace(/[（）()]/g, '')
    .trim();
}

function cleanEnglishTerm(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:辅|Support)\s*[:：-]?\s*/i, '')
    .replace(/\s*(?:Gem|Support Gem)$/i, '')
    .trim();
}

function shouldKeepTerm(term) {
  if (!term.zh && !term.en) return false;
  if (term.zh && term.zh.length < 2 && !term.en) return false;
  if (term.zh && NOISE_ZH.has(term.zh)) return false;
  if (term.zh && /[）)]/.test(term.zh)) return false;
  if (term.en && NOISE_WORDS.has(term.en)) return false;
  if (/^\d+$/.test(term.zh || term.en)) return false;
  return true;
}

function guessCategory(sectionKey, zh, en) {
  const text = `${zh} ${en}`;
  if (SKILL_SECTION_KEYS.has(sectionKey)) return 'skill';
  if (PASSIVE_SECTION_KEYS.has(sectionKey)) return 'passive';
  if (EQUIPMENT_SECTION_KEYS.has(sectionKey)) return 'equipment';
  if (/辅|Support|Aura|Totem|Ballista|Strike|Slam|Trap|Mine|Brand|Herald|Curse|Warcry|Blink|Charge|Shield|Arrow|射击|图腾|光环|诅咒|印记|战吼|闪现|猛击|打击/.test(text)) return 'skill';
  if (/Shield|Helmet|Gloves|Boots|Ring|Amulet|Belt|Flask|Jewel|Axe|Sword|Bow|Staff|Wand|戒指|项链|腰带|盾|头盔|手套|鞋|药剂|珠宝|斧|剑|弓|法杖|长杖|匕首/.test(text)) return 'equipment';
  return 'unknown';
}

function addIndex(index, type, name, entry) {
  if (!name) return;
  const keys = new Set([normalizeName(name), normalizeEnglish(name)]);
  for (const key of keys) {
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ type, ...entry });
  }
}

function buildOfficialIndex(ladder) {
  const index = new Map();
  for (const build of ladder.builds || []) {
    for (const skill of build.skillGems || []) {
      addIndex(index, 'skill', skill.name, {
        name: skill.name,
        nameEn: skill.nameEn,
        icon: skill.icon,
        sampleBuildId: build.id,
        sampleCharacter: build.character
      });
      addIndex(index, 'skill', skill.nameEn, {
        name: skill.name,
        nameEn: skill.nameEn,
        icon: skill.icon,
        sampleBuildId: build.id,
        sampleCharacter: build.character
      });
    }

    for (const passive of build.keyPassives || []) {
      addIndex(index, 'passive', passive.name, {
        name: passive.name,
        nameEn: passive.nameEn,
        icon: passive.icon,
        stats: passive.stats || [],
        sampleBuildId: build.id,
        sampleCharacter: build.character
      });
      addIndex(index, 'passive', passive.nameEn, {
        name: passive.name,
        nameEn: passive.nameEn,
        icon: passive.icon,
        stats: passive.stats || [],
        sampleBuildId: build.id,
        sampleCharacter: build.character
      });
    }

    for (const group of build.skillGroups || []) {
      for (const gem of [group.main, ...(group.gems || [])].filter(Boolean)) {
        addIndex(index, 'skill', gem.name, {
          name: gem.name,
          nameEn: gem.nameEn,
          icon: gem.icon,
          sampleBuildId: build.id,
          sampleCharacter: build.character
        });
      }
    }

    for (const item of [...(build.equipment || []), ...(build.flasks || []), ...(build.jewels || [])]) {
      for (const name of [item.name, item.nameEn, item.typeLine, item.baseType].filter(Boolean)) {
        addIndex(index, 'equipment', name, {
          name: item.name,
          nameEn: item.nameEn,
          typeLine: item.typeLine,
          slot: item.slot,
          icon: item.icon,
          sampleBuildId: build.id,
          sampleCharacter: build.character
        });
      }
    }
  }
  return index;
}

function extractPairedTerms(text, sectionKey) {
  const terms = [];
  const regex = /([A-Za-z0-9\u4e00-\u9fa5·・'’：:\-\s]{1,48})[（(]([A-Za-z][A-Za-z0-9'’：:\-\s]+)[）)]/g;
  let match;
  while ((match = regex.exec(text))) {
    const zh = cleanChineseTerm(match[1]);
    const en = cleanEnglishTerm(match[2]);
    const term = { zh, en, category: guessCategory(sectionKey, zh, en) };
    if (shouldKeepTerm(term)) terms.push(term);
  }
  return terms;
}

function extractStandaloneTerms(text, sectionKey) {
  if (!SKILL_SECTION_KEYS.has(sectionKey)) return [];
  if (!/[+＋]/.test(text)) return [];
  return text
    .split(/[+＋]/)
    .map((piece) => cleanChineseTerm(piece.replace(/[（(].*?[）)]/g, '')))
    .filter((zh) => zh.length >= 2 && zh.length <= 16 && !/^\d/.test(zh))
    .filter((zh) => !/[A-Za-z（）()]/.test(zh) && !NOISE_ZH.has(zh))
    .map((zh) => ({ zh, en: '', category: 'skill' }))
    .filter(shouldKeepTerm);
}

function addTerm(terms, build, section, rawTerm, line) {
  const id = `${rawTerm.category}:${normalizeName(rawTerm.zh) || normalizeEnglish(rawTerm.en)}`;
  if (!id || id.endsWith(':')) return;
  if (!terms.has(id)) {
    terms.set(id, {
      id,
      category: rawTerm.category,
      zh: rawTerm.zh,
      en: rawTerm.en,
      count: 0,
      sources: []
    });
  }
  const term = terms.get(id);
  term.count += 1;
  if (rawTerm.en && !term.en) term.en = rawTerm.en;
  if (rawTerm.zh && !term.zh) term.zh = rawTerm.zh;
  term.sources.push({
    buildId: build.id,
    buildTitle: build.title,
    sourceFile: build.sourceFile,
    sectionKey: section.key,
    sectionTitle: section.title,
    line
  });
}

function extractStarterTerms(starterData) {
  const terms = new Map();
  for (const build of starterData.builds || []) {
    addTerm(terms, build, { key: 'title', title: '标题' }, {
      zh: build.mainSkill,
      en: '',
      category: 'skill'
    }, build.title);

    for (const section of build.sections || []) {
      for (const line of section.items || []) {
        const extracted = [
          ...extractPairedTerms(line, section.key),
          ...extractStandaloneTerms(line, section.key)
        ];
        for (const term of extracted) addTerm(terms, build, section, term, line);
      }
    }
  }
  return Array.from(terms.values()).sort((a, b) => b.count - a.count || a.zh.localeCompare(b.zh, 'zh-CN'));
}

function findMatch(term, officialIndex) {
  const keys = [
    normalizeName(term.zh),
    normalizeEnglish(term.en),
    normalizeName(term.en)
  ].filter(Boolean);
  for (const key of keys) {
    const matches = officialIndex.get(key);
    if (!matches || !matches.length) continue;
    const preferred = matches.find((item) => term.category === 'unknown' || item.type === term.category) || matches[0];
    return {
      source: '国服官方天梯',
      type: preferred.type,
      name: preferred.name,
      nameEn: preferred.nameEn,
      typeLine: preferred.typeLine,
      slot: preferred.slot,
      icon: preferred.icon,
      sampleBuildId: preferred.sampleBuildId,
      sampleCharacter: preferred.sampleCharacter
    };
  }
  return null;
}

function buildStarterTermsEnrichment() {
  const starterData = readJson(sourcePath);
  if (!starterData || !Array.isArray(starterData.builds)) throw new Error(`缺少开荒 BD 源数据: ${sourcePath}`);
  const ladder = readJson(ladderPath, { builds: [] });
  const officialIndex = buildOfficialIndex(ladder);
  const terms = extractStarterTerms(starterData).map((term) => {
    const match = findMatch(term, officialIndex);
    return {
      ...term,
      matched: Boolean(match),
      match,
      sources: term.sources.slice(0, 8)
    };
  });
  const matchedTerms = terms.filter((term) => term.matched);
  const unmatchedTerms = terms.filter((term) => !term.matched);
  const output = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: {
      starterBuilds: sourcePath,
      officialLadder: ladderPath,
      note: '第一版只用国服官方天梯详情做真实数据匹配；未匹配项后续进入 PoEDB 或人工映射。'
    },
    stats: {
      totalTerms: terms.length,
      matched: matchedTerms.length,
      unmatched: unmatchedTerms.length,
      skills: terms.filter((term) => term.category === 'skill').length,
      equipment: terms.filter((term) => term.category === 'equipment').length,
      unknown: terms.filter((term) => term.category === 'unknown').length
    },
    matchedTerms,
    unmatchedTerms
  };
  fs.mkdirSync(path.dirname(baseOutputPath), { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(baseOutputPath, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`✅ POE1 开荒 BD 术语匹配已生成: ${outputPath}`);
  console.log(`   术语: ${output.stats.totalTerms} | 已匹配: ${output.stats.matched} | 待补: ${output.stats.unmatched}`);
  return output;
}

if (require.main === module) {
  try {
    buildStarterTermsEnrichment();
  } catch (error) {
    console.error('❌ POE1 开荒 BD 术语匹配失败:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildStarterTermsEnrichment, extractStarterTerms };
