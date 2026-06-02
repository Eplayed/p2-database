const { SOURCES } = require('./sources');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function loadOverrides(overridesJson) {
  if (!overridesJson || !overridesJson.entries) return {};
  return overridesJson.entries;
}

function normalizeEntry(entry, overrides = {}) {
  const id = entry.id || `${entry.category || 'entry'}_${slugify(entry.enName || entry.name)}`;
  const override = overrides[id] || {};
  const source = SOURCES[override.sourceKey || entry.sourceKey] || null;
  const confidence = override.confidence || entry.confidence || source?.confidence || 'medium';

  return {
    id,
    category: override.category || entry.category || 'feature',
    name: override.name || entry.name || entry.enName || id,
    enName: override.enName || entry.enName || '',
    summary: override.summary || entry.summary || '',
    effect: override.effect || entry.effect || '',
    obtainMethod: override.obtainMethod || entry.obtainMethod || '',
    usageAdvice: override.usageAdvice || entry.usageAdvice || '',
    tags: override.tags || entry.tags || [],
    aliases: override.aliases || entry.aliases || [],
    needsTranslation: Boolean(override.needsTranslation || (!override.name && !entry.name)),
    source: {
      name: override.sourceName || source?.name || 'manual',
      url: override.sourceUrl || source?.url || '',
      checkedAt: override.checkedAt || new Date().toISOString().slice(0, 10),
      confidence,
    },
  };
}

function groupEntries(entries) {
  return {
    items: entries.filter(item => ['feature', 'endgame'].includes(item.category)),
    runes: entries.filter(item => item.category === 'rune'),
    currencies: entries.filter(item => item.category === 'currency'),
    kalguuranGems: entries.filter(item => item.category === 'kalguuran_gem'),
    bosses: entries.filter(item => item.category === 'boss'),
  };
}

module.exports = {
  groupEntries,
  loadOverrides,
  normalizeEntry,
  slugify,
};
