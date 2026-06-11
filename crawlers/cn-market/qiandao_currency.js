const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const envConfig = require('../../auto_browser/env-config');

const OUTPUT_FILE = 'cn_market_qiandao_digest.json';
const RAW_FILE = 'cn_market_qiandao_raw.json';
const SOURCE_NAME = '千岛';
const EXPECTED_TITLE = '流放2专区 - 通货交易';
const DEFAULT_REQUIRED_LEAGUE = '国服 / 赛季 / 普通';

const ITEM_MAP = {
  神圣石: { id: 'divine_orb', enName: 'Divine Orb', priority: 'core' },
  崇高石: { id: 'exalted_orb', enName: 'Exalted Orb', priority: 'core' },
  混沌石: { id: 'chaos_orb', enName: 'Chaos Orb', priority: 'core' },
  瓦尔宝珠: { id: 'vaal_orb', enName: 'Vaal Orb', priority: 'core' },
  卡兰德的魔镜: { id: 'mirror_of_kalandra', enName: 'Mirror of Kalandra', priority: 'core' },
  完美崇高石: { id: 'perfect_exalted_orb', enName: 'Perfect Exalted Orb', priority: 'core' },
  完美混沌石: { id: 'perfect_chaos_orb', enName: 'Perfect Chaos Orb', priority: 'core' },
  完美工匠石: { id: 'perfect_jewellers_orb', enName: "Perfect Jeweller's Orb", priority: 'core' },
  高阶工匠石: { id: 'greater_jewellers_orb', enName: "Greater Jeweller's Orb", priority: 'core' },
  高级工匠石: { id: 'greater_jewellers_orb', enName: "Greater Jeweller's Orb", priority: 'core' },
  破裂石: { id: 'fracturing_orb', enName: 'Fracturing Orb', priority: 'core' },
  剥离石: { id: 'orb_of_annulment', enName: 'Orb of Annulment', priority: 'core' },
  无效石: { id: 'orb_of_annulment', enName: 'Orb of Annulment', priority: 'core' },
  富豪石: { id: 'regal_orb', enName: 'Regal Orb', priority: 'normal' },
  点金石: { id: 'orb_of_alchemy', enName: 'Orb of Alchemy', priority: 'normal' },
  机会石: { id: 'orb_of_chance', enName: 'Orb of Chance', priority: 'normal' },
  宝石匠的棱镜: { id: 'gemcutters_prism', enName: "Gemcutter's Prism", priority: 'normal' },
  工匠石: { id: 'jewellers_orb', enName: "Jeweller's Orb", priority: 'normal' },
  后悔石: { id: 'orb_of_regret', enName: 'Orb of Regret', priority: 'normal' },
  磨刀石: { id: 'blacksmiths_whetstone', enName: "Blacksmith's Whetstone", priority: 'normal' },
  护甲片: { id: 'armourers_scrap', enName: "Armourer's Scrap", priority: 'normal' },
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function round(value, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function toSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown_item';
}

function runAppleScript(source) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', source], { maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      resolve(stdout);
    });
  });
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s+\n/g, '\n')
    .trim();
}

function getChromeScript() {
  const js = `
(() => {
  const payload = {
    title: document.title,
    url: location.href,
    text: document.body && document.body.innerText ? document.body.innerText : ''
  };
  return JSON.stringify(payload);
})()
`;
  const escaped = js.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `
tell application "Google Chrome"
  tell active tab of front window
    execute javascript "${escaped}"
  end tell
end tell
`;
}

function readHtmlFileIfProvided() {
  const htmlFile = process.env.QIANDAO_HTML_FILE;
  if (!htmlFile) return null;
  const fullPath = path.resolve(htmlFile);
  if (!fs.existsSync(fullPath)) throw new Error(`千岛 DOM 文件不存在: ${fullPath}`);
  const html = fs.readFileSync(fullPath, 'utf8');
  return {
    title: EXPECTED_TITLE,
    url: 'manual-html-file',
    html,
    text: stripHtml(html),
  };
}

async function readCurrentChromeQiandaoPage() {
  const filePage = readHtmlFileIfProvided();
  if (filePage) return filePage;

  try {
    const stdout = await runAppleScript(getChromeScript());
    return JSON.parse(stdout);
  } catch (error) {
    if (error.message.includes('AppleScript 执行 JavaScript 的功能已关闭') || error.message.includes('JavaScript from Apple Events')) {
      throw new Error('Chrome 未开启“允许 Apple 事件中的 JavaScript”。请在 Chrome 菜单打开：查看 -> 开发者 -> 允许 Apple 事件中的 JavaScript，然后保持千岛通货页在当前标签页再重试。');
    }
    throw error;
  }
}

