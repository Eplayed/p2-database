# 🚀 阿里云FC部署指南（模拟部署）

## 📋 部署前置条件

### 1. 安装必要的工具

✅ **已完成**:
- Node.js (v20.18.2)
- npm (Node包管理器)
- Serverless Devs (已安装: /Users/noahadmin/.nvm/versions/node/v20.18.2/bin/s)

❌ **待完成**:
- 阿里云CLI工具
- 阿里云访问凭证配置

### 2. 安装阿里云CLI

```bash
# macOS使用Homebrew安装
brew install aliyun-cli

# 或者从官网下载安装包
# https://www.alibabacloud.com/cli

# 安装后验证
aliyun --version
```

### 3. 配置阿里云访问凭证

需要获取以下信息：
- **AccessKey ID**: 阿里云访问密钥ID
- **AccessKey Secret**: 阿里云访问密钥Secret
- **Account ID**: 阿里云账号ID

#### 方式1: 通过Serverless Devs配置

```bash
# 交互式配置
s config add

# 或者直接指定参数
s config add --AccessKeyID YOUR_ACCESS_KEY_ID --AccessKeySecret YOUR_ACCESS_KEY_SECRET --AccountID YOUR_ACCOUNT_ID
```

#### 方式2: 通过阿里云CLI配置

```bash
# 配置CLI
aliyun configure

# 设置默认区域
aliyun configure set region cn-hangzhou
```

## 🔧 部署流程模拟

### Step 1: 安装依赖

```bash
cd fc-function
npm install
```

**预期输出**:
```
npm notice created a lockfile as package-lock.json
npm WARN poe2-translate-crawler-fc@1.0.0 No repository field.

added 1 package in 1s
```

### Step 2: 准备翻译字典

```bash
# 验证翻译字典
ls -la base-data/dist/
```

**预期输出**:
```
-rw-r--r--  1 user  staff   1.2M  dict_base.json
-rw-r--r--  1 user  staff   4.1M  dict_unique.json
-rw-r--r--  1 user  staff   1.8M  dict_gem.json
```

### Step 3: 部署函数

```bash
# 使用Serverless Devs部署
s deploy
```

**预期输出**:
```
🚀 Using deploy: fc3

[01] 部署函数服务 [poe2-translate-crawler-fc]
[01] 部署函数 [poe2-translate-crawler]
[01] 配置函数 [poe2-translate-crawler]
[01] 设置触发器 [poe2-translate-crawler]

✅ 部署成功
📋 部署信息:
- 函数名称: poe2-translate-crawler
- 运行时: nodejs16
- 内存: 3072MB
- 超时: 900s
- 触发器: Timer (0 0 2 * * *)
```

## 📊 部署后配置

### 环境变量设置

在阿里云FC控制台设置以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|----- |
| `MAX_RANK` | `5` | 每个职业抓取的玩家数量 |
| `CHROME_PATH` | `/opt/chrome/chrome` | Chrome可执行文件路径 |
| `OSS_REGION` | `oss-cn-hangzhou` | OSS存储区域 |
| `OSS_ACCESS_KEY_ID` | `YOUR_OSS_ACCESS_KEY` | OSS访问密钥ID |
| `OSS_ACCESS_KEY_SECRET` | `YOUR_OSS_ACCESS_SECRET` | OSS访问密钥Secret |
| `OSS_BUCKET` | `poe2-data-bucket` | OSS存储桶名称 |
| `OSS_PATH` | `poe2-data/` | OSS存储路径 |
| `UPLOAD_TO_OSS` | `true` | 是否上传到OSS |

### Chrome依赖层配置

由于FC环境不包含Chrome，需要创建Chrome依赖层：

```bash
# 创建Chrome依赖层
aliyun fc CreateLayer \
  --region cn-hangzhou \
  --layer-name chrome-layer \
  --content file://chrome-layer.zip \
  --description "Chrome browser for Puppeteer"
```

### 权限配置

函数需要以下权限：
- **AliyunOSSFullAccess**: 访问OSS存储
- **AliyunFCFullAccess**: 管理FC资源

## 🧪 测试验证

### 1. 手动触发测试

```bash
# 通过Serverless Devs触发
s invoke

# 或者通过阿里云CLI
aliyun fc InvokeFunction \
  --region cn-hangzhou \
  --function-name poe2-translate-crawler
```

### 2. 查看执行日志

```bash
# 查看最近日志
s logs --tail 50

# 实时监控日志
s logs --follow
```

