/**
 * 轻量 HTTP 客户端 - 用于抓取 poe2db.tw 页面
 * 不依赖 Puppeteer，纯 HTTP + HTML 解析
 */

const https = require('https');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 请求间隔（毫秒），避免被封
const REQUEST_DELAY = 1500;

let lastRequestTime = 0;

/**
 * 发起 HTTPS GET 请求
 * @param {string} url 
 * @returns {Promise<string>} HTML 内容
 */
function fetchPage(url) {
  return new Promise(async (resolve, reject) => {
    // 限速
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < REQUEST_DELAY) {
      await new Promise(r => setTimeout(r, REQUEST_DELAY - elapsed));
    }
    lastRequestTime = Date.now();

    const options = {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://poe2db.tw/cn/',
      },
      rejectUnauthorized: false,
      timeout: 30000,
    };

    https.get(url, options, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 带重试的页面抓取
 */
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchPage(url);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`   ⚠️ 请求失败 (${i + 1}/${retries}): ${err.message}, 重试中...`);
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
}

module.exports = { fetchPage, fetchWithRetry };