function getSelectedLeague(page) {
  const html = String(page.html || '');
  const titleMatch = html.match(/title="([^"]*国服[^"]*)"/);
  if (titleMatch) return titleMatch[1].replace(/\s+/g, ' ').trim();
  const text = String(page.text || '');
  const textMatch = text.match(/(国服\s*\/\s*(?:赛季|永久)\s*\/\s*(?:普通|专家))/);
  if (textMatch) return textMatch[1].replace(/\s*\/\s*/g, ' / ');
  return '';
}

function assertSelectedLeague(page) {
  const selected = getSelectedLeague(page);
  const required = process.env.QIANDAO_REQUIRED_LEAGUE || DEFAULT_REQUIRED_LEAGUE;
  if (!selected) {
    throw new Error(`未识别到千岛区服筛选，请确认页面顶部已选择 ${required}`);
  }
  if (selected !== required) {
    throw new Error(`当前千岛区服是“${selected}”，不是“${required}”。请先切到正确区服再读取，避免把其他区服价格写入小程序。`);
  }
  return selected;
}

function parseHtmlCards(html) {
  const cardRegex = /<div data-v-b46e961c="" class="flex items-center gap-12px py-8px w-full cursor-pointer[\s\S]*?(?=<div data-v-b46e961c="" class="flex items-center gap-12px py-8px w-full cursor-pointer|<!----><\/div><\/div><\/div>|$)/g;
  const cards = String(html || '').match(cardRegex) || [];
  return cards.map(card => {
    const nameMatch = card.match(/<div class="text-h5 c-text-1 truncate">([^<]+)<\/div>/);
    if (!nameMatch) return null;
    const sourceIconMatch = card.match(/src="([^"]+)"/);
    const unitPerMatch = card.match(/<span class="text-n5">1<\/span>[\s\S]*?<span class="text-h6">元<\/span>[\s\S]*?<span class="text-n5">=<\/span>[\s\S]*?<span class="text-n5">([\d.]+)<\/span>[\s\S]*?<span class="text-h6">个<\/span>/);
    const unitPriceMatch = card.match(/<span class="text-n6">1<\/span>[\s\S]*?<span class="text-h7">个<\/span>[\s\S]*?<span class="text-n6">=<\/span>[\s\S]*?<span class="text-n6">([\d.]+)<\/span>[\s\S]*?<span class="text-h7">元<\/span>/);
    const changeMatch = card.match(/<span class="text-n7 [^"]*">([\d.]+)%<\/span>/);
    return {
      name: nameMatch[1].trim(),
      sourceIcon: sourceIconMatch ? sourceIconMatch[1] : '',
      unitPerCny: unitPerMatch ? round(unitPerMatch[1], 4) : null,
      unitPriceCny: unitPriceMatch ? round(unitPriceMatch[1], 4) : null,
      changePct: changeMatch ? round(changeMatch[1], 2) : null,
    };
  }).filter(Boolean);
}

function normalizeParsedItem(parsed) {
  const mapped = ITEM_MAP[parsed.name] || {};
  const hasPrice = Number.isFinite(Number(parsed.unitPriceCny)) || Number.isFinite(Number(parsed.unitPerCny));
  return {
    id: mapped.id || toSlug(parsed.name),
    name: parsed.name,
    enName: mapped.enName || '',
    priority: mapped.priority || 'normal',
    source: {
      name: SOURCE_NAME,
    },
    sourceIcon: parsed.sourceIcon || '',
    sampleSize: hasPrice ? 1 : 0,
    quotedSampleSize: hasPrice ? 1 : 0,
    bestUnitPriceCny: parsed.unitPriceCny,
    medianUnitPriceCny: parsed.unitPriceCny,
    averageUnitPriceCny: parsed.unitPriceCny,
    bestUnitPerCny: parsed.unitPerCny,
    medianUnitPerCny: parsed.unitPerCny,
    averageUnitPerCny: parsed.unitPerCny,
    changePct: parsed.changePct,
    ratioUnit: '个',
    confidence: hasPrice ? 'low' : 'none',
    qiandao: {},
  };
}

