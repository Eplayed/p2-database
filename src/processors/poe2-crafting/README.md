# POE2 数据处理工具

这个目录包含了处理 POE2 游戏数据并上传到 OSS 的完整工具链。

## 📁 文件说明

### 核心处理文件
- **`process_craft_data.js`** - 主数据处理脚本，将原始数据转换为小程序可用格式
- **`upload_to_oss.js`** - OSS 上传工具，将处理后的数据上传到阿里云 OSS
- **`build_and_upload.js`** - 一键构建和上传脚本

### 配置文件
- **`oss-config.json`** - OSS 连接配置信息
- **`package.json`** - Node.js 依赖管理

### 数据文件
- **`data/`** - 原始数据目录
  - `crafting_db.json` - 装备制作数据
- **`miniprogram_data/`** - 输出目录，处理后的数据文件
- **`base-data/`** - 基础字典数据

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置 OSS
确保 `oss-config.json` 包含正确的 OSS 配置：
```json
{
  "region": "oss-cn-hangzhou",
  "bucket": "your-bucket-name",
  "accessKeyId": "your-access-key-id",
  "accessKeySecret": "your-access-key-secret",
  "endpoint": "https://oss-cn-hangzhou.aliyuncs.com",
  "folder": "poe2-ladders"
}
```

### 3. 单独执行
```bash
# 只处理数据
npm run build
# 或者
node process_craft_data.js

# 只上传数据
npm run upload
# 或者
node -e "require('./upload_to_oss')()"
```

### 4. 一键构建上传
```bash
npm run deploy
# 或者
node build_and_upload.js
```

## 📊 数据结构说明

### 输入数据
原始数据位于 `data/crafting_db.json`，包含：
- 装备基础信息
- 词缀 (Affix) 数据
- 分类信息

### 输出数据
处理后生成以下文件：

#### `miniprogram_data/bases.json`
```json
[
  {
    "name": "单手武器",
    "list": [
      {
        "name": "匕首",
        "category": "Daggers",
        "sort": 1,
        "icon": "https://example.com/icon.png",
        "items": [
          {
            "name": "物品名称",
            "enName": "Item Name",
            "level": 1,
            "itemLevel": 100,
            "requirements": "Lv1 10力",
            "icon": "https://example.com/item.png",
            "category": "Daggers"
          }
        ]
      }
    ]
  }
]
```

#### `miniprogram_data/mods/*.json`
按装备分类的词缀文件：
```json
{
  "prefixes": [
    {
      "name": "词缀名称",
      "desc": "详细描述",
      "level": 1,
      "tier": 1,
      "weight": 1000,
      "group": "词缀组"
    }
  ],
  "suffixes": [...]
}
```

## 🎯 装备分类体系

### 大分类 (Broad Categories)
- 单手武器
- 双手武器  
- 副手
- 饰品
- 头盔
- 服装
- 手套
- 鞋子
- 珠宝

### 细分分类 (Sub Categories)
装备按属性需求细分：
- 🔴 = 力量 (护甲)
- ⚡ = 敏捷 (闪避)
- 🔵 = 智力 (护盾)

例如：`Helmets🔴` 表示力量头盔

## ⚙️ 配置说明

### CATEGORY_CONFIG
在 `process_craft_data.js` 中定义了完整的分类映射：

```javascript
const CATEGORY_CONFIG = {
    'Daggers': { broad: '单手武器', name: '匕首', sort: 1 },
    'Helmets🔴': { broad: '头盔', name: '头盔(力)', sort: 2 },
    // ... 更多配置
};
```

## 🔧 自定义配置

### 添加新装备分类
1. 在 `CATEGORY_CONFIG` 中添加映射
2. 确保原始数据中的 `class` 字段匹配
3. 重新运行处理脚本

### 修改输出路径
修改 `process_craft_data.js` 开头的配置：
```javascript
const OUTPUT_DIR = './miniprogram_data';
```

## 🐛 常见问题

### 1. OSS 上传失败
- 检查 `oss-config.json` 配置是否正确
- 确认 access key 权限足够
- 检查 bucket 是否存在

### 2. 数据处理失败
- 确认 `data/crafting_db.json` 存在且格式正确
- 检查 `base-data/dist/dict_base.json` 是否存在
- 查看控制台错误信息

### 3. 文件权限问题
```bash
chmod +x *.js
```

## 📝 开发日志

### v6.0
- 支持装备属性细分
- 改进词缀匹配逻辑
- 优化文件命名规则

## 🤝 贡献指南

1. 修改代码前请先备份原始数据
2. 测试所有功能确保正常工作
3. 更新相关文档

## 📞 支持

如有问题，请检查：
1. Node.js 版本 >= 14
2. 网络连接正常
3. OSS 配置正确
4. 数据文件完整