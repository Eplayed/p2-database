const path = require('path');
const fs = require('fs');

const isProd = process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV === 'dev';

// 数据目录配置
const DATA_DIR = isDev 
    ? path.join(__dirname, "../translated-data/dev")
    : path.join(__dirname, "../translated-data/release");

module.exports = {
    isProd,
    isDev: process.env.NODE_ENV === 'dev',
    // 根据环境获取文件名
    getFileName: (baseName) => {
        return isProd ? `${baseName}.json` : `${baseName}_dev.json`;
    },
    // OSS 存储路径前缀
    ossPath: isProd ? 'poe2-ladders/release/' : 'poe2-ladders/dev/',
    // 本地数据目录
    dataDir: DATA_DIR,
    // 爬取配置
    crawler: {
        headless: isProd ? "new" : false, // 生产环境无头，开发环境有头方便调试
        maxRank: isProd ? 20 : 3,         // 生产环境抓前20，开发环境抓前3个
        timeout: 60000
    }
};