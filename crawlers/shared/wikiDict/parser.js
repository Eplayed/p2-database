/**
 * HTML 解析工具 - 从 poe2db 页面提取中英对照数据
 * 基于实际 HTML 结构的正则解析
 */

/**
 * 从物品列表页面提取基础物品 英文名 → 中文名
 * 
 * 实际 HTML 格式:
 *   href="Crude_Bow"><img .../>...</a>...<a class="whiteitem Bow" ...>粗制弓</a>
 * 
 * 简化匹配: href="slug" 后面跟着 class="whiteitem" 的 <a> 标签内容
 */
function parseBaseItems(html) {
  const dict = {};

  // 匹配模式: href="English_Slug" ... class="whiteitem ..." ... >中文名</a>
  // 实际格式: href="Crude_Bow"><img.../>...</a></div><div...><a class="whiteitem Bow" ...>粗制弓</a>
  const pattern = /href="([A-Za-z][A-Za-z0-9_'-]+)"><img[^>]*alt="[^"]*"[^>]*\/><\/a><\/div><div[^>]*><a class="whiteitem[^"]*"[^>]*>([^<]+)<\/a>/g;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const slug = match[1];
    const cnName = match[2].trim();

    if (slug && cnName && cnName.length > 0) {
      // slug 转英文名: Crude_Bow → Crude Bow
      const enName = slug.replace(/_/g, ' ');
      dict[enName] = cnName;
    }
  }

  return dict;
}

/**
 * 从页面提取技能宝石 英文名 → 中文名
 * 
 * 实际 HTML 格式:
 *   class="gem_red" data-hover="..." href="/cn/Herald_of_Ash">灰烬之捷</a>
 */
function parseGems(html) {
  const dict = {};

  // 匹配 gem_red / gem_green / gem_blue 类的链接
  const pattern = /class="gem_(?:red|green|blue)"[^>]*href="\/cn\/([A-Za-z0-9_'%-]+)"[^>]*>([^<]+)<\/a>/g;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const slug = decodeURIComponent(match[1]);
    const cnName = match[2].trim();

    if (slug && cnName && cnName.length > 0) {
      const enName = slug.replace(/_/g, ' ');
      // 去重：保留第一次出现的
      if (!dict[enName]) {
        dict[enName] = cnName;
      }
    }
  }

  // 另一种排版：技能总表页（Skill_Gems）每行用 class="gemitem"，先图标后中文名，
  // 上面那条 gem_red/green/blue 规则盖不到它。实测少了这条，
  // 跃击 / 树肤术 / 狼群 / 群星召唤这批非武器来源的技能名全是英文。
  const itemPattern = /class="gemitem"[^>]*href="\/cn\/([A-Za-z0-9_'%-]+)"[^>]*>\s*([\u4e00-\u9fa5][^<]{1,28}?)\s*<\/a>/g;
  while ((match = itemPattern.exec(html)) !== null) {
    const enName = decodeURIComponent(match[1]).replace(/_/g, ' ').trim();
    const cnName = match[2].trim();
    if (enName && cnName && !dict[enName]) {
      dict[enName] = cnName;
    }
  }

  return dict;
}

/**
 * 从页面提取传奇物品 英文名 → { cn, base, full }
 * 
 * 实际 HTML 格式:
 *   href="/cn/Widowhail"><span class="uniqueName"> 遗孀之雹</span> <span class="uniqueTypeLine">粗制弓</span></a>
 */
function parseUniques(html) {
  const dict = {};

  const pattern = /href="\/cn\/([A-Za-z0-9_'%-]+)"><span class="uniqueName">\s*([^<]+)<\/span>\s*<span class="uniqueTypeLine">([^<]+)<\/span>/g;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const slug = decodeURIComponent(match[1]);
    const cnName = match[2].trim();
    const baseType = match[3].trim();

    if (slug && cnName) {
      const enName = slug.replace(/_/g, ' ');
      dict[enName] = {
        cn: cnName,
        base: baseType,
        full: `${cnName} ${baseType}`.trim(),
      };
    }
  }

  return dict;
}

module.exports = { parseBaseItems, parseGems, parseUniques };
