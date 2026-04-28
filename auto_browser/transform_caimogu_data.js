#!/usr/bin/env node
/**
 * 踩蘑菇精华帖数据转换脚本
 * 将爬取的原始数据转换为小程序需要的 community.json 格式
 *
 * OSS 上传路径: poe2-ladders/miniprogram_data/community.json
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const OSS = require('ali-oss');

// OSS 配置
const OSS_CONFIG = {
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET || 'poe2-all-class'
};

const OSS_UPLOAD_PATH = 'poe2-ladders/miniprogram_data/community.json';
const INPUT_FILE = path.join(__dirname, 'caimogu_essence_full.json');
const OUTPUT_FILE = path.join(__dirname, 'community_builds.json');

// 职业关键词映射
const CLASS_KEYWORDS = {
  '德鲁伊': 'Druid',
  '游侠': 'Ranger',
  '猎人': 'Deadeye',
  '战士': 'Warrior',
  '冠军': 'Champion',
  '圣堂': 'Templar',
  '判官': 'Inquisitor',
  '女巫': 'Witch',
  '魔导师': 'Mage',
  '暗影': 'Shadow',
  '刺客': 'Assassin',
  '贵族': 'Scion',
  '野蛮人': 'Marauder',
  '魔侍': 'Summoner',
  '神谕者': 'Oracle',
  '判官': 'Hierophant'
};

// 关键词转职业
function detectClass(text) {
  for (const [keyword, cls] of Object.entries(CLASS_KEYWORDS)) {
    if (text.includes(keyword)) return cls;
  }
  return '';
}

// 检测标签
function detectTags(text) {
  const tags = [];
  if (text.includes('开荒') || text.includes('升级') || text.includes('新手')) tags.push('开荒');
  if (text.includes('攻坚') || text.includes('BOSS') || text.includes('终局')) tags.push('攻坚');
  if (text.includes('速刷') || text.includes('刷图') || text.includes('farm')) tags.push('速刷');
  if (text.includes('硬核') || text.includes('HC')) tags.push('硬核');
  if (text.includes(' PVP') || text.includes('竞技')) tags.push('PVP');
  if (tags.length === 0) tags.push('热门推荐');
  return tags;
}

// 从正文提取技能组（改进版）
function parseSkills(content) {
  if (!content || content.length < 50) return [];

  const skills = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  // 技能组关键词（按优先级排序）
  const skillGroupKeywords = [
    '核心技能', '主要技能', '主力技能', '输出技能', '主力输出',
    '辅助技能', '增伤技能', '辅助增伤',
    '防御技能', '保命技能', '生存技能',
    '起手技能', '清图技能', '刷图技能', '位移技能',
    '灵体', '召唤物', '图腾', '陷阱', '地雷', '闪电箭',
    '榴弹', '箭矢', '刀阵', '闪电新星', '冰川', '德瑞',
    '冰墙', '雨淞', '彗星', '施放', '打击', '引导',
    '残片', '大法师', '魔侍', '闪电专精', '冰霜专精',
    '元素要害', '暴击时施放',
    '诅咒', '光环', '增益', '奉献', '战旗', '战吼'
  ];

  // 技能名关键词（用于识别具体技能）
  const skillNameKeywords = [
    '召唤狼', '召唤骷髅', '召唤幽灵', '召唤狂热者', '召唤魔侍',
    '闪电箭', '闪电陷阱', '闪电新星', '闪电传送',
    '冰霜脉冲', '冰霜碎片', '冰川', '冰墙',
    '火焰陷阱', '火焰冲击', '燃烧', '熔岩护盾',
    '腐蚀', '毒蛇陷阱', '毒蜘蛛',
    '魔像', '印记', '诅咒', '衰老', '虚弱',
    '时空锁链', '闪电瓦解', '瓦尔闪电箭',
    '先祖卫士', '先祖之锤', '分裂', '双手挥击',
    '刀雨', '致命异常', '猛毒', '穿透',
    '冰霜之捷', '闪电之捷', '元素之捷',
    '暗影迷踪', '伏击', '致命', '致盲',
    '血肉科学', '生命偷取', '吸血'
  ];

  let currentGroup = null;
  let lastSkillGroupTitle = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过太短或太长的行
    if (trimmed.length < 2 || trimmed.length > 100) continue;

    // 跳过包含这些关键词的行（噪声）
    const noisePatterns = [
      '登录', '注册', '发帖', '回复', '踩蘑菇', '视频介绍', 
      '装备图片', '作者', '时间', '浏览', '点赞', '收藏',
      '流放之路2', 'POE2', '腾讯', '攻略', '本文转', '出处',
      '版权', '微信', 'QQ群', '圈子', '加群'
    ];
    if (noisePatterns.some(p => trimmed.includes(p))) continue;

    // 检查是否是技能组标题
    const isGroupTitle = skillGroupKeywords.some(k => trimmed.includes(k)) && 
                         (trimmed.includes('技能') || trimmed.includes('组') || 
                          trimmed.includes('核心') || trimmed.includes('主要'));

    if (isGroupTitle) {
      if (currentGroup && currentGroup.links.length > 0) {
        skills.push(currentGroup);
      }
      lastSkillGroupTitle = trimmed;
      currentGroup = {
        groupName: trimmed,
        groupIndex: skills.length + 1,
        note: '',
        links: []
      };
      continue;
    }

    // 检查是否是具体技能行
    const isSkillLine = skillNameKeywords.some(k => trimmed.includes(k)) ||
                        (trimmed.includes('+') && (trimmed.includes('等') || trimmed.includes('级')));

    if (isSkillLine && currentGroup) {
      // 判断是否是辅助/升华技能
      const isSupport = trimmed.includes('辅助') || trimmed.includes('升华') ||
                       trimmed.includes('效能') || trimmed.includes('集中') ||
                       trimmed.includes('节魔') || trimmed.includes('延长') ||
                       trimmed.includes('扩大') || trimmed.includes('保存') ||
                       trimmed.includes('精准') || trimmed.includes('散射') ||
                       trimmed.includes('投射物') || trimmed.includes('扩散');

      // 清理技能名称
      let skillName = trimmed
        .replace(/[LvL\+\d级技能]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 30);

      if (skillName.length > 3) {
        currentGroup.links.push({
          name: skillName,
          originalName: skillName,
          isSupport: isSupport
        });
      }
    }
  }

  // 添加最后一个技能组
  if (currentGroup && currentGroup.links.length > 0) {
    skills.push(currentGroup);
  }

  // 如果没有识别到技能组，尝试创建默认组
  if (skills.length === 0 && lines.length > 5) {
    const skillLines = lines.filter(l => {
      const t = l.trim();
      return skillNameKeywords.some(k => t.includes(k)) && t.length > 3 && t.length < 50;
    });
    
    if (skillLines.length > 0) {
      skills.push({
        groupName: '技能配置',
        groupIndex: 1,
        note: '详细内容请查看原文',
        links: skillLines.slice(0, 10).map(name => ({
          name: name.trim().substring(0, 30),
          originalName: name.trim().substring(0, 30),
          isSupport: false
        }))
      });
    }
  }

  return skills.slice(0, 8); // 最多8个技能组
}

// 从正文提取装备信息（改进版）
function parseEquipment(content, title) {
  const result = {
    notes: '',
    core_uniques: [],
    rare_priority: []
  };

  if (!content) return result;

  // 提取更新时间
  const timeMatch = content.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
  if (timeMatch) {
    result.notes = `数据来源：踩蘑菇网 | 更新时间: ${timeMatch[1]}`;
  }

  // 提取装备段落
  const lines = content.split('\n');
  let inEquipmentSection = false;
  let equipmentLines = [];

  const equipmentKeywords = ['装备', '武器', '护甲', '首饰', '项链', '戒指', '头盔', '手套', '鞋子', '腰带', '暗金', '传奇', '基底', '推荐'];
  const sectionKeywords = ['技能', '天赋', '升华', '攻略', '前言', '介绍', '目录', '效果', '属性'];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 200) continue;

    // 检测进入装备区
    if (equipmentKeywords.some(k => trimmed.includes(k)) && 
        (trimmed.includes('推荐') || trimmed.includes('必带') || 
         trimmed.includes('核心') || trimmed.includes('必备') ||
         trimmed.includes('暗金') || trimmed.includes('传奇'))) {
      inEquipmentSection = true;
    }

    // 检测离开装备区
    if (inEquipmentSection && sectionKeywords.some(k => trimmed.includes(k) && trimmed.includes('区'))) {
      inEquipmentSection = false;
    }

    if (inEquipmentSection) {
      equipmentLines.push(trimmed);
    }
  }

  // 从装备行中提取核心暗金
  const uniqueKeywords = [
    '冥神之', '收割者之', '德瑞', '裂隙', '墓志铭', 
    '龙之心', '鹰之', '狮眼', '药神', '三相',
    '灵骸', '永眠', '欺诈', '处刑', '血肉'
  ];

  for (const line of equipmentLines) {
    for (const kw of uniqueKeywords) {
      if (line.includes(kw) && line.length < 100) {
        result.core_uniques.push({
          name: line.substring(0, 40),
          reason: '核心装备'
        });
        break;
      }
    }
  }

  // 去重
  result.core_uniques = result.core_uniques.filter((u, i, arr) => 
    arr.findIndex(x => x.name.includes(u.name.substring(0, 10))) === i
  ).slice(0, 5);

  // 如果没有提取到暗金，尝试提取稀有装备推荐
  if (result.core_uniques.length === 0) {
    const rareLines = equipmentLines.filter(l => 
      l.includes('稀有') || l.includes('黄装') || 
      (l.includes('推荐') && l.length < 60)
    );
    
    if (rareLines.length > 0) {
      result.rare_priority = rareLines.slice(0, 3).map(l => ({
        slot: '装备推荐',
        stats: [l.substring(0, 50)]
      }));
    }
  }

  return result;
}

// 从正文提取升级/开荒技巧
function parseLevelingTips(content, title) {
  const tips = [];
  
  if (!content) return tips;

  const lines = content.split('\n');
  const tipKeywords = ['升级', '开荒', '加点', '优先', '注意', '建议', '推荐', '技巧', '要点', '流程'];
  const ignoreKeywords = ['装备', '天赋', '升华', '技能树'];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10 || trimmed.length > 150) continue;
    
    // 包含提示关键词且不包含忽略关键词
    if (tipKeywords.some(k => trimmed.includes(k)) &&
        !ignoreKeywords.some(k => trimmed.includes(k))) {
      tips.push(trimmed.substring(0, 100));
    }
  }

  // 如果没找到，检查标题是否包含开荒
  if (tips.length === 0 && title && (title.includes('开荒') || title.includes('升级'))) {
    tips.push('请查看原文获取详细的升级/开荒攻略');
    tips.push('关注核心技能优先升级');
    tips.push('装备优先选择增加主要技能的装备');
  }

  return [...new Set(tips)].slice(0, 5);
}

// 转换单个帖子（改进版）
function transformPost(post) {
  const content = post.content || '';
  const detectedClass = detectClass(content) || detectClass(post.title) || '';
  const tags = detectTags(content);
  const skills = parseSkills(content);
  const equipment = parseEquipment(content, post.title);
  const levelingTips = parseLevelingTips(content, post.title);

  // 从图片中获取天赋树图片
  let passiveImage = '';
  if (post.skillTreeImages && post.skillTreeImages.length > 0) {
    passiveImage = post.skillTreeImages[0].src;
  }

  // 生成描述
  const author = post.author || '社区玩家';
  const updateTime = post.publishTime || '最近';
  const likes = post.likeCount || 0;
  const favorites = post.favorites || 0;
  const desc = content.substring(0, 150).replace(/\n/g, ' ').trim() + (content.length > 150 ? '...' : '');

  return {
    id: `CaiMoGu_${post.id}`,
    meta: {
      title: post.title || '未命名BD',
      author: author,
      class: detectedClass,
      name: post.title || '社区推荐',
      tags: tags
    },
    intro: {
      desc: `来自踩蘑菇网的热门BD ${post.title || ''}，作者 ${author}，更新于 ${updateTime}`,
      pros: ['社区热门推荐', '经过玩家验证'],
      cons: ['具体效果因人而异', '部分内容可能需要参考原文']
    },
    skills: skills,
    equipment: equipment,
    leveling_tips: levelingTips,
    passive_tree: {
      image: passiveImage,
      link: post.href || `https://www.caimogu.cc/post/${post.id}.html`
    },
    source: {
      platform: 'caimogu',
      originalAuthor: author,
      updateTime: updateTime,
      favorites: favorites,
      likes: likes,
      sourceUrl: post.href || ''
    }
  };
}

// 上传到 OSS
async function uploadToOSS(client, localPath, remotePath) {
  if (!client) {
    console.log('⚠️ OSS 未配置，跳过上传');
    return null;
  }

  try {
    const result = await client.put(remotePath, localPath);
    console.log(`✅ 上传成功: ${result.name}`);
    return result.url;
  } catch (e) {
    console.log(`❌ 上传失败: ${e.message}`);
    return null;
  }
}

// 主函数
async function main() {
  console.log('=== 踩蘑菇精华帖数据转换 ===\n');

  // 1. 读取原始数据
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ 找不到输入文件: ${INPUT_FILE}`);
    console.log('请先运行 crawl_caimogu_essence_full.js 抓取数据');
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`📊 原始数据: ${rawData.summary?.detailedPosts || 0} 个详情帖, ${rawData.summary?.validPosts?.length || 0} 个有效BD帖子`);

  // 2. 转换数据 - 优先使用 validPosts，否则使用 detailedPosts
  const sourcePosts = rawData.validPosts?.length > 0 ? rawData.validPosts : rawData.detailedPosts;
  console.log(`📊 使用数据源: ${sourcePosts.length} 个帖子`);

  const transformed = sourcePosts
    .filter(post => post.content && post.content.length > 50) // 过滤无效帖子
    .map(transformPost)
    .filter(post => post.meta.title); // 过滤无标题帖子

  console.log(`✅ 转换后: ${transformed.length} 个有效BD`);

  // 3. 保存本地文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transformed, null, 2), 'utf8');
  console.log(`💾 已保存: ${OUTPUT_FILE}`);

  // 4. 打印示例
  console.log('\n=== 转换示例 ===');
  transformed.slice(0, 3).forEach((bd, i) => {
    console.log(`\n${i + 1}. ${bd.meta.title}`);
    console.log(`   职业: ${bd.meta.class || '未识别'}`);
    console.log(`   标签: ${bd.meta.tags.join(', ')}`);
    console.log(`   技能组: ${bd.skills.length}个`);
    console.log(`   核心暗金: ${bd.equipment.core_uniques?.length || 0}件`);
    console.log(`   升级技巧: ${bd.leveling_tips?.length || 0}条`);
  });

  // 5. 上传到 OSS
  if (OSS_CONFIG.accessKeyId && OSS_CONFIG.accessKeySecret) {
    console.log('\n☁️ 准备上传到 OSS...');
    const client = new OSS(OSS_CONFIG);
    await uploadToOSS(client, OUTPUT_FILE, OSS_UPLOAD_PATH);
  } else {
    console.log('\n⚠️ OSS 凭证未配置，跳过上传');
    console.log('请确保环境变量 OSS_ACCESS_KEY_ID 和 OSS_ACCESS_KEY_SECRET 已设置');
  }

  console.log('\n✅ 完成!');
}

main().catch(console.error);

// 直接运行时执行
if (require.main === module) {
  console.log('开始执行数据转换...\n');
  main()
    .then(() => {
      console.log('\n✅ 数据转换完成');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ 数据转换失败:', err.message);
      process.exit(1);
    });
}

// 导出函数供外部调用
module.exports = { main, transformPost };