function parseVisibleText(text) {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const name = lines[index];
    if (!ITEM_MAP[name]) continue;

    const windowText = lines.slice(index, index + 12).join(' ');
    const unitPerMatch = windowText.match(/1元\s*[=≈]\s*([\d.]+)\s*个/);
    const unitPriceMatch = windowText.match(/1个\s*[=≈]\s*([\d.]+)\s*元/);
    const changeMatch = windowText.match(/([+-]?\d+(?:\.\d+)?)%/);
    const mapped = ITEM_MAP[name];
    const unitPrice = unitPriceMatch ? round(unitPriceMatch[1], 4) : null;
    const unitPerCny = unitPerMatch ? round(unitPerMatch[1], 4) : unitPrice ? round(1 / unitPrice, 4) : null;

    items.push({
      id: mapped.id || toSlug(name),
      name,
      enName: mapped.enName || '',
      priority: mapped.priority || 'normal',
      source: {
        name: SOURCE_NAME,
      },
      sampleSize: unitPrice || unitPerCny ? 1 : 0,
      quotedSampleSize: unitPrice || unitPerCny ? 1 : 0,
      bestUnitPriceCny: unitPrice,
      medianUnitPriceCny: unitPrice,
      averageUnitPriceCny: unitPrice,
      bestUnitPerCny: unitPerCny,
      medianUnitPerCny: unitPerCny,
      averageUnitPerCny: unitPerCny,
      changePct: changeMatch ? round(changeMatch[1], 2) : null,
      ratioUnit: '个',
      confidence: unitPrice || unitPerCny ? 'low' : 'none',
      qiandao: {
        visibleSnippet: windowText.slice(0, 240),
      },
    });
  }

  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function runQiandaoCurrency(options = {}) {
  const outputDir = options.outputDir || envConfig.dataDir;
  ensureDir(path.join(outputDir, 'miniprogram_data'));

  console.log('\n💴 千岛国服通货行情（手动核验）');
  console.log('   请先用 Chrome 打开千岛“流放2专区 - 通货交易”页面，并切到要核验的区服。');
  console.log('   数据边界: 只读取当前页面已经展示的公开文字。');

  const page = await readCurrentChromeQiandaoPage();
  if (!page.url || !page.url.includes('qiandao.com/currency')) {
    if (page.url !== 'manual-html-file') {
      throw new Error(`当前 Chrome 标签不是千岛通货页: ${page.title || page.url || '未知页面'}`);
    }
  }
  const selectedLeague = assertSelectedLeague(page);

  const parsedCards = parseHtmlCards(page.html);
  const items = (parsedCards.length ? parsedCards.map(normalizeParsedItem) : parseVisibleText(page.text));
  const updatedAt = new Date().toISOString();
  const digest = {
    schemaVersion: 1,
    updatedAt,
    source: {
      name: SOURCE_NAME,
      url: page.url,
      note: '当前 Chrome 页面可见公开行情，仅作国服行情人工核验参考，不代表成交保证。',
    },
    game: {
      name: '流放2专区',
      league: selectedLeague,
    },
    refreshPolicy: {
      recommendedIntervalMinutes: 'manual',
      cacheControlSeconds: 60,
    },
    summary: {
      itemCount: items.length,
      availableCount: items.filter(item => item.sampleSize > 0).length,
      highConfidenceCount: 0,
    },
    items,
  };

  const digestPath = path.join(outputDir, 'miniprogram_data', OUTPUT_FILE);
  fs.writeFileSync(digestPath, JSON.stringify(digest, null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), digestPath)}`);

  const rawPath = path.join(outputDir, RAW_FILE);
  fs.writeFileSync(rawPath, JSON.stringify({
    schemaVersion: 1,
    updatedAt,
    page: {
      title: page.title,
      url: page.url,
      selectedLeague,
    },
    lines: String(page.text || '').split(/\n+/).map(line => line.trim()).filter(Boolean),
  }, null, 2));
  console.log(`   ✅ ${path.relative(path.join(__dirname, '../..'), rawPath)} (本地排查用，不上传 OSS)`);
  console.log(`   完成: ${digest.summary.availableCount}/${digest.summary.itemCount} 项可见价格`);

  return digest;
}

if (require.main === module) {
  runQiandaoCurrency().catch(error => {
    console.error('\n❌ 千岛国服行情读取失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runQiandaoCurrency,
  parseVisibleText,
};
