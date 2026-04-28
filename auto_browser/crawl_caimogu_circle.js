#!/usr/bin/env node
/**
 * 踩蘑菇网圈子帖子爬虫 - 爬取流放之路2:降临圈子精华帖
 * https://www.caimogu.cc/circle/449.html
 *
 * 功能：
 * 1. 点击"精华"筛选按钮获取精华帖
 * 2. 提取帖子标题、作者、发布时间
 * 3. 识别BD推荐类帖子
 */

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const CIRCLE_URL = "https://www.caimogu.cc/circle/449.html";
const OUTPUT_FILE = path.join(__dirname, "caimogu_circle_essence_posts.json");

// BD相关关键词（用于识别BD推荐帖）
const BD_KEYWORDS = [
  "bd", "BD", "Bd", "build", "Build", "BUILD",
  "开荒", "毕业", "通关", "最强", "t1", "T1", "tier",
  "攻略", "思路", "玩法", "加点", "天赋", "升华",
  "配装", "出装", "装备", "build", "流派", "职业",
  "闪电箭", "榴弹", "召唤", "图腾", "陷阱", "地雷",
  "德鲁伊", "女巫", "战士", "游侠", "圣殿", "刺客", "野蛮人"
];

// 判断是否是BD推荐相关帖子的函数
function isBDRelated(title) {
  const lowerTitle = title.toLowerCase();
  return BD_KEYWORDS.some(keyword => lowerTitle.includes(keyword.toLowerCase()));
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function crawlCirclePosts() {
  console.log("=== 踩蘑菇圈子精华帖爬虫 ===");
  console.log("目标: 获取流放2精华帖中的BD推荐内容\n");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 3000 });

  // 设置User-Agent
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  try {
    console.log("1. 访问页面:", CIRCLE_URL);
    await page.goto(CIRCLE_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await delay(3000);

    // 获取页面标题
    const pageTitle = await page.title();
    console.log("   页面标题:", pageTitle);

    console.log("\n2. 点击'精华'筛选按钮...");

    // 方法: 点击包含"精华"文字的筛选标签
    const essenceClicked = await page.evaluate(() => {
      // 查找所有可能包含筛选标签的元素
      const selectors = [
        'a:contains("精华")',
        'span:contains("精华")',
        '.filter-item',
        '.tab-item',
        '[data-filter]',
        '.nav-item'
      ];

      // 遍历所有元素查找包含"精华"文字的元素
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent?.trim() === "精华" && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
          console.log("找到精华元素:", el.tagName, el.className);
          // 点击元素或其父元素（如果是链接）
          if (el.tagName === 'A') {
            el.click();
          } else {
            el.click();
          }
          return { success: true, tagName: el.tagName, className: el.className };
        }
      }
      return { success: false };
    });

    if (essenceClicked.success) {
      console.log("   ✓ 已点击精华筛选按钮 (", essenceClicked.tagName, ")");
      await delay(3000);
    } else {
      console.log("   ⚠ 未找到精华按钮，使用URL参数方法...");
      await page.goto(CIRCLE_URL + "?filter=essence", { waitUntil: "networkidle2", timeout: 60000 });
      await delay(3000);
    }

    console.log("\n3. 获取帖子列表...");

    // 获取帖子数据 - 改进提取逻辑
    const postsData = await page.evaluate(() => {
      const posts = [];
      const seenIds = new Set();

      // 方法1: 查找帖子列表容器
      const postContainers = document.querySelectorAll('.post-item, .topic-item, [class*="post"], [class*="topic"]');

      if (postContainers.length > 0) {
        // 使用容器方式提取
        postContainers.forEach(container => {
          const linkEl = container.querySelector('a[href*="/post/"]');
          const authorEl = container.querySelector('.author, .username, [class*="author"], [class*="user"]');
          const timeEl = container.querySelector('.time, .date, [class*="time"], [class*="date"]');

          if (linkEl) {
            const href = linkEl.getAttribute('href');
            const match = href?.match(/\/post\/(\d+)\.html/);
            if (match && !seenIds.has(match[1])) {
              seenIds.add(match[1]);
              posts.push({
                id: match[1],
                title: linkEl.textContent?.trim() || "",
                href: href.startsWith("http") ? href : "https://www.caimogu.cc" + href,
                author: authorEl?.textContent?.trim() || "",
                time: timeEl?.textContent?.trim() || ""
              });
            }
          }
        });
      }

      // 方法2: 如果方法1没有结果，使用链接方式
      if (posts.length === 0) {
        const links = document.querySelectorAll('a[href*="/post/"]');
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (!href || !href.match(/\/post\/\d+\.html/)) return;

          const match = href.match(/\/post\/(\d+)\.html/);
          if (!match || seenIds.has(match[1])) return;

          const postId = match[1];
          const text = link.textContent?.trim() || "";

          // 过滤条件
          if (text.length < 5 || text.length > 100) return;
          if (text.includes("登录") || text.includes("注册") || text.includes("发帖")) return;
          if (text.match(/^\d+$/)) return;

          seenIds.add(postId);
          posts.push({
            id: postId,
            title: text,
            href: href.startsWith("http") ? href : "https://www.caimogu.cc" + href,
            author: "",
            time: ""
          });
        });
      }

      return posts;
    });

    console.log("   获取到 " + postsData.length + " 个帖子");

    // 获取页面文本分析
    const pageText = await page.evaluate(() => {
      return document.body.innerText;
    });

    // 分析文本提取更多数据
    const parsedPosts = [];
    const lines = pageText.split('\n').filter(l => l.trim().length > 0);

    // 提取帖子数据: 作者ID + 标题
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 检测是否是作者ID
      const isAuthor = line.match(/^\d{5,}$/) || (line.match(/^[a-zA-Z_]{3,15}$/) && !["login", "register", "home", "user"].includes(line.toLowerCase()));
      if (isAuthor) {
        const author = line;
        let title = "";
        let time = "";

        // 向下查找标题
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine.length > 10 && nextLine.length < 200) {
            title = nextLine;
            break;
          }
        }

        // 再向下查找时间
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine.match(/\d{1,2}:\d{2}/) || nextLine.match(/\d{4}-\d{2}-\d{2}/)) {
            time = nextLine;
            break;
          }
        }

        if (title) {
          parsedPosts.push({
            author,
            title,
            time
          });
        }
      }
    }

    console.log("   解析出 " + parsedPosts.length + " 个帖子详情");

    // 识别BD推荐相关帖子
    const bdPosts = parsedPosts.filter(post => isBDRelated(post.title));
    console.log("\n4. BD相关帖子分析:");
    console.log("   - 总帖子数:", parsedPosts.length);
    console.log("   - BD相关帖:", bdPosts.length);

    // 按关键词分类
    const categories = {
      "开荒/毕业BD": [],
      "装备/词条": [],
      "攻略/玩法": [],
      "工具/补丁": [],
      "其他": []
    };

    parsedPosts.forEach(post => {
      const title = post.title.toLowerCase();
      if (title.includes("开荒") || title.includes("毕业") || title.includes("bd") || title.includes("build") || title.includes("流派")) {
        categories["开荒/毕业BD"].push(post);
      } else if (title.includes("装备") || title.includes("暗金") || title.includes("词条") || title.includes("传奇")) {
        categories["装备/词条"].push(post);
      } else if (title.includes("攻略") || title.includes("玩法") || title.includes("思路") || title.includes("升华") || title.includes("天赋")) {
        categories["攻略/玩法"].push(post);
      } else if (title.includes("补丁") || title.includes("工具") || title.includes("过滤") || title.includes("查价")) {
        categories["工具/补丁"].push(post);
      } else {
        categories["其他"].push(post);
      }
    });

    console.log("\n5. 帖子分类统计:");
    for (const [cat, posts] of Object.entries(categories)) {
      console.log(`   [${cat}]: ${posts.length} 篇`);
    }

    // 保存数据
    const output = {
      source: "caimogu.cc/circle/449",
      circleName: "流放之路2:降临",
      filter: "essence",  // 标记是精华帖
      crawlTime: new Date().toISOString(),
      summary: {
        totalPosts: parsedPosts.length,
        bdRelatedPosts: bdPosts.length,
        categories: {
          "开荒/毕业BD": categories["开荒/毕业BD"].length,
          "装备/词条": categories["装备/词条"].length,
          "攻略/玩法": categories["攻略/玩法"].length,
          "工具/补丁": categories["工具/补丁"].length,
          "其他": categories["其他"].length
        }
      },
      posts: parsedPosts,
      bdPosts: bdPosts,
      categories: categories
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
    console.log("\n6. 数据已保存到:", OUTPUT_FILE);

    // 打印BD相关帖子
    console.log("\n=== BD推荐相关帖子 ===");
    if (bdPosts.length > 0) {
      bdPosts.slice(0, 15).forEach((post, i) => {
        console.log(`${i + 1}. ${post.title}`);
        console.log(`   作者: ${post.author} | 时间: ${post.time || "未知"}`);
      });
      if (bdPosts.length > 15) {
        console.log(`\n... 还有 ${bdPosts.length - 15} 篇`);
      }
    } else {
      console.log("未找到BD相关帖子");
    }

    // 打印每个分类的代表性帖子
    console.log("\n=== 各分类代表性帖子 ===");
    for (const [cat, posts] of Object.entries(categories)) {
      if (posts.length > 0) {
        console.log(`\n【${cat}】`);
        posts.slice(0, 3).forEach((post, i) => {
          console.log(`  ${i + 1}. ${post.title}`);
        });
      }
    }

  } catch (error) {
    console.error("爬取出错:", error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

// 运行爬虫
crawlCirclePosts().catch(console.error);
