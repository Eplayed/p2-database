const https = require('https');
const fs = require('fs');

const TARGET_URL = 'https://www.poe2ggg.com/data-cn.js?v=9163399b';
const OUTPUT_FILE = './data/crafting_db.json';

// 确保目录存在
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

console.log('🚀 正在下载数据文件...');

https.get(TARGET_URL, (res) => {
    let rawData = '';

    res.on('data', (chunk) => { rawData += chunk; });

    res.on('end', () => {
        try {
            console.log(`📦 下载完成，文件大小: ${Math.round(rawData.length / 1024)} KB`);
            console.log('🧹 正在清洗数据 (JS -> JSON)...');

            // --- 核心清洗逻辑 ---
            // 1. 去掉开头: const poe2ItemData=  或者 var data = 
            // 找到第一个 '{' 或 '['
            const startIndex = rawData.indexOf('{');
            const endIndex = rawData.lastIndexOf('}');

            if (startIndex === -1 || endIndex === -1) {
                throw new Error("未在文件中找到有效的 JSON 对象结构");
            }

            // 截取中间的纯 JSON 部分
            let jsonString = rawData.substring(startIndex, endIndex + 1);

            // 2. 尝试解析
            // 有时候 JS 对象里的 Key 没有引号 (例如 { name: "..." })，标准的 JSON.parse 会报错
            // 如果报错，我们需要用 eval 或者 new Function 来解析 JS 对象
            let jsonData;
            try {
                jsonData = JSON.parse(jsonString);
            } catch (e) {
                console.log("⚠️ 标准 JSON 解析失败，尝试作为 JS 对象解析...");
                // 使用 new Function 安全地执行这段 JS 代码返回对象
                jsonData = new Function(`return ${jsonString}`)();
            }

            // 3. 验证数据质量
            const keys = Object.keys(jsonData);
            console.log(`✅ 解析成功！包含以下主要字段: ${keys.join(', ')}`);

            // 4. 保存为标准 JSON 文件
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(jsonData, null, 2));
            console.log(`💾 已保存至: ${OUTPUT_FILE}`);

            // 5. 打印预览，帮你分析下一步怎么做
            if (jsonData.categories || jsonData.bases || jsonData.mods) {
                console.log('\n--- 🎯 数据结构分析 ---');
                // 打印前几个 Key 看看结构
                const firstKey = keys[0];
                console.log(`示例字段 [${firstKey}]:`, JSON.stringify(jsonData[firstKey]).substring(0, 100) + '...');
            }

        } catch (e) {
            console.error('❌ 处理失败:', e.message);
        }
    });
}).on('error', (e) => {
    console.error('网络请求错误:', e.message);
});