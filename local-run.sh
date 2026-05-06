#!/bin/bash
# ==========================================
# PoE2 数据爬虫 — 本地一键运行脚本
# 用法: ./local-run.sh [dev|production]
# 默认 production
# ==========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ENV="${1:-production}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo "════════════════════════════════════════════"
echo "  🚀 PoE2 Data Crawler — $ENV"
echo "  ⏰ $TIMESTAMP"
echo "════════════════════════════════════════════"
echo ""

# === 1. 翻译爬虫（poe.ninja）===
echo "─── 1/3: 翻译爬虫 ─────────────────────────"
NODE_ENV="$ENV" node run_crawler.js --translate

# === 2. 聚合分析 ===
echo ""
echo "─── 2/3: 聚合分析 ─────────────────────────"
NODE_ENV="$ENV" node scripts/aggregate_analysis.js

# === 3. 上传 OSS ===
echo ""
echo "─── 3/3: 上传 OSS ─────────────────────────"
NODE_ENV="$ENV" node -e "require('./auto_browser/upload_to_oss')()"

echo ""
echo "════════════════════════════════════════════"
echo "  ✅ 全部完成！"
echo "════════════════════════════════════════════"
