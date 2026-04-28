# 项目记忆

## 项目概览

用户维护两个 PoE2（流放之路2）相关项目：

---

## 项目 1: daily-talk（微信小程序前端）

**路径**: `/Users/zhangyajun/Documents/project/daily-talk`

**技术栈**: UniApp + Vue 3.2.37 + Vite + Tailwind CSS

**功能**: PoE2 流放助手微信小程序
- 通货查询（Ninja页面）
- 中英速查（Dictionary页面）
- 开荒清单（Checklist页面）
- 天梯榜单（Ladder页面）
- 个人中心（Mine页面）
- 神庙规划器、装备制作等子功能

**数据源**:
- 阿里云 OSS: `https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com`
- Gitee: `https://gitee.com/Eplayer/database`

**核心文件**:
- `src/services/api.js` - 数据服务层
- `src/utils/index.js` - 工具函数
- `src/composables/` - 组合式 API
- `src/pages/checklist/index.vue` - 开荒清单
- `src/pages/ninja/index.vue` - 通货页面

**存储键**:
- `poe2_items_cache` - 物品缓存
- `poe2_user_progress` - 用户进度
- `poe2_search_history` - 搜索历史

---

## 项目 2: p2-database（爬虫后端）

**路径**: `/Users/zhangyajun/Documents/project/p2-database`

**技术栈**: Node.js + Puppeteer + ali-oss

**功能**: 自动爬取 PoE2 数据并上传到 OSS
- 爬取 poe.ninja 天梯数据
- 翻译装备数据
- 上传到阿里云 OSS

**核心脚本**:
- `get_all_ladders.js` - 获取所有职业天梯数据
- `run_translate_crawler.js` - 翻译爬虫
- `auto_browser/index.js` - 浏览器自动化

**GitHub Actions**: `.github/workflows/auto-crawl.yml`
- 定时任务：每天北京时间 9:00
- 上传到 `poe2-all-class/release/`

**OSS 存储**:
- Bucket: `poe2-all-class`
- Region: `oss-cn-hangzhou`

---

## 协作关系

- **p2-database** 爬取数据 → 上传到 OSS
- **daily-talk** 小程序 → 从 OSS 读取数据展示
- 两个项目共同支撑 PoE2 流放助手生态系统

---

## 技术要点（2026-04-27）

### PoE2 天赋树截图方案

**背景**：poe.ninja 的 PoE2 天赋树用 `<canvas data-tooltip-canvas="true">` 渲染（WebGL），不能用 `canvas.toDataURL()`，必须用 Puppeteer 的 `page.screenshot()` 按区域截取。

**选择器**：`[data-tooltip-canvas="true"]` 容器内的 `<canvas>` 元素。

**方案**：
```javascript
// 1. 获取天赋树区域坐标
const treeRect = await page.evaluate(() => {
  const tooltipCanvas = document.querySelector('[data-tooltip-canvas="true"]');
  const rect = tooltipCanvas?.getBoundingClientRect();
  return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
});

// 2. 用 page.screenshot 截取
const imgBuffer = await page.screenshot({
  type: 'jpeg', quality: 60,
  clip: { x: treeRect.x, y: treeRect.y, width: treeRect.width, height: treeRect.height }
});
const base64 = `data:image/jpeg;base64,${Buffer.from(imgBuffer).toString('base64')}`;
```

**关键**：poe.ninja 天赋树 **不是 SVG**，之前的 `document.querySelector('svg.bg-transparent')` 选错了元素。

### keystones.icon 路径处理

- API 返回相对路径：`passives/keystonebloodmagic.webp`
- 小程序渲染时拼接 base URL：`https://poe.ninja/poe2-assets/cdn/tree/${icon}`
- **切勿存完整 URL**（小程序会二次拼接导致 404）

### PoE2 职业图标映射

`daily-talk/src/utils/iconHelper.js` 中的 `getClassIcon()` 需要映射 PoE2 所有职业：
- Blood Mage, Infernalist, Deadeye, Champion, Slayer, Summoner, Warrior 等
- OSS 上不存在的职业图标回退到 poe.ninja CDN

### 宝石翻译

- `base-data/dist/dict_gem.json` 需要持续更新 PoE2 新增宝石
- 2026-04-27 已补充 89 个新宝石（含 Rune 系列、Soul Core 系列、Vaal 系列等）

### 踩蘑菇精华帖爬虫（完整流程）

**新增脚本**:
- `auto_browser/crawl_caimogu_essence_full.js` - 爬取精华帖列表和详情
- `auto_browser/transform_caimogu_data.js` - 转换为小程序数据格式

**数据源**: https://www.caimogu.cc/circle/449.html (流放之路2:降临 圈子)

**爬取流程**:
1. 访问圈子页面，点击"精华"筛选
2. 滚动加载所有精华帖（最多30次滚动）
3. 进入每个详情页抓取内容、图片、标签
4. 转换数据格式
5. 上传到 OSS

**输出数据结构**:
```json
{
  "id": "CaiMoGu_2168287",
  "meta": {
    "title": "BD攻略标题",
    "author": "作者名",
    "class": "Druid",
    "tags": ["开荒", "攻坚"]
  },
  "skills": [...],
  "passive_tree": {...},
  "source": {...}
}
```

**GitHub Actions 更新** (`.github/workflows/auto-crawl.yml`):
- 新增步骤：运行精华帖爬虫
- 新增步骤：运行数据转换脚本
- OSS 路径: `poe2-ladders/miniprogram_data/community.json`

**小程序加载地址**:
```
https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com/poe2-ladders/miniprogram_data/community.json
```

---

### 踩蘑菇 BD 推荐爬虫（早期版本）

**脚本**: `auto_browser/crawl_caimogu.js`

**数据源**: https://www.caimogu.com/poe2/home (踩蘑菇网)

**抓取内容**:
- 标题、作者、标签等文字信息
- 完整技能树和装备数据需进入详情页二次抓取

**OSS 路径**:
```
poe2-ladders/miniprogram_data/community.json
```
完整 URL: `https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com/poe2-ladders/miniprogram_data/community.json`
