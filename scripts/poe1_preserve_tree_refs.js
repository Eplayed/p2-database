#!/usr/bin/env node
/**
 * POE1 天梯 digest 天赋截图引用保留 / 回填
 *
 * 背景有两层：
 * 1. 云端重建 ladder_digest.json 时不含天赋截图步骤，会把本地 poe1_publish 写入的
 *    passiveTreeImage 引用清空并上传覆盖（该工作流现在是手动触发，但历史清空仍留在产物里）。
 * 2. capture_passive_trees.js 的 limit 默认 30，只截前 30 个 BD；后续全量跑批留下的图片
 *    比 digest 里的引用多。实测 282 个 build 里 92 个有对应本地图片，却只有 29 条引用生效。
 *
 * 因此本脚本做两轮回填，在「生成之后、上传之前」运行：
 * - 第一轮：下载 OSS 现有 digest，按 build id 把已有引用补回来。
 * - 第二轮：按截图脚本的文件命名规则，用本地 passive-trees/ 里已存在的图片补引用。
 * 只填空字段，不覆盖已有值；不修改图片文件本身。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const env = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const OSS_PUBLIC_BASE = process.env.OSS_PUBLIC_BASE_URL
  || 'https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com';
const remoteUrl = `${OSS_PUBLIC_BASE}/poe1-season/${env}/miniprogram_data/ladder_digest.json`;
const digestPath = path.join(
  __dirname, '..', 'translated-data', 'poe1', env, 'miniprogram_data', 'ladder_digest.json'
);

function fetchJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(digestPath)) {
    console.error(`❌ 本地 digest 不存在: ${digestPath}`);
    process.exit(1);
  }
  const digest = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
  const builds = Array.isArray(digest.builds) ? digest.builds : [];
  if (!builds.length) {
    console.error('❌ 本地 digest builds 为空，跳过合并（避免空数据覆盖 OSS）');
    process.exit(1);
  }

  // 第一轮：OSS 现有 digest 里已生效的引用，按 build id 补回来
  let restoredFromRemote = 0;
  try {
    const remote = await fetchJson(remoteUrl);
    const remoteById = new Map(
      (Array.isArray(remote.builds) ? remote.builds : [])
        .filter((b) => b && b.id && b.passiveTreeImage)
        .map((b) => [b.id, b.passiveTreeImage])
    );
    for (const build of builds) {
      if (!build || build.passiveTreeImage) continue;
      const image = remoteById.get(build.id);
      if (image) {
        build.passiveTreeImage = image;
        delete build.passiveTreeIsFullscreenPage;
        restoredFromRemote += 1;
      }
    }
  } catch (error) {
    console.warn(`⚠️ 无法读取 OSS 现有 digest（${error.message}），跳过远端回填，继续本地图片回填`);
  }

  // 第二轮：按截图脚本的命名规则，用本地已存在的图片补引用。
  // 远端回填只能救回"曾经生效过"的引用，跑批新增的图必须靠这一轮。
  const treesDir = path.join(path.dirname(digestPath), 'passive-trees');
  const treeFileName = build =>
    `${String(build.id || `${build.account}-${build.character}`)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase()}.jpg`;
  let fileNames;
  try {
    fileNames = new Set(fs.readdirSync(treesDir));
  } catch (error) {
    console.warn(`⚠️ 本地天赋图目录不可用（${error.message}），跳过图片回填`);
    fileNames = new Set();
  }
  const prefix = (digest.passiveTreeImages && digest.passiveTreeImages.prefix)
    || `${OSS_PUBLIC_BASE}/poe1-season/${env}/miniprogram_data/passive-trees/`;

  let restoredFromFile = 0;
  for (const build of builds) {
    if (!build || build.passiveTreeImage) continue;
    const fileName = treeFileName(build);
    if (!fileNames.has(fileName)) continue;
    build.passiveTreeImage = `${prefix}${fileName}`;
    restoredFromFile += 1;
  }

  const total = builds.filter(b => b && b.passiveTreeImage).length;
  if (!restoredFromRemote && !restoredFromFile) {
    console.log(`ℹ️ 无需回填，当前 ${total} 个 build 有天赋图引用`);
    return;
  }
  fs.writeFileSync(digestPath, `${JSON.stringify(digest, null, 2)}\n`);
  console.log(
    `✅ 天赋截图引用回填：远端 ${restoredFromRemote} 个、本地图片 ${restoredFromFile} 个；` +
    `现共 ${total}/${builds.length} 个 build 有图（本地图片文件 ${fileNames.size} 个）`
  );
}

main().catch((error) => {
  console.error(`❌ 运行失败: ${error.message}`);
  process.exit(1);
});
