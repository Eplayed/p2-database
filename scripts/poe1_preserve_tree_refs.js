#!/usr/bin/env node
/**
 * POE1 天梯 digest 天赋截图引用保留
 *
 * 背景：云端 GitHub Actions（update_poe1_season.yml，每 2 小时）重新生成
 * ladder_digest.json 时不含天赋截图步骤，会把本地 poe1_publish 写入的
 * passiveTreeImage 引用清空并上传覆盖。小程序天梯详情从该字段加载天赋图，
 * 导致一天中大部分时间天赋图不显示。
 *
 * 本脚本在云端「生成之后、上传之前」运行：下载 OSS 上现有的 digest，
 * 把其中的 passiveTreeImage 按 build id 回填到新生成的 digest，
 * 保证高频刷新不丢截图引用。
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

  let remote;
  try {
    remote = await fetchJson(remoteUrl);
  } catch (error) {
    console.warn(`⚠️ 无法读取 OSS 现有 digest（${error.message}），跳过截图引用回填`);
    return;
  }
  const remoteById = new Map(
    (Array.isArray(remote.builds) ? remote.builds : [])
      .filter((b) => b && b.id && b.passiveTreeImage)
      .map((b) => [b.id, b.passiveTreeImage])
  );
  if (!remoteById.size) {
    console.log('ℹ️ OSS 现有 digest 无天赋截图引用，无需回填');
    return;
  }

  let restored = 0;
  for (const build of builds) {
    if (!build || build.passiveTreeImage) continue;
    const image = remoteById.get(build.id);
    if (image) {
      build.passiveTreeImage = image;
      delete build.passiveTreeIsFullscreenPage;
      restored += 1;
    }
  }
  fs.writeFileSync(digestPath, `${JSON.stringify(digest, null, 2)}\n`);
  console.log(`✅ 已回填天赋截图引用: ${restored} 个 build（OSS 现有 ${remoteById.size} 个）`);
}

main().catch((error) => {
  console.error(`❌ 运行失败: ${error.message}`);
  process.exit(1);
});
