#!/usr/bin/env node

const { runTask } = require('./auto_browser/translate_crawler');

console.log('🌐 启动流放之路2 数据翻译爬虫');
console.log('这个脚本将：');
console.log('1. 抓取英文网站数据');
console.log('2. 使用翻译字典进行中文翻译');
console.log('3. 保存翻译后的数据到项目根目录');
console.log('');

runTask().catch(err => {
    console.error('❌ 爬虫执行失败:', err);
    process.exit(1);
});