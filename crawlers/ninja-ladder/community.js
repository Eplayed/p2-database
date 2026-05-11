/**
 * 生成 community.json - 热门BD推荐数据
 * 从天梯数据中提取每个职业的 Top 1 玩家 BD
 */

// PoE2 职业中文映射
const CLASS_CN_MAP = {
  'Blood Mage': '血法师',
  'Infernalist': '狱咒师',
  'Deadeye': '死亡射手',
  'Pathfinder': '漫游者',
  'Chronomancer': '时空法师',
  'Stormweaver': '风暴编织者',
  'Titan': '泰坦',
  'Warbringer': '战争使者',
  'Witchhunter': '猎巫人',
  'Gemling Legionnaire': '古灵使徒斗士',
  'Acolyte of Chayula': '夏乌拉侍僧',
  'Invoker': '祈唤者',
  'Lich': '巫妖',
  'Druid': '德鲁伊',
  'Beastmaster': '驯兽师',
  'Champion': '冠军',
  'Slayer': '杀手',
  'Inquisitor': '审判者',
  'Oracle': '神谕者',
  'Shaman': '萨满',
  'Summoner': '召唤师',
};

/**
 * 从天梯数据生成 community.json
 */
function generateCommunityJSON(allPlayers, classList) {
  const builds = [];

  for (const [className, players] of Object.entries(allPlayers)) {
    const topPlayer = players[0];
    if (!topPlayer || !topPlayer.detail) continue;

    const detail = topPlayer.detail;
    const classCN = CLASS_CN_MAP[className] || className;

    // 提取主技能
    const mainSkillGems = detail.skills?.[0]?.gems || [];
    const mainSkill = mainSkillGems[0];
    const mainSkillName = mainSkill?.name || mainSkill?.originalName || '';
    const supportSkills = mainSkillGems.slice(1, 5).map(g => g.name || g.originalName || '');

    // 构建 BD 对象
    const build = {
      id: `PoE2_${className.replace(/\s+/g, '_')}_Top${topPlayer.rank}`,
      meta: {
        title: `${classCN} ${mainSkillName}流派`,
        author: topPlayer.account || '天梯玩家',
        class: className,
        name: classCN,
        tags: [mainSkillName, '天梯BD'].filter(Boolean),
      },
      intro: {
        desc: `${classCN}职业天梯排名第${topPlayer.rank}玩家的BD配置，主打${mainSkillName}。`,
        pros: [`${mainSkillName}输出强力`, '天梯验证强度可靠', '适合追求强度的玩家'],
        cons: ['造价可能较高', '需要一定操作技巧'],
      },
      skills: detail.skills || [],
      keystones: detail.keystones || [],
      equipment: {
        mainSkill: mainSkillName,
        supports: supportSkills,
        notes: '数据来源于poe.ninja天梯',
      },
      source: {
        rank: topPlayer.rank,
        account: topPlayer.account,
        level: topPlayer.level || detail.info?.level,
      },
    };

    builds.push(build);
  }

  return builds;
}

module.exports = { generateCommunityJSON };
