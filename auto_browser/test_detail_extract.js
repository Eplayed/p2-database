#!/usr/bin/env node
/**
 * 测试单个BD帖子详情页内容提取
 */
const puppeteer = require("puppeteer");

async function testDetailPage() {
  console.log("=== 测试BD帖子详情页提取 ===\n");

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 3000 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");

  try {
    // 测试几个BD帖子
    const testUrls = [
      "https://www.caimogu.cc/post/2307705.html", // 【BD】万盾80万榴弹13万电喷猎魔人
      "https://www.caimogu.cc/post/2301505.html", // 纠缠流德鲁伊开荒
      "https://www.caimogu.cc/post/2168287.html",  // BD模拟器0.4
    ];

    for (const url of testUrls) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`访问: ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise(r => setTimeout(r, 2000));

      // 提取内容
      const detail = await page.evaluate(() => {
        const contentEl = document.querySelector('.post-content, #post-content, [class*="post-content"]');
        const result = {
          title: document.querySelector('h1')?.textContent?.trim() || "",
          author: "",
          content: "",
          images: [],
          skillTreeImages: []
        };

        if (contentEl) {
          result.content = contentEl.innerText?.trim() || "";

          // 图片
          const imgs = contentEl.querySelectorAll('img');
          result.images = Array.from(imgs)
            .map(img => ({
              src: img.getAttribute('src') || img.getAttribute('data-src') || "",
              width: img.naturalWidth || 0
            }))
            .filter(img => img.src && !img.src.includes('avatar') && !img.src.includes('logo'));

          result.skillTreeImages = result.images.filter(img => img.width > 800);
        }

        // 作者
        const authorEl = document.querySelector('.author-name, .author, [class*="author-name"]');
        result.author = authorEl?.textContent?.trim() || "";

        return result;
      });

      console.log(`\n标题: ${detail.title}`);
      console.log(`作者: ${detail.author}`);
      console.log(`内容长度: ${detail.content.length} 字符`);
      console.log(`图片数量: ${detail.images.length}`);
      console.log(`技能树图片: ${detail.skillTreeImages.length}`);

      if (detail.content) {
        console.log(`\n内容预览（前500字）:\n${detail.content.substring(0, 500)}`);
      }

      if (detail.images.length > 0) {
        console.log(`\n图片列表（前5张）:`);
        detail.images.slice(0, 5).forEach(img => {
          console.log(`  - ${img.src.substring(0, 80)}... (${img.width}px)`);
        });
      }
    }

  } catch (error) {
    console.error("测试出错:", error.message);
  } finally {
    await browser.close();
  }
}

testDetailPage().catch(console.error);
