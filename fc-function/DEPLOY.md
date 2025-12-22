# 阿里云函数计算FC部署指南

## 前置要求

1. **安装Serverless Devs工具**
```bash
npm install -g @serverless-devs/s
```

2. **配置阿里云账号**
```bash
s config add --default
```
需要提供：
- AccessKey ID (已在oss-config.json中)
- AccessKey Secret (已在oss-config.json中)  
- Account ID (从阿里云控制台获取)

## 部署步骤

1. **进入项目目录**
```bash
cd fc-function
```

2. **执行部署脚本**
```bash
./deploy.sh
```

或手动部署：
```bash
s deploy
```

## 配置说明

### s.yml 配置文件
- 函数名称: poe2-translate-crawler
- 运行时: nodejs16
- 内存: 2048MB
- 超时: 600秒
- 定时触发: 每天凌晨2点
- 部署节点: 中国香港 (cn-hongkong)

### oss-config.json
包含阿里云OSS配置信息，用于存储翻译后的数据。
- region: oss-cn-hongkong
- bucket: poe2-all-class

## 注意事项

1. 首次使用需要配置阿里云账号权限
2. 确保账号有FC函数计算和OSS存储权限
3. region设置为中国香港节点 (cn-hongkong)
4. 函数会自动抓取英文数据并翻译为中文
5. 翻译结果保存在配置的OSS桶中

## 故障排除

如果遇到"YAML文件格式错误"：
1. 检查s.yml文件语法
2. 确保缩进使用空格而非Tab
3. 验证YAML格式是否正确

如果遇到权限错误：
1. 检查阿里云账号配置
2. 确认有FC和OSS服务权限
3. 验证Account ID是否正确