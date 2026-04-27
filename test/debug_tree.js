const puppeteer = require("puppeteer");

async function debugPage() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log("正在打开页面...");

  // 直接导航到页面，等待网络空闲
  await page.goto(
    "https://poe.ninja/poe2/builds/vaal/character/Whiteyang123456-2065/%E7%9C%8B%E7%9C%8B%E4%BD%A0%E7%9A%84%E7%89%9B%E5%AD%90?i=0&search=class%3DOracle",
    { waitUntil: "networkidle2", timeout: 60000 }
  );

  // 等待页面完全加载
  await page.waitForTimeout(3000);

  console.log("\n=== 1. 检查天赋树容器 ===");
  const treeInfo = await page.evaluate(() => {
    const tooltipCanvas = document.querySelector('[data-tooltip-canvas="true"]');
    if (!tooltipCanvas) return { found: false };

    const rect = tooltipCanvas.getBoundingClientRect();
    const canvasEl = tooltipCanvas.querySelector('canvas');

    // 检查 canvas 的上下文类型
    let ctxType = 'unknown';
    let canvasWidth = 0, canvasHeight = 0;
    if (canvasEl) {
      canvasWidth = canvasEl.width;
      canvasHeight = canvasEl.height;

      try {
        if (canvasEl.getContext('webgl2') || canvasEl.getContext('webgl')) {
          ctxType = 'webgl';
        } else if (canvasEl.getContext('2d')) {
          ctxType = '2d';
        }
      } catch(e) {
        ctxType = 'error: ' + e.message;
      }
    }

    // 检查是否有背景图片或SVG
    const style = window.getComputedStyle(tooltipCanvas);
    const bgImage = style.backgroundImage;
    const svg = tooltipCanvas.querySelector('svg');

    return {
      found: true,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      canvas: canvasEl ? {
        width: canvasWidth,
        height: canvasHeight,
        ctxType,
        opacity: window.getComputedStyle(canvasEl).opacity
      } : null,
      bgImage,
      hasSvg: !!svg,
      parentClass: tooltipCanvas.parentElement?.className?.substring(0, 100)
    };
  });
  console.log(JSON.stringify(treeInfo, null, 2));

  console.log("\n=== 2. 检查 Keystones 图标 ===");
  const keystoneInfo = await page.evaluate(() => {
    // 尝试多种选择器找 keystones
    const selectors = [
      '[class*="keystone"]',
      '[class*="Keystone"]',
      'img[src*="keystone"]',
      'img[src*="keystones"]',
      '[data-tooltip*="keystone"]',
      '[data-tooltip*="Keystone"]',
      'img[alt*="Keystone"]',
      'img[alt*="keystone"]'
    ];

    const results = {};
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        results[sel] = els.length;
      }
    }

    // 检查包含 keystone 字样的所有图片
    const allImgs = document.querySelectorAll('img');
    const keystoneImgs = [];
    allImgs.forEach(img => {
      const src = img.src || img.getAttribute('data-src') || '';
      const alt = img.alt || '';
      if (src.toLowerCase().includes('keystone') || alt.toLowerCase().includes('keystone')) {
        keystoneImgs.push({
          src: src.substring(0, 100),
          alt: alt.substring(0, 50),
          visible: img.offsetParent !== null,
          width: img.width,
          height: img.height
        });
      }
    });

    // 检查所有以 passives/ 开头的图片
    const passiveImgs = [];
    allImgs.forEach(img => {
      const src = img.src || img.getAttribute('data-src') || '';
      if (src.includes('/passives/')) {
        passiveImgs.push({
          src: src.substring(0, 100),
          alt: img.alt?.substring(0, 50),
          visible: img.offsetParent !== null
        });
      }
    });

    return {
      selectors,
      keystoneImgs,
      passiveImgs,
      totalImgs: allImgs.length
    };
  });
  console.log(JSON.stringify(keystoneInfo, null, 2));

  console.log("\n=== 3. 尝试截图天赋树区域 ===");
  try {
    const screenshotResult = await page.evaluate(async () => {
      const tooltipCanvas = document.querySelector('[data-tooltip-canvas="true"]');
      if (!tooltipCanvas) return { error: 'not found' };

      const rect = tooltipCanvas.getBoundingClientRect();

      // 获取页面滚动位置
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scroll: { x: scrollX, y: scrollY },
        // absolute position for screenshot
        absX: rect.x + scrollX,
        absY: rect.y + scrollY,
        // 检查 canvas 是否渲染了内容
        canvasCheck: (() => {
          const canvas = tooltipCanvas.querySelector('canvas');
          if (!canvas) return { found: false };

          // 尝试读取像素
          try {
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (gl) {
              const pixels = new Uint8Array(4);
              gl.readPixels(canvas.width/2, canvas.height/2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
              return { found: true, type: 'webgl', centerPixel: Array.from(pixels) };
            }

            const ctx2d = canvas.getContext('2d');
            if (ctx2d) {
              const imgData = ctx2d.getImageData(canvas.width/2, canvas.height/2, 1, 1);
              return { found: true, type: '2d', centerPixel: Array.from(imgData.data) };
            }
          } catch(e) {
            return { found: true, error: e.message };
          }
          return { found: true };
        })()
      };
    });

    console.log("截图信息:", JSON.stringify(screenshotResult, null, 2));

    // 使用绝对坐标截图
    const imgBuffer = await page.screenshot({
      type: "jpeg",
      quality: 60,
      clip: {
        x: screenshotResult.absX,
        y: screenshotResult.absY,
        width: Math.min(screenshotResult.rect.width, 1200),
        height: Math.min(screenshotResult.rect.height, 1200)
      }
    });

    const fs = require('fs');
    fs.writeFileSync('/Users/zhangyajun/Documents/project/p2-database/debug_tree.jpg', imgBuffer);
    console.log("✅ 天赋树截图已保存到 debug_tree.jpg");
    console.log("截图大小:", imgBuffer.length, "字节");

  } catch (e) {
    console.log("截图失败:", e.message);
  }

  await browser.close();
  console.log("\n调试完成！");
}

debugPage().catch(console.error);
