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

// 从正文提取技能组
function parseSkills(content) {
  if (!content || content.length < 50) return [];

  const skills = [];
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  // 技能组关键词
  const skillGroupKeywords = [
    '灵体', '召唤物', '图腾', '陷阱', '地雷', '闪电箭',
    '榴弹', '箭矢', '刀阵', '闪电新星', '冰川', '德瑞',
    '冰墙', '雨淞', '彗星', '施放', '打击', '引导',
    '残片', '大法师', '魔侍', '闪电专精', '冰霜专精',
    '元素要害', '暴击时施放'
  ];

  let currentGroup = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过太短或太长的行
    if (trimmed.length < 2 || trimmed.length > 50) continue;

    // 跳过包含这些关键词的行（噪声）
    const noisePatterns = ['登录', '注册', '发帖', '回复', '踩蘑菇', '视频介绍', '装备图片', '作者', '时间', '浏览'];
    if (noisePatterns.some(p => trimmed.includes(p))) continue;

    // 检查是否是技能组开头
    const isGroupStart = skillGroupKeywords.some(k => trimmed.includes(k));

    if (isGroupStart || !currentGroup) {
      if (currentGroup && currentGroup.links.length > 0) {
        skills.push(currentGroup);
      }

      currentGroup = {
        groupName: trimmed,
        groupIndex: skills.length + 1,
        mainSkills: [],
        supportSkills: [],
        links: []
      };
    }

    if (currentGroup) {
      // 判断是否是辅助技能
      const isSupport = trimmed.includes('效能') || trimmed.includes('集中') ||
                       trimmed.includes('节魔') || trimmed.includes('延长') ||
                       trimmed.includes('扩大') || trimmed.includes('保存') ||
                       trimmed.includes('精准') || trimmed.includes('散射');

      currentGroup.links.push({
        name: trimmed,
        isSupport
      });

      if (isSupport) {
        if (!currentGroup.supportSkills.includes(trimmed)) {
          currentGroup.supportSkills.push(trimmed);
        }
      } else {
        if (!currentGroup.mainSkills.includes(trimmed)) {
          currentGroup.mainSkills.push(trimmed);
        }
      }
    }
  }

  // 添加最后一个技能组
  if (currentGroup && currentGroup.links.length > 0) {
    skills.push(currentGroup);
  }

  return skills.slice(0, 10); // 最多10个技能组
}

// 转换单个帖子
function transformPost(post) {
  const content = post.content || '';
  const detectedClass = detectClass(content) || detectClass(post.title) || '';
  const tags = detectTags(content);
  const skills = parseSkills(content);

  // 从图片中获取天赋树图片
  let passiveImage = '';
  if (post.skillTreeImages && post.skillTreeImages.length > 0) {
    passiveImage = post.skillTreeImages[0].src;
  }

  return {
    id: `CaiMoGu_${post.id}`,
    meta: {
      title: post.title || '未命名BD',
      author: post.author || '社区玩家',
      class: detectedClass,
      name: post.title || '社区推荐',
      tags: tags
    },
    intro: {
      desc: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      pros: ['社区热门推荐', '经过玩家验证'],
      cons: ['效果因人而异']
    },
    skills: skills,
    equipment: {
      notes: `数据来源：踩蘑菇网 | 更新时间: ${post.publishTime || '最近'}`
    },
    passive_tree: {
      image: passiveImage,
      link: post.href || `https://www.caimogu.cc/post/${post.id}.html`
    },
    source: {
      platform: 'caimogu',
      originalAuthor: post.author || '',
      updateTime: post.publishTime || '',
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
  console.log(`📊 原始数据: ${rawData.summary?.detailedPosts || 0} 个详情帖`);

  // 2. 转换数据
  const transformed = rawData.detailedPosts
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
