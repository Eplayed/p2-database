# 热门 BD 帖候选输入

把踩蘑菇热门 BD 帖复制成 `.md` / `.txt` 放到这里，然后运行：

```bash
npm run agent:starter
```

建议在文件顶部写 front matter，字段越全，抽取结果越可靠：

```md
---
title: 女巫召唤 0.5 开荒
url: https://...
author: 作者名
class: Witch
ascendancy: Infernalist
mainSkill: 召唤系技能
tags: 新手友好, 低造价, 剧情顺滑
views: 12000
replies: 80
favorites: 100
confidence: low
---

## 1-12 级
- 技能：...
- 天赋：...

## 第三章后
- 转职：...
```

stage 会根据帖子里的标题提取，不需要固定写法。
