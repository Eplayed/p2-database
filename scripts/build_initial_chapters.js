#!/usr/bin/env node

/**
 * 开荒清单章节数据构建：base-data/chapters/initial_chapters.json（人工维护）
 *   → translated-data/{env}/miniprogram_data/initial_chapters.json（小程序读取）
 *
 * 历史上这份数据只以手工上传的形式存在于 OSS 根目录（initialChapters.json），
 * 不在任何管线与 manifest 里；此脚本把它纳入正常链路。根目录那份仍保留，
 * 供未更新的老版本小程序读取。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'base-data/chapters/initial_chapters.json');
const ENV_NAME = process.env.NODE_ENV === 'dev' ? 'dev' : 'release';
const OUT_DIR = path.join(ROOT, 'translated-data', ENV_NAME, 'miniprogram_data');
const OUT_FILE = 'initial_chapters.json';

function assertString(value, field, where) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${where}: ${field} 必须是非空字符串`);
  }
}

function normalizeTask(task, chapterId, seenTaskIds) {
  const where = `章节 ${chapterId} 的任务 ${task && task.id}`;
  if (!task || typeof task !== 'object') throw new Error(`${where}: 必须是对象`);
  if (task.id === undefined || task.id === null || task.id === '') {
    throw new Error(`${where}: id 不能为空`);
  }
  // 只用字符串化后的 id 做唯一性校验；输出保持原类型，
  // 因为前端 mergeUserProgress 用 === 比对本地进度里的 id，改类型会让用户勾选丢失
  const dedupeKey = String(task.id);
  if (seenTaskIds.has(dedupeKey)) throw new Error(`任务 ID 重复: ${dedupeKey}（用户进度按任务 ID 存储，必须全局唯一）`);
  seenTaskIds.add(dedupeKey);
  assertString(task.name, 'name', where);

  // 打包出去的章节数据不得预置完成状态：完成与否只来自本地进度
  return Object.assign({}, task, { completed: false });
}

function normalizeChapter(chapter, index, seenChapterIds, seenTaskIds) {
  const where = `第 ${index + 1} 章`;
  if (!chapter || typeof chapter !== 'object') throw new Error(`${where}: 必须是对象`);
  if (chapter.id === undefined || chapter.id === null || chapter.id === '') {
    throw new Error(`${where}: id 不能为空`);
  }
  const dedupeKey = String(chapter.id);
  if (seenChapterIds.has(dedupeKey)) throw new Error(`章节 ID 重复: ${dedupeKey}`);
  seenChapterIds.add(dedupeKey);
  assertString(chapter.name, 'name', where);
  if (!Array.isArray(chapter.tasks) || !chapter.tasks.length) {
    throw new Error(`${where}（${chapter.name}）: tasks 不能为空`);
  }

  return Object.assign({}, chapter, {
    tasks: chapter.tasks.map(task => normalizeTask(task, chapter.id, seenTaskIds)),
  });
}

function buildInitialChapters() {
  if (!fs.existsSync(SOURCE_FILE)) throw new Error(`数据源不存在: ${SOURCE_FILE}`);
  const source = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  if (!Array.isArray(source) || !source.length) throw new Error('章节数据必须是非空数组');

  const seenChapterIds = new Set();
  const seenTaskIds = new Set();
  const chapters = source.map((chapter, index) => normalizeChapter(chapter, index, seenChapterIds, seenTaskIds));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, OUT_FILE), JSON.stringify(chapters, null, 2));

  return {
    chapters,
    chapterCount: chapters.length,
    taskCount: chapters.reduce((sum, chapter) => sum + chapter.tasks.length, 0),
    outDir: OUT_DIR,
  };
}

if (require.main === module) {
  const result = buildInitialChapters();
  console.log('🗺️  开荒清单章节数据已生成');
  console.log(`   环境: ${ENV_NAME}`);
  console.log(`   章节: ${result.chapterCount}`);
  console.log(`   任务: ${result.taskCount}`);
  console.log(`   输出: ${path.relative(ROOT, result.outDir)}/${OUT_FILE}`);
}

module.exports = { buildInitialChapters };
