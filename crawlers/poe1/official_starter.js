const fs = require('fs');
const path = require('path');

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const sourcePath = path.join(__dirname, '../../base-data/poe1/official_starter_builds_source.json');
const outputDir = path.join(__dirname, '../../translated-data/poe1', env, 'miniprogram_data');
const outputPath = path.join(outputDir, 'official_starter_builds.json');

async function checkOfficialPage(url) {
  if (!url) return { ok: false, status: 0, checkedAt: new Date().toISOString(), message: '缺少官方 URL' };
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'poe-season-helper/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    return {
      ok: response.ok,
      status: response.status,
      checkedAt: new Date().toISOString(),
      message: response.ok ? '官方活动页可访问' : `官方活动页返回 HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      checkedAt: new Date().toISOString(),
      message: `官方活动页校验失败: ${error.message}`
    };
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeBuild(build, index, source) {
  const sections = Array.isArray(build.sections) ? build.sections : [];
  return {
    id: build.id,
    order: build.order || index + 1,
    sourceType: 'official',
    sourceName: source.name,
    sourceUrl: source.url,
    title: build.title,
    className: build.className || '',
    classNameEn: build.classNameEn || '',
    mainSkill: build.mainSkill || '',
    mainSkillEn: build.mainSkillEn || '',
    tags: Array.from(new Set(['官方', ...(build.tags || [])])).slice(0, 8),
    difficulty: build.difficulty || '官方入门',
    summary: build.summary || '',
    sections: sections.map((section) => ({
      key: section.key,
      title: section.title,
      items: (section.items || []).filter(Boolean)
    })).filter((section) => section.key && section.items.length),
    updatedAt: new Date().toISOString()
  };
}

async function buildOfficialStarter() {
  if (!fs.existsSync(sourcePath)) throw new Error(`缺少官方开荒 BD 源数据: ${sourcePath}`);
  const sourceData = readJson(sourcePath);
  const source = sourceData.source || {};
  const pageHealth = await checkOfficialPage(source.url);
  const builds = (sourceData.builds || []).map((build, index) => normalizeBuild(build, index, source));
  const output = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    title: sourceData.title || '官方入门流派',
    description: sourceData.description || '国服官方推荐的入门构筑。',
    source,
    season: sourceData.season || {},
    pageHealth,
    builds
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`✅ POE1 官方开荒 BD 已生成: ${outputPath}`);
  console.log(`   BD: ${builds.length} | 来源: ${source.name || '官方活动页'} | ${pageHealth.message}`);
  if (output.season && output.season.isCurrent === false) {
    console.log(`   ⚠️ ${output.season.displayName || output.season.name} 为历史赛季官方推荐，前台应标注“入门参考”。`);
  }
  return output;
}

if (require.main === module) {
  buildOfficialStarter().catch((error) => {
    console.error('❌ POE1 官方开荒 BD 生成失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildOfficialStarter, normalizeBuild };
