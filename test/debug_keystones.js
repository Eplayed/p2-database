/**
 * 调试 keystones 数据结构
 */
const puppeteer = require("puppeteer");

async function debugKeystones() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const targetUrl = "https://poe.ninja/poe2/builds/vaal/character/Whiteyang123456-2065/%E7%9C%8B%E7%9C%8B%E4%BD%A0%E7%9A%84%E7%89%9B%E5%AD%90?i=0&search=class%3DOracle";

  console.log("正在打开页面...");
  await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForTimeout(3000);

  // 获取 API 数据
  console.log("\n=== 1. 检查 API 返回的 keystones 数据 ===");
  const apiData = await page.evaluate(() => {
    try {
      const data = JSON.parse(document.getElementById("__NEXT_DATA__").innerText);
      const character = data.props?.pageProps?.character;
      return {
        hasKeystones: !!character?.keystones,
        keystonesCount: character?.keystones?.length || 0,
        keystones: character?.keystones?.map(k => ({
          name: k.name,
          hasIcon: !!k.icon,
          icon: k.icon,
          keys: Object.keys(k)
        })) || []
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log(JSON.stringify(apiData, null, 2));

  // 从页面 DOM 查找 keystones 图标
  console.log("\n=== 2. 从页面 DOM 查找 keystones 图标 ===");
  const domKeystones = await page.evaluate(() => {
    const results = [];

    // 方法1: 查找所有包含 keystone 的 img
    const allImgs = document.querySelectorAll('img');
    allImgs.forEach(img => {
      const src = img.src || '';
      if (src.toLowerCase().includes('keystone')) {
        results.push({
          method: 'img.src',
          src: src,
          alt: img.alt,
          className: img.className?.substring(0, 50)
        });
      }
    });

    // 方法2: 查找天赋树区域内的所有图片
    const tooltipCanvas = document.querySelector('[data-tooltip-canvas="true"]');
    if (tooltipCanvas) {
      const canvasImgs = tooltipCanvas.querySelectorAll('img');
      canvasImgs.forEach(img => {
        const src = img.src || '';
        results.push({
          method: 'canvas.img',
          src: src,
          alt: img.alt,
          isKeystone: src.toLowerCase().includes('keystone')
        });
      });
    }

    // 方法3: 查找所有 passives 目录的图片
    const passiveImgs = [];
    allImgs.forEach(img => {
      const src = img.src || '';
      if (src.includes('/passives/')) {
        passiveImgs.push({
          src: src,
          alt: img.alt
        });
      }
    });

    return {
      keystoneImgs: results,
      passiveImgs: passiveImgs.slice(0, 10)
    };
  });
  console.log(JSON.stringify(domKeystones, null, 2));

  // 方法4: 查找页面上所有 keystone 相关的元素
  console.log("\n=== 3. 查找 keystone 相关元素 ===");
  const keystoneElements = await page.evaluate(() => {
    // 查找包含 keystone 文本的元素
    const elements = [];
    const allElements = document.querySelectorAll('*');

    allElements.forEach(el => {
      const text = el.textContent?.toLowerCase() || '';
      if (text.includes('keystone') || text.includes('mind over matter')) {
        elements.push({
          tag: el.tagName,
          className: el.className?.substring(0, 50),
          text: el.textContent?.substring(0, 100)
        });
      }
    });

    return elements.slice(0, 10);
  });
  console.log(JSON.stringify(keystoneElements, null, 2));

  await browser.close();
  console.log("\n调试完成！");
}

debugKeystones().catch(console.error);
