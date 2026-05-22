const REQUIRED_FIELDS = ['id', 'category', 'name', 'source'];

function validateEntries(entries) {
  const errors = [];
  const warnings = [];
  const seen = new Set();

  for (const entry of entries) {
    for (const field of REQUIRED_FIELDS) {
      if (!entry[field]) errors.push(`${entry.id || '<unknown>'}: missing ${field}`);
    }

    if (entry.id && seen.has(entry.id)) {
      errors.push(`${entry.id}: duplicate id`);
    }
    seen.add(entry.id);

    if (!entry.source.url) warnings.push(`${entry.id}: missing source.url`);
    if (entry.source.confidence === 'low') warnings.push(`${entry.id}: low confidence`);
    if (entry.needsTranslation) warnings.push(`${entry.id}: needs translation`);
  }

  return { errors, warnings };
}

function validateOutputFiles(files) {
  const errors = [];
  for (const [name, data] of Object.entries(files)) {
    try {
      JSON.parse(JSON.stringify(data));
    } catch (err) {
      errors.push(`${name}: not JSON serializable (${err.message})`);
    }
  }
  return errors;
}

module.exports = {
  validateEntries,
  validateOutputFiles,
};
