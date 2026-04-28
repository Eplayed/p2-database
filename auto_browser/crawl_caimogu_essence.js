/**
 * @Description: 踩蘑菇精华帖BD爬虫 - 完整版
 * @Date: 2026-04-28
 *
 * 功能：
 * 1. 从踩蘑菇圈子获取精华帖列表
 * 2. 进入BD详情页，截图天赋树
 * 3. 整理成小程序需要的数据结构
 * 4. 上传图片到 OSS
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const OSS = require('ali-oss');

// OSS 配置
const OSS_CONFIG = {
  region: 'oss-cn-hangzhou',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || 'LTAI5t65VsUAtjddc3kpb4sX',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: 'poe2-all-class'
};

const OSS_FOLDER = 'community-builds/';
const OSS_BASE_URL = 'https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com/';

// 配置
const CONFIG = {
  headless: true,
  waitTime: 5000,
  viewport: { width: 1920, height: 3000 },
  timeout: 60000,
  maxPosts: 20,       // 最多抓取20个帖子
  screenshotWidth: 1200  // 截图宽度
};

// 过滤关键词
const NOISE_KEYWORDS = [
  '登录', '注册', '发帖', '踩蘑菇', '写点什么', '回复',
  '视频介绍', '未添加视频', '装备', '套装'
];

// 有效技能后缀
const VALID_SUFFIXES = ['I', 'II', 'III', 'IV', 'V', '1', '2', '3', '4', '5'];

/**
 * 初始化 OSS 客户端
 */
function createOSSClient() {
  try {
    return new OSS(OSS_CONFIG);
  } catch (e) {
    console.error('OSS 初始化失败:', e.message);
    return null;
  }
}

/**
 * 上传单个文件到 OSS
 */
async function uploadToOSS(client, localPath, remotePath) {
  if (!client || !fs.existsSync(localPath)) return null;

  try {
    const result = await client.put(remotePath, localPath);
    console.log(`  上传成功: ${result.name}`);
    return result.url || `${OSS_BASE_URL}${remotePath}`;
  } catch (e) {
    console.error(`  上传失败: ${e.message}`);
    return null;
  }
}

/**
 * 判断是否是有效技能
 */
function isValidSkill(text) {
  if (!text || text.length < 2 || text.length > 20) return false;
  if (NOISE_KEYWORDS.some(k => text.includes(k))) return false;
  if (/^[IVX\d\s]+$/.test(text)) return false;
  return true;
}

/**
 * 从文本解析技能组
 */
function parseSkills(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const skills = [];
  let currentGroup = null;

  const groupStarters = [
    '残片', '大法师', '魔侍', '闪电专精', '冰霜专精', '元素要害',
    '暴击时施放', '彗星落', '冰墙', '雨淞', '冰川', '德瑞', '仪祭',
    '灵体', '陷阱', '图腾', '召唤', '打击', '施放', '引导',
    '闪电箭', '榴弹', '箭矢', '刀阵', '闪电新星'
  ];

  for (const line of lines) {
    if (!isValidSkill(line)) continue;

    const isGroupStart = groupStarters.some(s => line.includes(s));

    if (isGroupStart || !currentGroup) {
      if (currentGroup && currentGroup.links.length > 0) {
        skills.push(currentGroup);
      }
      currentGroup = {
        groupName: line,
        groupIndex: skills.length + 1,
        mainSkills: [],
        supportSkills: [],
        links: []
      };
    }

    if (currentGroup) {
      const isSupport = line.includes('效能') || line.includes('集中') ||
                       line.includes('节魔') || line.includes('延长') ||
                       line.includes('扩大') || line.includes('保存');
      currentGroup.links.push({ name: line, isSupport });

      if (isSupport) {
        if (!currentGroup.supportSkills.includes(line)) {
          currentGroup.supportSkills.push(line);
        }
      } else {
        if (!currentGroup.mainSkills.includes(line)) {
          currentGroup.mainSkills.push(line);
        }
      }
    }
  }

  if (currentGroup && currentGroup.links.length > 0) {
    skills.push(currentGroup);
  }

  return skills;
}

/**
 * 从文本解析元数据
 */
