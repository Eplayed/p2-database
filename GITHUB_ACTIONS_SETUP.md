# GitHub Actions 部署指南

## 需要在 GitHub 中设置的 Secrets

在 GitHub 仓库的 Settings > Secrets and variables > Actions 中添加以下 Secrets：

### 必需的环境变量

| Secret Name | 说明 | 来源 |
|-------------|------|------|
| `OSS_ACCESS_KEY_ID` | 阿里云 OSS Access Key ID | 从 `.env` 文件中的 `OSS_ACCESS_KEY_ID` 复制 |
| `OSS_ACCESS_KEY_SECRET` | 阿里云 OSS Access Key Secret | 从 `.env` 文件中的 `OSS_ACCESS_KEY_SECRET` 复制 |

## 工作流配置说明

### 文件位置
`.github/workflows/auto-crawl.yml`

### 执行时机
1. **定时执行**：每天北京时间上午 9 点（UTC 时间 1 点）
2. **手动触发**：在 Actions 页面可以手动运行
3. **推送触发**：推送到 main 分支时自动运行

### 环境变量配置
- `NODE_ENV=production`：生产环境模式
- `OSS_REGION=oss-cn-hangzhou`：使用杭州节点
- `OSS_BUCKET=poe2-all-class`：OSS 存储桶名称

### 功能特性
1. **自动安装依赖**：使用 `npm ci` 进行快速安装
2. **Puppeteer 依赖**：自动安装所需的系统库
3. **环境文件生成**：自动创建 `auto_browser/.env` 配置文件
4. **错误调试**：失败时上传生成的数据文件作为 artifacts

## 部署步骤

### 1. 推送代码到 GitHub
```bash
git add .
git commit -m "Add GitHub Actions workflow for auto crawling"
git push origin main
```

### 2. 配置 GitHub Secrets
1. 进入 GitHub 仓库页面
2. 点击 Settings > Secrets and variables > Actions
3. 点击 "New repository secret"
4. 添加 `OSS_ACCESS_KEY_ID` 和 `OSS_ACCESS_KEY_SECRET`

### 3. 测试工作流
1. 进入 Actions 页面
2. 选择 "Auto Crawl and Upload to OSS" 工作流
3. 点击 "Run workflow" 进行手动测试

## 监控和调试

### 查看执行日志
在 Actions 页面点击具体的工作流运行，可以查看详细的执行日志。

### 下载调试文件
如果工作流失败，生成的数据文件会自动上传为 artifacts，可以在 Actions 页面下载查看。

### 常见问题

1. **OSS 权限错误**：检查 Secrets 是否正确配置
2. **网络超时**：Puppeteer 可能会因网络问题超时，可以重试
3. **内存不足**：GitHub Actions 内存有限，大量数据处理可能需要优化

## OSS 上传路径

根据 `env-config.js` 配置：
- 生产环境：`poe2-all-class/release/`
- 开发环境：`poe2-all-class/dev/`

上传的数据包括：
- `classes.json` - 职业列表
- `all_ladders_translated.json` - 翻译后的排行榜数据
- `players/` 目录 - 玩家详细数据文件