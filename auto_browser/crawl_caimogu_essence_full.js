#!/usr/bin/env node
/**
 * 踩蘑菇网精华帖爬虫 - 完整版
 * https://www.caimogu.cc/circle/449.html?filter=essence
 *
 * 功能：
 * 1. 滚动加载所有精华帖
 * 2. 进入详情页抓取完整内容
 * 3. 提取技能树、装备、攻略等字段
 */

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const CIRCLE_URL = "https://www.caimogu.cc/circle/449.html";
const OUTPUT_FILE = path.join(__dirname, "caimogu_essence_full.json");

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrollToLoadAll(page, maxScrolls = 20) {
  console.log("   开始滚动加载...");
  let scrollCount = 0;
  let lastHeight = 0;

  while (scrollCount < maxScrolls) {
    // 滚动到页面底部
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await delay(1500);

    // 检查是否还有新内容加载
    const newHeight = await page.evaluate(() => document.body.scrollHeight);

    if (newHeight === lastHeight) {
      // 尝试点击"加载更多"按钮
      const loadMoreClicked = await page.evaluate(() => {
        const loadMoreBtn = Array.from(document.querySelectorAll('button, a')).find(el =>
          el.textContent.includes('加载更多') ||
          el.textContent.includes('加载') ||
          el.textContent.includes('more') ||
          el.className.includes('load-more') ||
          el.className.includes('loadMore')
        );
        if (loadMoreBtn) {
          loadMoreBtn.click();
          return true;
        }
        return false;
      });

      if (!loadMoreClicked) {
        console.log(`   滚动${scrollCount + 1}次后停止（无新内容）`);
        break;
      }
      await delay(2000);
    }

    lastHeight = newHeight;
    scrollCount++;
    console.log(`   滚动进度: ${scrollCount}/${maxScrolls}`);
  }

  return scrollCount;
}

