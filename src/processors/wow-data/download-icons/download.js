/**
 * 魔兽世界小程序资产下载管理器
 * 功能：批量下载职业图标、技能图标、副本背景图
 * 运行方式：node asset_manager.js
 * 依赖：npm install https-proxy-agent
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ================= 配置区域 =================

// 1. 代理设置 (根据你的网络环境修改)
const PROXY_URL = 'http://127.0.0.1:7890'; 

// 2. 存放目录 (相对于当前脚本)
const DIRS = {
  icons: path.join(__dirname, 'static', 'icons'),
  banners: path.join(__dirname, 'static', 'banners')
};

// ================= 数据列表 =================

// 【A. 图标列表】 (对应 Wowhead icons/medium/)
// 包含了 10 职业 + 30 天赋 + 常用 UI 图标
const ICONS_LIST = [
  // 职业
  'class_warrior', 'class_mage', 'class_rogue', 'class_druid', 'class_hunter', 
  'class_shaman', 'class_priest', 'class_warlock', 'class_paladin', 'class_deathknight',
  // 死骑
  'spell_deathknight_bloodpresence', 'spell_deathknight_frostpresence', 'spell_deathknight_unholypresence',
  // 德鲁伊
  'spell_nature_starfall', 'ability_racial_bearform', 'spell_nature_healingtouch',
  // 猎人
  'ability_hunter_beasttaming', 'ability_hunter_focusedaim', 'ability_hunter_camouflage',
  // 法师
  'spell_holy_magicalsentry', 'spell_fire_firebolt02', 'spell_frost_frostbolt02',
  // 骑士
  'spell_holy_holybolt', 'spell_holy_devotionaura', 'spell_holy_auraoflight',
  // 牧师
  'spell_holy_powerwordshield', 'spell_holy_guardianspirit', 'spell_shadow_shadowwordpain',
  // 盗贼
  'ability_rogue_eviscerate', 'ability_backstab', 'ability_stealth',
  // 萨满
  'spell_nature_lightning', 'spell_nature_lightningshield', 'spell_nature_magicimmunity',
  // 术士
  'spell_shadow_deathcoil', 'spell_shadow_metamorphosis', 'spell_shadow_rainoffire',
  // 战士
  'ability_warrior_savageblow', 'ability_warrior_innerrage', 'ability_warrior_defensivestance'
];

// 【B. 副本背景列表】 (对应 Wowhead journal/ui-ej-dungeonbutton-)
// 包含了经过验证的正确 Slug
const BANNERS_LIST = [
  // --- 80级 WotLK ---
  { name: 'bg_icc', slug: 'icecrowncitadel' },
  { name: 'bg_toc', slug: 'trialofthecrusader' },
  { name: 'bg_uld', slug: 'ulduar' },
  { name: 'bg_naxx', slug: 'naxxramas' },
  { name: 'bg_ony', slug: 'onyxia' },
  { name: 'bg_eoe', slug: 'eyeofeternity' },
  { name: 'bg_os', slug: 'obsidiansanctum' },
  { name: 'bg_rs', slug: 'rubysanctum' },
  { name: 'bg_voa', slug: 'vaultofarchavon' },

  // --- 70级 TBC (重难点已修正) ---
  { name: 'bg_swp', slug: 'sunwellplateau' },
  { name: 'bg_bt', slug: 'blacktemple' },
  { name: 'bg_hyjal', slug: 'cavernsoftime' },   // 海加尔山真名
  { name: 'bg_tk', slug: 'tempestkeep' },        // 风暴要塞真名
  { name: 'bg_ssc', slug: 'coilfangreservoir' }, // 毒蛇神殿真名
  { name: 'bg_gruul', slug: 'gruulslair' },
  { name: 'bg_mag', slug: 'magtheridonslair' },
  { name: 'bg_kara', slug: 'karazhan' },
  { name: 'bg_za', slug: 'zulaman' },

  // --- 60级 Classic ---
  { name: 'bg_naxx_60', slug: 'naxxramas' }, // 60级NAXX其实图一样，为了区分 ID 可以存一份
  { name: 'bg_taq', slug: 'templeofahnqiraj' },
  { name: 'bg_aq20', slug: 'ruinsofahnqiraj' },
  { name: 'bg_bwl', slug: 'blackwinglair' },
  { name: 'bg_mc', slug: 'moltencore' },
  { name: 'bg_zg', slug: 'zulgurub' }
];

// ================= 核心逻辑 =================

const agent = new HttpsProxyAgent(PROXY_URL);

// 初始化目录
Object.values(DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * 通用下载函数
 * @param {string} url - 远程地址
 * @param {string} destPath - 本地保存路径
 * @param {string} logName - 日志显示的名称
 */
const downloadFile = (url, destPath, logName) => {
  return new Promise((resolve) => {
    // 1. 检查文件是否存在 (跳过已下载)
    if (fs.existsSync(destPath)) {
      console.log(`⏩ 跳过已存在: ${logName}`);
      resolve(true);
      return;
    }

    const options = {
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
      }
    };

    const file = fs.createWriteStream(destPath);
    
    https.get(url, options, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✅ 下载成功: ${logName}`);
          resolve(true);
        });
      } else {
        console.error(`❌ 下载失败: ${logName} (HTTP ${res.statusCode})`);
        fs.unlink(destPath, () => {}); // 删除垃圾文件
        resolve(false);
      }
    }).on('error', (err) => {
      console.error(`❌ 网络错误: ${logName} - ${err.message}`);
      fs.unlink(destPath, () => {});
      resolve(false);
    });
  });
};

// 主程序
(async () => {
  console.log('🚀 开始资源同步...');
  console.log(`📂 图标目录: ${DIRS.icons}`);
  console.log(`📂 背景目录: ${DIRS.banners}`);

  // 1. 下载图标
  console.log('\n--- 正在检查图标 ---');
  for (const icon of ICONS_LIST) {
    const url = `https://wow.zamimg.com/images/wow/icons/medium/${icon}.jpg`;
    const dest = path.join(DIRS.icons, `${icon}.jpg`);
    await downloadFile(url, dest, `${icon}.jpg`);
  }

  // 2. 下载 Banner
  console.log('\n--- 正在检查 Banner ---');
  for (const banner of BANNERS_LIST) {
    // URL 前缀
    const url = `https://wow.zamimg.com/images/wow/journal/ui-ej-dungeonbutton-${banner.slug}.png`;
    const dest = path.join(DIRS.banners, `${banner.name}.png`);
    await downloadFile(url, dest, `${banner.name}.png`);
  }

  console.log('\n🎉 所有资源同步完成！');
})();