**预期日志输出**:
```
2024-01-20 02:00:00 [INFO] 🚀 阿里云FC翻译爬虫启动 (OSS版本)
2024-01-20 02:00:01 [INFO] ✅ 翻译字典加载成功
2024-01-20 02:00:02 [INFO] ✅ OSS客户端初始化成功
2024-01-20 02:00:03 [INFO] 📊 配置信息: 抓取深度=5, OSS上传=true
2024-01-20 02:00:04 [INFO] 1️⃣ 获取职业列表...
2024-01-20 02:00:10 [INFO]    ✅ 发现 10 个职业
2024-01-20 02:00:11 [INFO] 2️⃣ 抓取并翻译玩家数据...
2024-01-20 02:08:30 [INFO] 3️⃣ 保存翻译数据...
2024-01-20 02:08:45 [INFO] 4️⃣ 上传数据到OSS...
2024-01-20 02:09:00 [INFO] 📊 OSS上传完成: 52/52 成功
2024-01-20 02:09:01 [INFO] ✅ 翻译数据抓取完成
```

### 3. 验证OSS存储结果

```bash
# 列出OSS文件
aliyun oss ls oss://poe2-data-bucket/poe2-data/ --recursive

# 预期输出:
# poe2-data/classes.json
# poe2-data/all_ladders_translated.json
# poe2-data/players/en_acxacx6244_en_godfathero.json
# poe2-data/players/...
```

## 📈 监控设置

### 1. 告警规则

在阿里云监控服务中设置以下告警：

| 指标 | 阈值 | 说明 |
|------|------|------|
| 函数错误率 | >10% | 连续3次触发 |
| 函数执行超时 | >900s | 连续2次触发 |
| 内存使用率 | >90% | 连续5分钟 |
| OSS上传失败率 | >5% | 连续3次触发 |

### 2. 监控面板

创建自定义监控面板显示：
- 每日执行次数
- 平均执行时间
- 成功率趋势
- 翻译数据量统计

## 🚨 故障排查

### 常见问题及解决方案

#### 1. Chrome启动失败

**错误信息**: `Failed to launch chrome`

**解决方案**:
```bash
# 检查Chrome依赖层
aliyun fc GetLayer --region cn-hangzhou --layer-name chrome-layer

# 重新创建依赖层
aliyun fc CreateLayer --region cn-hangzhou --layer-name chrome-layer-v2 --content file://chrome-layer-v2.zip

# 更新函数依赖层
aliyun fc UpdateFunction --region cn-hangzhou --function-name poe2-translate-crawler --layers '["acs:fc:cn-hangzhou:{AccountId}:layers/chrome-layer-v2/versions/1"]'
```

#### 2. 内存不足

**错误信息**: `Container killed due to memory limit`

**解决方案**:
```bash
# 增加内存配置
aliyun fc UpdateFunction --region cn-hangzhou --function-name poe2-translate-crawler --memorySize 4096
```

#### 3. OSS权限错误

**错误信息**: `AccessDenied by OSS`

**解决方案**:
```bash
# 添加OSS权限
aliyun ram CreatePolicy --policy-name fc-oss-policy --policy-document file://fc-oss-policy.json
aliyun ram AttachPolicyToUser --user-name fc-user --policy-name fc-oss-policy
```

## 📝 部署清单

### ✅ 已完成

- [x] 创建FC函数代码
- [x] 配置部署模板
- [x] 准备翻译字典
- [x] 安装Serverless Devs
- [x] 编写部署脚本

### ⏳ 待完成

- [ ] 安装阿里云CLI
- [ ] 配置阿里云访问凭证
- [ ] 创建OSS存储桶
- [ ] 创建Chrome依赖层
- [ ] 执行实际部署
- [ ] 配置监控告警

### 📞 技术支持

- **阿里云FC文档**: https://help.aliyun.com/document_detail/73356.html
- **Serverless Devs文档**: https://github.com/Serverless-Devs/Serverless-Devs
- **阿里云控制台**: https://fc.console.aliyun.com/
- **技术支持**: 95187

## 🎯 下一步行动

1. **获取阿里云凭证**:
   - 登录阿里云控制台
   - 创建AccessKey
   - 记录AccessKey ID和Secret

2. **完成CLI配置**:
   ```bash
   # 安装CLI
   brew install aliyun-cli
   
   # 配置凭证
   aliyun configure
   
   # 配置Serverless Devs
   s config add --AccessKeyID YOUR_ACCESS_KEY_ID --AccessKeySecret YOUR_ACCESS_KEY_SECRET --AccountID YOUR_ACCOUNT_ID
   ```

3. **执行部署**:
   ```bash
   cd fc-function
   s deploy
   ```

4. **测试验证**:
   ```bash
   s invoke
   s logs --follow
   ```

完成以上步骤后，你的流放之路2翻译爬虫就能在阿里云函数计算上自动运行了！🚀