/**
 * 调试脚本 - 分析 poe.ninja 页面结构
 * 用于诊断天赋树截图和 keystones 图标问题
 * 
 * 运行方式: NODE_ENV=dev node test/debug_page_structure.js
 */

const puppeteer = require("puppeteer");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../auto_browser/.env") });

const BASE_URL = "https://poe.ninja/poe2/builds";

async function debugPage() {
  console.log("🚀 启动浏览器...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--enable-webgl",
      "--use-gl=angle",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // 直接导航到玩家页面
    const targetUrl =
      "https://poe.ninja/poe2/builds/vaal/character/Whiteyang123456-2065/%E7%9C%8B%E7%9C%8B%E4%BD%A0%E7%9A%84%E7%89%9B%E5%AD%90?i=0&search=class%3DOracle";

    console.log("\n📍 正在打开页面:", targetUrl);
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // 等待天赋树元素出现
    console.log("\n⏳ 等待天赋树渲染...");
    try {
      await page.waitForSelector('[data-tooltip-canvas="true"]', { timeout: 15000 });
      console.log("✅ 天赋树容器已出现");

      // 额外等待让 WebGL 完全渲染
      await page.waitForTimeout(5000);
    } catch (e) {
      console.log("⚠️ 天赋树容器未找到:", e.message);
    }

    // ============================================
    // 1. 分析天赋树结构
    // ============================================
    console.log("\n" + "=".repeat(60));
    console.log("【天赋树结构分析】");
    console.log("=".repeat(60));

    const treeAnalysis = await page.evaluate(() => {
      const container = document.querySelector('[data-tooltip-canvas="true"]');
      if (!container) return { found: false };

      const rect = container.getBoundingClientRect();
      const canvas = container.querySelector('canvas');
      const style = window.getComputedStyle(container);

      // 检测 canvas 类型
      let canvasInfo = null;
      if (canvas) {
        const width = canvas.width;
        const height = canvas.height;

        // 尝试获取 WebGL 上下文
        let webglInfo = null;
        try {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (gl) {
            const pixels = new Uint8Array(4);
            gl.readPixels(width / 2, height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            webglInfo = {
              type: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
              centerPixel: Array.from(pixels),
              isBlack: pixels[0] === 0 && pixels[1] === 0 && pixels[2] === 0
            };
          }
        } catch (e) {
          webglInfo = { error: e.message };
        }

        // 尝试 2D 上下文
        let ctx2dInfo = null;
        try {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const imgData = ctx.getImageData(width / 2, height / 2, 1, 1);
            ctx2dInfo = {
              centerPixel: Array.from(imgData.data),
              isBlack: imgData.data[0] === 0 && imgData.data[1] === 0 && imgData.data[2] === 0
            };
          }
        } catch (e) {
          ctx2dInfo = { error: e.message };
        }

        canvasInfo = {
          width,
          height,
          actualWidth: canvas.offsetWidth,
          actualHeight: canvas.offsetHeight,
          webgl: webglInfo,
          ctx2d: ctx2dInfo
        };
      }

      return {
        found: true,
        containerRect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        scrollInfo: {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          absoluteX: Math.round(rect.x + window.scrollX),
          absoluteY: Math.round(rect.y + window.scrollY)
        },
        backgroundImage: style.backgroundImage,
        canvas: canvasInfo,
        childCount: container.children.length,
        innerHTML_preview: container.innerHTML.substring(0, 500)
      };
    });

    console.log(JSON.stringify(treeAnalysis, null, 2));

    // 截图测试
    if (treeAnalysis.found && treeAnalysis.containerRect) {
      console.log("\n📸 尝试截图天赋树区域...");

      const { absoluteX, absoluteY } = treeAnalysis.scrollInfo;
      const { width, height } = treeAnalysis.containerRect;

      const screenshotBuffer = await page.screenshot({
        type: "jpeg",
        quality: 80,
        clip: {
          x: absoluteX,
          y: absoluteY,
          width: Math.min(width, 1200),
          height: Math.min(height, 1200)
        }
      });

      const fs = require("fs");
      const outputPath = path.join(__dirname, "../debug_tree.jpg");
      fs.writeFileSync(outputPath, screenshotBuffer);
      console.log(`✅ 截图已保存: ${outputPath} (${screenshotBuffer.length} bytes)`);
    }

    // ============================================
    // 2. 分析 API 返回的数据结构
    // ============================================
    console.log("\n" + "=".repeat(60));
    console.log("【API 数据结构分析】");
    console.log("=".repeat(60));

    const apiAnalysis = await page.evaluate(() => {
      // 尝试从 __NEXT_DATA__ 获取
      let nextData = null;
      try {
        const el = document.getElementById("__NEXT_DATA__");
        if (el) {
          const parsed = JSON.parse(el.innerText);
          nextData = {
            hasCharacter: !!parsed.props?.pageProps?.character,
            keys: Object.keys(parsed.props?.pageProps || {}),
            characterKeys: Object.keys(parsed.props?.pageProps?.character || {}),
            hasKeystones: !!parsed.props?.pageProps?.character?.keystones,
            keystonesSample: parsed.props?.pageProps?.character?.keystones
              ? parsed.props?.pageProps?.character.keystones.slice(0, 2)
              : null
          };
        }
      } catch (e) {
        nextData = { error: e.message };
      }

      return {
        nextData,
        url: window.location.href
      };
    });

    console.log(JSON.stringify(apiAnalysis, null, 2));

    // ============================================
    // 3. 分析页面上所有图标图片
    // ============================================
    console.log("\n" + "=".repeat(60));
    console.log("【图标图片分析】");
    console.log("=".repeat(60));

    const iconAnalysis = await page.evaluate(() => {
      const allImgs = Array.from(document.querySelectorAll('img'));

      // 找出包含 keystone 或 passive 的图片
      const relevantImgs = allImgs
        .filter(img => {
          const src = (img.src || img.getAttribute('data-src') || '').toLowerCase();
          const alt = (img.alt || '').toLowerCase();
          return src.includes('keystone') ||
                 src.includes('passive') ||
                 alt.includes('keystone') ||
                 alt.includes('Keystone');
        })
        .map(img => ({
          src: img.src || img.getAttribute('data-src'),
          alt: img.alt,
          visible: img.offsetParent !== null && img.offsetWidth > 0,
          width: img.offsetWidth,
          height: img.offsetHeight,
          className: img.className?.substring(0, 50)
        }));

      // 统计所有 passives 目录的图片
      const passiveImgs = allImgs
        .filter(img => (img.src || '').includes('/passives/'))
        .map(img => ({
          src: img.src,
          visible: img.offsetParent !== null
        }));

      return {
        totalImages: allImgs.length,
        keystoneRelated: relevantImgs,
        passiveDirectoryCount: passiveImgs.length,
        passiveSamples: passiveImgs.slice(0, 5)
      };
    });

    console.log(JSON.stringify(iconAnalysis, null, 2));

  } catch (error) {
    console.error("❌ 错误:", error);
  } finally {
    await browser.close();
    console.log("\n✅ 调试完成");
  }
}

debugPage().catch(console.error);
