function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? stripTags(title[1]) : '';
}

function extractDescription(html) {
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return meta ? stripTags(meta[1]) : '';
}

function extractInternalLinks(html) {
  const links = [];
  const seen = new Set();
  const pattern = /href=["']\/cn\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const slug = decodeURIComponent(match[1]).split('#')[0];
    const label = stripTags(match[2]);
    if (!slug || !label || label.length > 60) continue;
    const key = `${slug}:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      slug,
      label,
      url: `https://poe2db.tw/cn/${slug}`,
    });
  }
  return links.slice(0, 200);
}

function parseSourcePage(html, source) {
  return {
    key: source.key,
    name: source.name,
    url: source.url,
    type: source.type,
    confidence: source.confidence,
    title: extractTitle(html),
    description: extractDescription(html),
    links: extractInternalLinks(html),
    checkedAt: new Date().toISOString().slice(0, 10),
  };
}

module.exports = {
  parseSourcePage,
  stripTags,
};