async function crawlEssencePosts() {
  console.log("=== 踩蘑菇精华帖完整爬虫 ===\n");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  try {
    // 第一步：访问圈子页面并筛选精华帖
    console.log("1. 访问页面并点击精华筛选...");

    // 先访问圈子主页
    await page.goto(CIRCLE_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await delay(2000);

    // 点击精华筛选按钮
    const essenceClicked = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent?.trim() === "精华" && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (!essenceClicked) {
      console.log("   ⚠ 未找到精华按钮，尝试URL参数...");
      await page.goto(CIRCLE_URL + "?filter=essence", { waitUntil: "networkidle2", timeout: 60000 });
      await delay(2000);
    } else {
      console.log("   ✓ 已点击精华筛选");
      await delay(3000);
    }

    // 第二步：滚动加载所有帖子
    console.log("\n2. 滚动加载所有精华帖...");
    await scrollToLoadAll(page, 30);

    // 第三步：获取所有精华帖列表
    console.log("\n3. 提取帖子列表...");

    const postLinks = await page.evaluate(() => {
      const posts = [];
      const seenIds = new Set();

      // 查找所有帖子链接
      const links = document.querySelectorAll('a[href*="/post/"]');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || !href.match(/\/post\/\d+\.html/)) return;

        const match = href.match(/\/post\/(\d+)\.html/);
        if (!match || seenIds.has(match[1])) return;

        const text = link.textContent?.trim() || "";
        if (text.length < 5 || text.length > 200) return;
        if (text.includes("登录") || text.includes("注册") || text.includes("发帖")) return;

      // 过滤非BD攻略帖
        const excludeKeywords = ['登录', '注册', '发帖', '公告', '置顶', '工具', '讨论', '新增', '更新', '说明', '介绍', '招募', 'QQ群', '微信', '群号', '圈子'];
        if (excludeKeywords.some(kw => text.includes(kw))) return;

        // BD攻略帖通常包含这些关键词
        const bdKeywords = ['BD', 'bd', 'Build', '攻略', 'build', '流派', '开荒', '速刷', '刷图', '通关', '毕业', '装备', '技能', '天赋', '升华', '职业', '女巫', '圣殿', '判官', '寡妇', '战士', '刺客', '游侠', '野蛮人', '决斗', '贵族', '暗影', '欺诈'];

        seenIds.add(match[1]);
        posts.push({
          id: match[1],
          title: text,
          href: href.startsWith("http") ? href : "https://www.caimogu.cc" + href,
          isLikelyBD: bdKeywords.some(kw => text.includes(kw))
        });
      });

      // 按BD可能性排序，BD帖子优先
      posts.sort((a, b) => (b.isLikelyBD ? 1 : 0) - (a.isLikelyBD ? 1 : 0));

      return posts;
    });

    console.log(`   获取到 ${postLinks.length} 个帖子链接`);

    // 第四步：进入每个帖子详情页抓取内容
    console.log("\n4. 进入详情页抓取内容...");

    const detailedPosts = [];

    for (let i = 0; i < Math.min(postLinks.length, 20); i++) { // 限制最多20个详情页
      const post = postLinks[i];
      console.log(`   [${i + 1}/${Math.min(postLinks.length, 20)}] 抓取: ${post.title.substring(0, 40)}...`);

      try {
        await page.goto(post.href, { waitUntil: "networkidle2", timeout: 30000 });
        await delay(2000);

        // 提取详情页内容
        const detail = await page.evaluate(() => {
          const result = {
            postId: "",
            title: "",
            author: "",
            publishTime: "",
            viewCount: "",
            likeCount: "",
            content: "",
            images: [],
            tags: [],
            summary: "",
            skillTreeImages: [],
            equipment: []
          };

          // 提取基本信息
          result.postId = window.location.pathname.match(/\/post\/(\d+)\.html/)?.[1] || "";
          result.title = document.querySelector('.post-title, h1.title, h1')?.textContent?.trim() || "";
          result.title = result.title || document.querySelector('[class*="title"]')?.textContent?.trim() || "";

          // 作者
          const authorEl = document.querySelector('.author-name, .author, .username, [class*="author-name"], a[href*="/user/"]');
          result.author = authorEl?.textContent?.trim() || "";

          // 时间
          const timeEl = document.querySelector('.post-time, .time, .date, [class*="time"], [class*="date"]');
          result.publishTime = timeEl?.textContent?.trim() || "";

          // 浏览量、点赞、收藏
          const viewEl = document.querySelector('[class*="view"]');
          result.viewCount = viewEl?.textContent?.trim() || "";

          // 点赞数
          const likeEl = document.querySelector('[class*="like"], [class*="thumb"], .like-count, .点赞');
          result.likeCount = likeEl?.textContent?.trim() || "0";

          // 收藏数
          const favEl = document.querySelector('[class*="fav"], [class*="collect"], .favorite-count, .收藏');
          result.favorites = favEl?.textContent?.trim() || "0";

          // 内容 - 使用正确的选择器
          const contentEl = document.querySelector('.post-content, #post-content, [class*="post-content"]');
          if (contentEl) {
            result.content = contentEl.innerText?.trim() || "";

            // 提取所有图片
            const imgs = contentEl.querySelectorAll('img');
            result.images = Array.from(imgs).map(img => ({
              src: img.getAttribute('src') || img.getAttribute('data-src') || "",
              alt: img.getAttribute('alt') || "",
              width: img.naturalWidth || 0
            })).filter(img => img.src && !img.src.includes('avatar') && !img.src.includes('logo'));

            // 识别技能树图片（通常是比较宽的图片）
            result.skillTreeImages = result.images.filter(img => img.width > 800);
          }

          // 标签
          const tagEls = document.querySelectorAll('[class*="tag"] a, [class*="label"] a, .tag-list a');
          result.tags = Array.from(tagEls).map(tag => tag.textContent?.trim()).filter(Boolean);

          // 摘要（前300字）
          result.summary = result.content.substring(0, 300) + (result.content.length > 300 ? "..." : "");

          // 尝试提取装备信息（从内容中）
          const equipmentKeywords = ['装备', '武器', '护甲', '首饰', '暗金', '传奇', '基底', '词缀'];
          if (equipmentKeywords.some(kw => result.content.includes(kw))) {
            // 提取包含装备关键词的段落
            const lines = result.content.split('\n');
            result.equipment = lines.filter(line => equipmentKeywords.some(kw => line.includes(kw))).slice(0, 10);
          }

          return result;
        });

        detailedPosts.push({
          ...post,
          ...detail
        });

        // 截图详情页（用于调试）
        if (i < 3) {
          const screenshotPath = path.join(__dirname, `detail_${post.id}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
        }

      } catch (e) {
        console.log(`   ⚠ 抓取失败: ${e.message}`);
        detailedPosts.push({
          ...post,
          error: e.message
        });
      }

      // 返回列表页继续抓取
      await page.goBack();
      await delay(1500);
    }

    // 第五步：过滤低质量帖子（确保是BD攻略）
    console.log("\n5. 过滤低质量帖子...");

    // BD攻略帖应该包含内容且内容长度足够
    const validPosts = detailedPosts.filter(post => {
      // 标题太短或太长的过滤
      if (!post.title || post.title.length < 5) return false;
      if (post.title.length > 100) return false;

      // 过滤公告帖特征
      const titleLower = post.title.toLowerCase();
      if (titleLower.includes('公告') || titleLower.includes('置顶') || titleLower.includes('工具')) {
        return false;
      }

      // 内容太短的不是有效攻略
      if (!post.content || post.content.length < 100) return false;

      // 过滤导航菜单内容（通常是"置顶"、"流放之路2:降临"等）
      if (post.content.includes('流放之路2新增工具讨论圈子') ||
          post.content.includes('请勿发无关帖子') ||
          post.content.includes('禁止')) {
        return false;
      }

      return true;
    });

    console.log(`   过滤后有效帖子: ${validPosts.length} 个`);

    // 第六步：保存数据
    console.log("\n6. 保存数据...");

    const output = {
      source: "caimogu.cc/circle/449",
      circleName: "流放之路2:降临",
      filter: "essence",
      crawlTime: new Date().toISOString(),
      summary: {
        totalPosts: postLinks.length,
        detailedPosts: detailedPosts.length,
        validPosts: validPosts.length
      },
      postLinks: postLinks,
      detailedPosts: detailedPosts,
      validPosts: validPosts // 只包含有效BD帖子
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
    console.log(`   ✓ 数据已保存: ${OUTPUT_FILE}`);

    // 第六步：打印摘要
    console.log("\n=== 抓取结果摘要 ===");
    console.log(`帖子总数: ${postLinks.length}`);
    console.log(`详情页抓取: ${detailedPosts.length}`);
    console.log(`有效BD帖子: ${validPosts.length}`);

    console.log("\n=== 前5个有效BD帖子 ===");
    validPosts.slice(0, 5).forEach((post, i) => {
      console.log(`\n${i + 1}. ${post.title}`);
      console.log(`   作者: ${post.author} | 时间: ${post.publishTime}`);
      console.log(`   内容: ${post.summary?.substring(0, 100)}...`);
      console.log(`   图片: ${post.images?.length || 0}张`);
    });

  } catch (error) {
    console.error("爬取出错:", error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

// 导出函数
module.exports = { crawlEssencePosts };

// 直接运行时执行
if (require.main === module) {
  console.log('开始执行爬虫...\n');
  crawlEssencePosts()
    .then(() => {
      console.log('\n✅ 爬虫执行完成');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ 爬虫执行失败:', err.message);
      process.exit(1);
    });
}
