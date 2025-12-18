const isProd = process.env.NODE_ENV === 'production';

module.exports = {
    isProd,
    // 根据环境获取文件名
    getFileName: (baseName) => {
        return isProd ? `${baseName}.json` : `${baseName}_dev.json`;
    },
    // OSS 存储路径前缀
    ossPath: isProd ? 'release/' : 'dev/',
    // 爬取配置
    crawler: {
        headless: isProd ? "new" : false, // 生产环境无头，开发环境有头方便调试
        maxRank: isProd ? 20 : 2,         // 生产环境抓前20，开发环境只抓前2个测流程
        timeout: 60000
    }
};