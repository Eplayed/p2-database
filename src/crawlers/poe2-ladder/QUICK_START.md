# 🚀 快速开始指南

## 1. 配置OSS凭证

编辑项目根目录的 `oss-config.json` 文件：

```bash
vim ../oss-config.json
```

填入你的阿里云OSS凭证：
```json
{
  "region": "oss-cn-hangzhou",
  "bucket": "your-bucket-name", 
  "accessKeyId": "你的AccessKey ID",
  "accessKeySecret": "你的AccessKey Secret",
  "endpoint": "https://oss-cn-hangzhou.aliyuncs.com",
  "folder": "poe2-ladders"
}
```

## 2. 一键执行

在 `auto_browser` 目录下运行：

```bash
node run_full_process.js
```

## 3. 完整流程

脚本会自动执行以下步骤：
1. ✅ 检查环境配置
2. ✅ 获取梯子数据
3. ✅ 上传到阿里云OSS  
4. ✅ 生成执行报告

## 🔧 故障排除

- 如果提示"项目配置不存在"，确保在正确的项目目录中
- 如果提示"OSS凭证无效"，请检查 `oss-config.json` 配置
- 执行日志会保存在 `upload_log_*.json` 文件中

## 📁 生成的文件

- `all_ladders.json` - 完整的梯子数据
- `execution_report_*.json` - 执行报告
- `upload_log_*.json` - 上传日志

完成！现在你可以配置OSS凭证并运行完整流程了。