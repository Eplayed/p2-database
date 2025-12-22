# 翻译爬虫使用说明

## 功能概述

这个翻译爬虫整合了两个核心功能：
1. **数据抓取**：从 poe.ninja 英文网站抓取流放之路2的玩家BD数据
2. **中文翻译**：使用 `base-data/dist` 中的翻译字典将英文数据翻译为中文

## 文件说明

### 核心文件
- `auto_browser/translate_crawler.js` - 翻译爬虫主程序
- `run_translate_crawler.js` - 执行入口脚本
- `test_translation.js` - 翻译功能测试脚本

### 翻译字典 (base-data/dist/)
- `dict_base.json` - 基础物品翻译字典 (1009条)
- `dict_unique.json` - 传奇物品翻译字典 (390条)  
- `dict_gem.json` - 技能宝石翻译字典 (760条)

## 使用方法

### 1. 测试翻译功能
```bash
node test_translation.js
```

### 2. 运行完整翻译爬虫
```bash
# 方法1：使用入口脚本
node run_translate_crawler.js

# 方法2：直接运行
node auto_browser/translate_crawler.js
```

## 输出结构

翻译后的数据将保存在项目根目录的 `translated-data/` 文件夹中：

```
translated-data/
├── classes.json                    # 职业列表
├── all_ladders_translated.json     # 主要索引文件(包含翻译信息)
└── players/                       # 玩家详细数据
    ├── account1_player1.json
    ├── account2_player2.json
    └── ...
```

## 翻译特性

### 装备翻译
- **传奇物品**：使用 `dict_unique.json` 进行翻译，包含中文描述
- **普通装备**：使用 `dict_base.json` 翻译基础类型名称
- **装备宝石**：翻译装备中镶嵌的技能宝石名称

### 技能翻译  
- **主技能**：翻译技能组的主要技能名称
- **辅助宝石**：翻译所有辅助宝石名称
- **保留原英文名**：同时保留 `originalName` 字段便于对照

### 天赋翻译
- **天赋大点**：使用字典翻译关键天赋节点名称
- **保留原图**：天赋树图片保持不变

## 数据格式对比

### 原始英文数据
```json
{
  "name": "Fireball",
  "equipment": [
    {
      "name": "Crimson Amulet",
      "rarity": 0
    }
  ],
  "skills": [
    {
      "mainSkillName": "Fireball",
      "gems": [
        {
          "name": "Fireball",
          "isSupport": false
        }
      ]
    }
  ]
}
```

### 翻译后数据
```json
{
  "name": "Fireball",
  "equipment": [
    {
      "name": "赤红护身符",
      "originalName": "Crimson Amulet", 
      "rarity": 0
    }
  ],
  "skills": [
    {
      "mainSkillName": "火球",
      "originalMainSkillName": "Fireball",
      "gems": [
        {
          "name": "火球",
          "originalName": "Fireball",
          "isSupport": false
        }
      ]
    }
  ]
}
```

## 配置参数

- `MAX_RANK`: 每个职业抓取的玩家数量 (默认: 50)
- `BASE_URL`: 数据源网站地址
- `OUTPUT_DIR`: 输出目录路径

## 注意事项

1. **浏览器依赖**：需要安装 Chrome 浏览器，或确保系统有可用的 Chrome
2. **网络环境**：需要能够访问 poe.ninja 网站
3. **翻译覆盖**：部分新物品可能没有翻译，会保留原英文名
4. **运行时间**：完整抓取需要较长时间，建议在稳定网络环境下运行

## 故障排除

### 字典加载失败
检查 `base-data/dist/` 目录是否存在且包含完整的字典文件

### 浏览器启动失败  
检查 Chrome 浏览器是否正确安装，或修改脚本中的浏览器路径

### 网络访问问题
确保网络可以正常访问 poe.ninja 网站

## 扩展说明

如需添加新的翻译条目，可以编辑对应的字典文件：
- 基础物品 -> `dict_base.json`
- 传奇物品 -> `dict_unique.json` 
- 技能宝石 -> `dict_gem.json`

格式参考现有条目，遵循 `"英文名": "中文名"` 的格式。