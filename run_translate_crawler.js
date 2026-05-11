#!/usr/bin/env node

require('dotenv').config({path: './auto_browser/.env'});
const { runTask } = require('./auto_browser/translate_crawler');
const { crawlEssencePosts } = require('./auto_browser/crawl_caimogu_essence_full');
const uploadAll = require('./auto_browser/upload_to_oss');

const isDev = process.env.NODE_ENV === 'dev';

console.log('🌐 启动流放之路2 数据翻译爬虫');
console.log('环境:', isDev ? '开发环境' : '生产环境');
console.log('这个脚本将：');
console.log('1. 抓取英文网站数据');
console.log('2. 使用翻译字典进行中文翻译');
console.log('3. 保存翻译后的数据到项目根目录');

if (isDev) {
    console.log('4. 上传数据到OSS的poe2-ladders/dev目录');
}else{
    console.log('4. 上传数据到OSS的poe2-ladders/release目录');
}

console.log('');

async function main() {
    try {
        // 执行翻译任务（天梯数据）
        await runTask();
        
        // 从踩蘑菇抓取热门BD
        console.log('\n🌿 抓取踩蘑菇精华帖...');
        await crawlEssencePosts();
        
        // 上传到OSS
        console.log('\n🚀 上传数据到OSS...');
        await uploadAll();
        
        console.log('\n✅ 任务执行完成！');
        
    } catch (error) {
        console.error('❌ 爬虫执行失败:', error);
        process.exit(1);
    }
}

main();