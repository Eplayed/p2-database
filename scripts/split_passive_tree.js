/**
 * 后处理脚本：将 player JSON 中的 passiveTreeImage (base64) 拆成独立 .jpg 文件
 * 用法: node scripts/split_passive_tree.js [--dev]
 */

const fs = require('fs');
const path = require('path');

const env = process.argv.includes('--dev') ? 'dev' : 'release';
const PLAYERS_DIR = path.join(__dirname, '..', 'translated-data', env, 'players');

if (!fs.existsSync(PLAYERS_DIR)) {
  console.error('❌ 目录不存在:', PLAYERS_DIR);
  process.exit(1);
}

const files = fs.readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.json'));
console.log(`📁 处理环境: ${env}, 找到 ${files.length} 个 player 文件`);

let processedCount = 0;
let skippedCount = 0;
let savedBytes = 0;

for (const file of files) {
  const filePath = path.join(PLAYERS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);

  if (data.passiveTreeImageUrl && !data.passiveTreeImage) {
    skippedCount++;
    continue;
  }

  if (!data.passiveTreeImage) {
    skippedCount++;
    continue;
  }

  const imgData = data.passiveTreeImage;
  if (imgData.startsWith('data:image/')) {
    const matches = imgData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const imgBuffer = Buffer.from(matches[2], 'base64');
      const imgFileName = file.replace('.json', '_tree.jpg');
      
      fs.writeFileSync(path.join(PLAYERS_DIR, imgFileName), imgBuffer);
      
      const originalSize = Buffer.byteLength(JSON.stringify(data));
      data.passiveTreeImageUrl = `players/${imgFileName}`;
      delete data.passiveTreeImage;
      const newSize = Buffer.byteLength(JSON.stringify(data));
      savedBytes += (originalSize - newSize);
      
      fs.writeFileSync(filePath, JSON.stringify(data));
      processedCount++;
    }
  }
}

console.log(`
✅ 处理完成:`);
console.log(`   转换: ${processedCount} 个文件`);
console.log(`   跳过: ${skippedCount} 个文件`);
console.log(`   节省: ${(savedBytes / 1024 / 1024).toFixed(1)} MB`);

const allFiles = fs.readdirSync(PLAYERS_DIR);
let totalSize = 0;
for (const f of allFiles) {
  totalSize += fs.statSync(path.join(PLAYERS_DIR, f)).size;
}
console.log(`   目录总大小: ${(totalSize / 1024 / 1024).toFixed(1)} MB (含 .jpg 文件)`);
