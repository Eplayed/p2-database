const { runTask } = require('./translate_crawler');
const uploadToOss = require('./upload_to_oss');
const fs = require('fs');

// 定义 OSS 存储前缀
const OSS_TARGET_PREFIX = process.env.NODE_ENV === 'production' ? 'release/' : 'dev/';

exports.handler = async (event, context, callback) => {
    console.log("🔔 [FC] 任务触发 (Node.js 20 + Puppeteer Layer)");

    // 🔍 关键调试：检查 Chrome 是否存在于官方层的路径
    const chromePath = '/opt/chrome/chrome';
    if (fs.existsSync(chromePath)) {
        console.log(`✅ 找到 Chrome: ${chromePath}`);
    } else {
        console.error(`❌ 未找到 Chrome，请检查是否添加了 Puppeteer 官方层！`);
    }

    try {
        // 1. 执行爬虫
        // runTask 内部会自动读取环境变量中的 Chrome 路径配置
        // 我们需要在 translate_crawler.js 里做一点微调，或者通过环境变量传递
        process.env.CHROME_PATH = chromePath; 
        
        const dataDir = await runTask();
        
        // 2. 执行上传
        await uploadToOss(dataDir, OSS_TARGET_PREFIX);
        
        callback(null, 'Task Success');
    } catch (error) {
        console.error("❌ [FC] 任务失败:", error);
        callback(error);
    }
};