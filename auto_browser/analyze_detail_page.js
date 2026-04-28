#!/usr/bin/env node
/**
 * 分析踩蘑菇帖子详情页的DOM结构
 */
const puppeteer = require("puppeteer");

async function analyzeDetailPage() {
  console.log("=== 分析踩蘑菇详情页DOM结构 ===\n");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 3000 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");

  try {
    // 访问一个BD帖子
    const testUrl = "https://www.caimogu.cc/post/2307705.html"; // 【BD】万盾80万榴弹13万电喷猎魔人
    console.log("访问:", testUrl);
    await page.goto(testUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // 截图
    await page.screenshot({ path: __dirname + "/debug_detail_page.png", fullPage: false });
    console.log("截图已保存: debug_detail_page.png");

    // 分析页面结构
    const analysis = await page.evaluate(() => {
      const result = {
        mainContent: [],
        postContent: null,
        allTextElements: [],
        possibleContentContainers: []
      };

      // 1. 查找主要内容容器
      const contentSelectors = [
        '.post-content',
        '.content',
        '.article-content',
        '.post-body',
        '.topic-content',
        '[class*="content"]',
        '[class*="post"]',
        '[class*="article"]',
        'article',
        'main'
      ];

      contentSelectors.forEach(selector => {
        try {
          const el = document.querySelector(selector);
          if (el && el.innerText.length > 100) {
            result.possibleContentContainers.push({
              selector,
              tagName: el.tagName,
              className: el.className,
              textLength: el.innerText.length,
              childCount: el.children.length
            });
          }
        } catch (e) {}
      });

      // 2. 查找可能的内容区域（包含长文本）
      const bodyChildren = document.body.children;
      for (const child of bodyChildren) {
        const text = child.innerText?.trim() || "";
        if (text.length > 500) {
          result.allTextElements.push({
            tag: child.tagName,
            class: child.className.substring(0, 50),
            textLength: text.length,
            id: child.id
          });
        }
      }

      // 3. 尝试找到帖子正文
      const postContentSelectors = [
        '.post-content',
        '#post-content',
        '[class*="post-content"]',
        '.content-body',
        '.article-body'
      ];

      for (const selector of postContentSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          result.postContent = {
            selector,
            text: el.innerText?.substring(0, 1000),
            images: Array.from(el.querySelectorAll('img')).map(img => img.src)
          };
          break;
        }
      }

      // 4. 查找所有图片
      const allImages = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt,
        width: img.naturalWidth,
        className: img.className.substring(0, 30)
      })).filter(img => img.src && img.width > 100);

      result.images = allImages;

      // 5. 获取页面文本（过滤导航）
      const navSelectors = ['nav', 'header', 'footer', '.nav', '.menu', '.sidebar'];
      navSelectors.forEach(sel => {
        const nav = document.querySelector(sel);
        if (nav) nav.remove();
      });

      result.filteredBodyText = document.body.innerText.substring(0, 2000);

      return result;
    });

    console.log("\n=== 内容容器候选 ===");
    analysis.possibleContentContainers.forEach(c => {
      console.log(`[${c.selector}] ${c.tagName} class="${c.className}" textLen=${c.textLength}`);
    });

    console.log("\n=== 页面大文本区块 ===");
    analysis.allTextElements.slice(0, 5).forEach(el => {
      console.log(`<${el.tag}> class="${el.class}" len=${el.textLength}`);
    });

    console.log("\n=== 帖子正文内容 ===");
    if (analysis.postContent) {
      console.log(`选择器: ${analysis.postContent.selector}`);
      console.log(`正文预览:\n${analysis.postContent.text?.substring(0, 500)}`);
      console.log(`\n图片数量: ${analysis.postContent.images?.length || 0}`);
    } else {
      console.log("未找到帖子正文容器");
    }

    console.log("\n=== 页面图片 ===");
    analysis.images?.slice(0, 10).forEach(img => {
      console.log(`- ${img.src.substring(0, 80)}... (${img.width}px)`);
    });

    console.log("\n=== 过滤导航后的页面文本 ===");
    console.log(analysis.filteredBodyText?.substring(0, 800));

  } catch (error) {
    console.error("分析出错:", error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

analyzeDetailPage().catch(console.error);
