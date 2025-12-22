# 阿里云函数计算FC版本 - 流放之路2数据翻译爬虫

## 📋 功能概述

将翻译爬虫部署到阿里云函数计算FC，实现自动化定时抓取流放之路2英文数据并翻译为中文。

## 🏗️ 架构特点

- **无服务器架构**: 自动扩缩容，按需付费
- **定时执行**: 每天凌晨2点自动运行
- **高性能**: 3GB内存，支持Chrome浏览器
- **轻量化**: 只抓取核心数据，减少资源消耗

## 📁 项目结构

```
fc-function/
├── index.js              # FC主函数入口
├── package.json           # 依赖配置
├── template.yml           # SAM模板配置
├── s.yml                  # 部署配置
├── README.md             # 项目说明
└── base-data/            # 翻译字典（需要手动上传）
    └── dist/
        ├── dict_base.json
        ├── dict_gem.json
        └── dict_unique.json
```

## 🚀 部署步骤

### 1. 安装阿里云CLI工具

```bash
# macOS
brew install aliyun-cli

# 配置凭证
aliyun configure
```

### 2. 安装Serverless Devs工具

```bash
npm install @serverless-devs/s -g
s config
```

### 3. 准备翻译字典

```bash
# 复制翻译字典到FC函数目录
cp -r ../base-data ./fc-function/

# 确保字典文件存在
ls -la ./fc-function/base-data/dist/
```

### 4. 部署到阿里云FC

```bash
cd fc-function

# 安装依赖
npm install

# 部署函数
s deploy

# 或者使用阿里云CLI
fun deploy
```

## ⚙️ 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MAX_RANK` | `5` | 每个职业抓取的玩家数量 |
| `CHROME_PATH` | `/opt/chrome/chrome` | Chrome可执行文件路径 |

### 函数配置

- **内存**: 3072MB (3GB)
- **超时**: 900秒 (15分钟)
- **运行时**: Node.js 16
- **触发器**: 定时触发器 (每天凌晨2点)

## 🔧 Chrome依赖层

由于FC环境不包含Chrome浏览器，需要创建Chrome依赖层：

### 创建Chrome层

```bash
# 下载Chrome
wget -q -O - https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_*.deb | dpkg -i -x - /tmp/chrome

# 打包依赖
zip -r chrome-layer.zip /tmp/chrome /usr/lib/x86_64-linux-gnu/*

# 上传到FC
aliyun fc CreateLayer --region cn-hangzhou --layer-name chrome-layer --content file://chrome-layer.zip
```

## 📊 执行结果

函数执行完成后，数据将保存在FC的临时目录 `/tmp/translated-data/` 中：

```
/tmp/translated-data/
├── classes.json                    # 职业列表
├── all_ladders_translated.json     # 主索引文件（含翻译统计）
└── players/                       # 玩家详细数据
    ├── en_acxacx6244_en_godfathero.json
    └── ...
```

## 🔄 数据持久化

由于FC的 `/tmp` 目录是临时的，如需持久化数据：

### 方案1: 集成OSS存储

在函数代码中添加OSS上传逻辑：

```javascript
const OSS = require('ali-oss');

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET
});

// 保存到OSS
await client.put('poe2-data/all_ladders_translated.json', '/tmp/translated-data/all_ladders_translated.json');
```

### 方案2: 设置日志持久化

```yaml
Environment:
  Variables:
    LOG_PERSISTENCE: 'true'
```

## 📝 执行日志查看

```bash
# 通过Serverless Devs
s logs

# 通过阿里云CLI
aliyun fc GetFunctionLogs --region cn-hangzhou --function-name poe2-translate-crawler
```

## 🛠️ 调试与测试

### 本地测试

```bash
# 设置环境变量
export MAX_RANK=2

# 运行测试
node index.js
```

### FC环境测试

```bash
# 触发函数执行
aliyun fc InvokeFunction --region cn-hangzhou --function-name poe2-translate-crawler
```

## 📈 监控告警

### 设置监控指标

1. **执行成功率**: 监控函数执行成功率
2. **执行时长**: 监控平均执行时长
3. **内存使用**: 监控内存使用情况
4. **错误率**: 监控错误日志数量

### 告警配置

```yaml
# 在template.yml中添加告警
Alarm:
  FunctionErrors:
    Type: 'Aliyun::CMS::Alarm'
    Properties:
      MetricName: FunctionErrorRate
      Threshold: 0.1  # 错误率超过10%告警
      ContactGroups: ['admin']
```

## 💰 成本估算

- **函数调用**: 约¥0.0001/次
- **执行时间**: 约¥0.000016/GB秒
- **每日成本**: 约¥0.5-1.0 (取决于抓取数量)
- **月成本**: 约¥15-30

## 🔄 升级维护

### 更新函数

```bash
# 修改代码后重新部署
s deploy

# 更新环境变量
s deploy --env-vars MAX_RANK=10
```

### 版本管理

```bash
# 发布新版本
s version --version-id v2

# 设置别名
s alias --alias-name prod --version-id v2
```

## 🆘 故障排查

### 常见问题

1. **内存不足**: 增加MemorySize到4096MB
2. **超时**: 增加Timeout到1800秒
3. **Chrome启动失败**: 检查Chrome依赖层
4. **翻译字典缺失**: 确认base-data目录结构

### 日志分析

```bash
# 查看详细错误日志
s logs --tail 100

# 实时监控
s logs --follow
```

## 📞 技术支持

- 阿里云函数计算文档: https://help.aliyun.com/document_detail/73356.html
- Serverless Devs文档: https://github.com/Serverless-Devs/Serverless-Devs
- Puppeteer文档: https://pptr.dev/