function parseMeta(text, url) {
  const meta = {
    title: '',
    author: '',
    class: '',
    tags: [],
    updateTime: ''
  };

  // 提取标题
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length >= 3 && trimmed.length <= 40 &&
        !NOISE_KEYWORDS.some(k => trimmed.includes(k)) &&
        !/^[IVX\d\s]+$/.test(trimmed) &&
        !trimmed.includes('http') &&
        !trimmed.includes('.com')) {
      meta.title = trimmed;
      break;
    }
  }

  // 提取作者
  const authorMatch = text.match(/作者[：:]\s*([^|\n]+)/);
  if (authorMatch) {
    meta.author = authorMatch[1].trim().substring(0, 20);
  }

  // 提取职业
  const classes = ['德鲁伊', '游侠', '战士', '女巫', '圣堂', '野蛮人', '暗影', '魔导师', '冠军', '贵族', '佣兵', '武僧', '判官', '神谕者', '暗影刺客'];
  for (const cls of classes) {
    if (text.includes(cls)) {
      meta.class = cls;
      break;
    }
  }

  // 提取更新时间
  const timeMatch = text.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/);
  if (timeMatch) {
    meta.updateTime = timeMatch[1].replace('年', '-').replace('月', '-').replace('日', '');
  }

  // 生成标签
  if (text.includes('开荒') || text.includes('升级')) meta.tags.push('开荒');
  if (text.includes('攻坚') || text.includes('BOSS')) meta.tags.push('攻坚');
  if (text.includes('速刷') || text.includes('刷图')) meta.tags.push('速刷');
  if (text.includes('硬核')) meta.tags.push('硬核');
  if (text.includes('BD')) meta.tags.push('热门BD');

  if (meta.tags.length === 0) meta.tags.push('热门推荐');

  return meta;
}

/**
 * 截图天赋树区域
 */
async function screenshotPassiveTree(page, outputPath) {
  try {
    // 尝试找到天赋树区域
    const treeInfo = await page.evaluate(() => {
      // 查找可能的天赋树容器
      const selectors = [
        '[class*="tree"]',
        '[class*="passive"]',
        '[class*="skill"]',
        '[class*="build"]',
        '#passive-tree',
        '.passive-tree'
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 200 && rect.height > 200) {
            return {
              found: true,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            };
          }
        }
      }

      return { found: false };
    });

    if (treeInfo.found) {
      await page.screenshot({
        path: outputPath,
        clip: {
          x: treeInfo.x,
          y: treeInfo.y,
          width: Math.min(treeInfo.width, CONFIG.screenshotWidth),
          height: Math.min(treeInfo.height, 800)
        }
      });
      return true;
    }

    // 如果没找到特定区域，截图整个页面的一部分
    await page.screenshot({
      path: outputPath,
      fullPage: false
    });
    return true;

  } catch (e) {
    console.error('  截图失败:', e.message);
    return false;
  }
}

/**
 * 抓取单个帖子详情
 */
async function crawlPostDetail(page, postUrl, client, index) {
  console.log(`  [${index}] 访问: ${postUrl}`);

  try {
    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
    await new Promise(resolve => setTimeout(resolve, CONFIG.waitTime));

    // 提取文本数据
    const data = await page.evaluate(() => {
      const contentEl = document.querySelector('.post-content, #post-content, [class*="post-content"]');
      return {
        text: contentEl ? contentEl.innerText : document.body.innerText,
        url: window.location.href
      };
    });

    // 解析数据
    const meta = parseMeta(data.text, data.url);
    const skills = parseSkills(data.text);

    // 生成ID
    const postId = postUrl.split('/').pop()?.replace('.html', '') || `bd_${Date.now()}`;
    const screenshotFilename = `passive_${postId}.png`;
    const screenshotPath = path.join(__dirname, 'data', 'screenshots', screenshotFilename);

    // 确保截图目录存在
    const screenshotDir = path.dirname(screenshotPath);
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // 截图
    let passiveImageUrl = '';
    const screenshotSuccess = await screenshotPassiveTree(page, screenshotPath);

    if (screenshotSuccess && fs.existsSync(screenshotPath)) {
      // 上传到 OSS
      const remotePath = `${OSS_FOLDER}${screenshotFilename}`;
      passiveImageUrl = await uploadToOSS(client, screenshotPath, remotePath);
    }

    console.log(`    标题: ${meta.title}`);
    console.log(`    职业: ${meta.class} | 技能组: ${skills.length}`);
    console.log(`    截图: ${screenshotSuccess ? '成功' : '失败'}`);

    return {
      id: `CaiMoGu_${postId}`,
      meta: {
        title: meta.title,
        author: meta.author,
        class: meta.class,
        tags: meta.tags
      },
      intro: {
        desc: `来自踩蘑菇网的热门BD「${meta.title}」，${meta.class}职业，作者${meta.author || '未知'}，更新于${meta.updateTime || '最近'}`,
        pros: ['社区热门推荐', '经过玩家验证'],
        cons: ['具体效果因人而异']
      },
      skills: skills.slice(0, 10),
      equipment: {
        notes: `数据来源：踩蘑菇网 | 更新时间: ${meta.updateTime}`
      },
      passive_tree: {
        image: passiveImageUrl,
        link: data.url
      },
      source: {
        platform: 'caimogu',
        originalAuthor: meta.author,
        updateTime: meta.updateTime,
        sourceUrl: data.url
      }
    };

  } catch (e) {
    console.error(`  ❌ 抓取失败: ${e.message}`);
    return null;
  }
}

/**
 * 获取精华帖列表
 */
async function getEssencePosts(page) {
  console.log('\n📜 获取踩蘑菇精华帖列表...');

  const circleUrl = 'https://www.caimogu.cc/circle/449.html';
  await page.goto(circleUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 点击精华筛选
  await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el.textContent?.trim() === "精华" && el.tagName !== 'SCRIPT') {
        el.click();
        return true;
      }
    }
    return false;
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // 滚动加载
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 获取帖子链接
  const posts = await page.evaluate(() => {
    const links = [];
    const seen = new Set();

    document.querySelectorAll('a[href*="/post/"]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || !href.match(/\/post\/\d+\.html/)) return;

      const match = href.match(/\/post\/(\d+)\.html/);
      if (!match || seen.has(match[1])) return;

      const text = link.textContent?.trim() || "";
      if (text.length < 5 || text.length > 100) return;
      if (text.includes('登录') || text.includes('注册')) return;

      seen.add(match[1]);
      links.push({
        id: match[1],
        title: text,
        url: href.startsWith('http') ? href : `https://www.caimogu.cc${href}`
      });
    });

    return links;
  });

  console.log(`  找到 ${posts.length} 个帖子`);

  // 优先选择BD相关的帖子
  const bdPosts = posts.filter(p =>
    p.title.includes('BD') || p.title.includes('bd') ||
    p.title.includes('开荒') || p.title.includes('攻略') ||
    p.title.includes('德鲁伊') || p.title.includes('游侠') ||
    p.title.includes('战士') || p.title.includes('女巫')
  );

  return bdPosts.length > 0 ? bdPosts : posts;
}

/**
 * 主函数
 */
async function crawlEssencePosts() {
  console.log('🚀 踩蘑菇精华帖爬虫启动...\n');

  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport(CONFIG.viewport);
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  // 初始化 OSS
  const ossClient = createOSSClient();
  if (!ossClient) {
    console.log('⚠️ OSS 未配置，跳过图片上传');
  }

  const results = [];

  try {
    // 1. 获取精华帖列表
    const posts = await getEssencePosts(page);
    const postsToCrawl = posts.slice(0, CONFIG.maxPosts);

    console.log(`\n📦 抓取 ${postsToCrawl.length} 个帖子详情...\n`);

    // 2. 抓取每个帖子
    for (let i = 0; i < postsToCrawl.length; i++) {
      const result = await crawlPostDetail(page, postsToCrawl[i].url, ossClient, i + 1);
      if (result) {
        results.push(result);
      }
    }

    // 3. 保存结果
    console.log('\n\n=== 抓取结果 ===');
    console.log(`成功: ${results.length} 个BD`);

    const outputDir = path.join(__dirname, 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'essence_builds.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`💾 数据已保存: ${outputPath}`);

    // 打印示例
    results.slice(0, 3).forEach((bd, i) => {
      console.log(`\n${i + 1}. ${bd.meta.title}`);
      console.log(`   职业: ${bd.meta.class} | 技能组: ${bd.skills.length}个`);
      console.log(`   天赋图: ${bd.passive_tree.image ? '有' : '无'}`);
    });

    // 4. 上传到 OSS
    if (ossClient) {
      console.log('\n☁️ 上传数据到 OSS...');
      try {
        const remotePath = `${OSS_FOLDER}essence_builds.json`;
        const url = await uploadToOSS(ossClient, outputPath, remotePath);
        console.log(`☁️ 数据上传成功: ${url}`);
      } catch (e) {
        console.log('☁️ OSS 上传失败:', e.message);
      }
    }

  } catch (error) {
    console.error('❌ 爬取失败:', error);
  } finally {
    await browser.close();
  }

  return results;
}

// 运行
if (require.main === module) {
  crawlEssencePosts()
    .then(() => {
      console.log('\n✅ 完成');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ 错误:', err);
      process.exit(1);
    });
}

module.exports = { crawlEssencePosts, crawlPostDetail };
