#!/usr/bin/env bash
# 论坛选题采集入口：供 Dashboard 手动补跑和 QClaw 定时任务共用。
# 此脚本只更新本地论坛选题素材，不触碰 translated-data 或 OSS。

set -u
set -o pipefail

P2_ROOT="/Users/zhangyajun/Documents/project/p2-database"
QCLAW_ROOT="/Users/zhangyajun/.qclaw"
PYTHON_BIN="/Users/zhangyajun/Library/Application Support/QClaw/python/bin/python3.11"
D4_SCRIPT="$QCLAW_ROOT/scripts/forum_update.py"
POE2_SCRIPT="$QCLAW_ROOT/scripts/caimogu_poe2.py"
EXCEL_PATH="$QCLAW_ROOT/workspace/论坛数据.xlsx"
LOCK_DIR="$QCLAW_ROOT/workspace/.forum-content-scan.lock"
RUN_LOG_DIR="$QCLAW_ROOT/logs/forum-runs"
SUMMARY_PATH="$P2_ROOT/dashboard/runtime/forum-content-scan.json"
D4_RESULT_PATH="$QCLAW_ROOT/workspace/forum-run-d2core.json"
POE2_RESULT_PATH="$QCLAW_ROOT/workspace/forum-run-caimogu.json"
QCLAW_NODE_BIN="/Applications/QClaw.app/Contents/Resources/node/node"
NODE_BIN="${NODE_BIN:-node}"

if [[ -x "$QCLAW_NODE_BIN" ]]; then
  export QCLAW_CLI_NODE_BINARY="$QCLAW_NODE_BIN"
fi

# Dashboard must keep the user's Chrome (including localhost:5177) untouched.
# Forum pages are public, so use an isolated Chromium for Testing session instead.
export FORUM_SCAN_BROWSER="${FORUM_SCAN_BROWSER:-cft}"
export FORUM_SCAN_KEEP_BROWSER="${FORUM_SCAN_KEEP_BROWSER:-1}"

# 部分 macOS 下载环境会把 xbrowser 的原生引擎保存为不可执行文件。
# 统一入口补齐权限，避免 Dashboard 与定时任务出现“浏览器操作失败”。
XBROWSER_BIN_DIR="$HOME/.openclaw/tools/xbrowser/node_modules/agent-browser/bin"
if [[ -d "$XBROWSER_BIN_DIR" ]]; then
  chmod +x "$XBROWSER_BIN_DIR"/agent-browser-darwin-* 2>/dev/null || true
fi

mkdir -p "$RUN_LOG_DIR" "$(dirname "$SUMMARY_PATH")"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [[ -f "$LOCK_DIR/pid" ]] && kill -0 "$(cat "$LOCK_DIR/pid")" 2>/dev/null; then
    echo "[lock] 论坛采集已在运行（PID $(cat "$LOCK_DIR/pid")），本次不重复启动。"
    exit 75
  fi

  echo "[lock] 清理失效锁：$LOCK_DIR"
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi

echo "$$" > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM

run_id="$(date '+%Y%m%d-%H%M%S')-$$"
started_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
d4_log="$RUN_LOG_DIR/${run_id}-d2core.log"
poe2_log="$RUN_LOG_DIR/${run_id}-caimogu.log"

read_sheet_counts() {
  "$PYTHON_BIN" - "$EXCEL_PATH" <<'PY'
import json
import os
import sys

path = sys.argv[1]
result = {"d4Rows": 0, "poe2Rows": 0, "updatedAt": "", "exists": os.path.exists(path)}
if result["exists"]:
    try:
        import openpyxl
        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        result["d4Rows"] = max(0, workbook["暗黑4"].max_row - 1) if "暗黑4" in workbook.sheetnames else 0
        result["poe2Rows"] = max(0, workbook["POE2"].max_row - 1) if "POE2" in workbook.sheetnames else 0
        result["updatedAt"] = __import__("datetime").datetime.fromtimestamp(
            os.path.getmtime(path), tz=__import__("datetime").timezone.utc
        ).isoformat().replace("+00:00", "Z")
    except Exception as error:
        result["error"] = str(error)
print(json.dumps(result, ensure_ascii=False))
PY
}

before_counts="$(read_sheet_counts)"
rm -f "$D4_RESULT_PATH" "$POE2_RESULT_PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ========== 开始论坛选题采集 ($run_id) =========="
echo "[browser] 独立采集会话：${FORUM_SCAN_BROWSER}（不会关闭 Chrome 或 Dashboard）"
echo "[source] D2Core 暗黑4"
set +e
"$PYTHON_BIN" "$D4_SCRIPT" 2>&1 | tee "$d4_log"
d4_exit=${PIPESTATUS[0]}
set -e

echo "[source] 踩蘑菇 POE2"
set +e
"$PYTHON_BIN" "$POE2_SCRIPT" 2>&1 | tee "$poe2_log"
poe2_exit=${PIPESTATUS[0]}
set -e

after_counts="$(read_sheet_counts)"
finished_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

export RUN_ID="$run_id" STARTED_AT="$started_at" FINISHED_AT="$finished_at"
export D4_EXIT="$d4_exit" POE2_EXIT="$poe2_exit" BEFORE_COUNTS="$before_counts" AFTER_COUNTS="$after_counts"
export D4_LOG="$d4_log" POE2_LOG="$poe2_log" SUMMARY_PATH D4_RESULT_PATH POE2_RESULT_PATH

"$PYTHON_BIN" - <<'PY'
import json
import os
from pathlib import Path

before = json.loads(os.environ["BEFORE_COUNTS"])
after = json.loads(os.environ["AFTER_COUNTS"])

def read_source_result(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as error:
        return {"status": "failed", "errors": [f"未读到来源结果：{error}"]}

def source(name, exit_code, before_key, after_key, log_path, result_path):
    delta = max(0, int(after.get(after_key, 0)) - int(before.get(before_key, 0)))
    result = read_source_result(result_path)
    errors = result.get("errors") or []
    source_status = result.get("status") if int(exit_code) == 0 else "failed"
    return {
        "name": name,
        "status": source_status,
        "exitCode": int(exit_code),
        "newRows": int(result.get("newRows", delta)),
        "listCount": int(result.get("listCount", 0)),
        "eligibleCount": int(result.get("eligibleCount", 0)),
        "skippedExisting": int(result.get("skippedExisting", 0)),
        "skippedFilter": int(result.get("skippedFilter", 0)) + int(result.get("skippedOld", 0)) + int(result.get("skippedLowReply", 0)),
        "shortBody": int(result.get("shortBody", 0)),
        "errors": errors[:5],
        "logPath": log_path,
    }

d2core = source("D2Core 暗黑4", os.environ["D4_EXIT"], "d4Rows", "d4Rows", os.environ["D4_LOG"], os.environ["D4_RESULT_PATH"])
caimogu = source("踩蘑菇 POE2", os.environ["POE2_EXIT"], "poe2Rows", "poe2Rows", os.environ["POE2_LOG"], os.environ["POE2_RESULT_PATH"])
source_statuses = [d2core["status"], caimogu["status"]]
if all(status == "success" for status in source_statuses):
    status = "success"
elif any(status == "success" for status in source_statuses):
    status = "partial"
else:
    status = "failed"

summary = {
    "runId": os.environ["RUN_ID"],
    "startedAt": os.environ["STARTED_AT"],
    "finishedAt": os.environ["FINISHED_AT"],
    "status": status,
    "sources": {
        "d2core": d2core,
        "caimogu": caimogu,
    },
    "excel": {
        "path": "/Users/zhangyajun/.qclaw/workspace/论坛数据.xlsx",
        **after,
    },
    "note": "论坛内容仅用于发现玩家问题和选题；事实、数值、补丁和活动信息仍需用一手来源核验。",
}

summary_path = Path(os.environ["SUMMARY_PATH"])
temporary_path = summary_path.with_suffix(".tmp")
temporary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
temporary_path.replace(summary_path)
print("[summary] " + json.dumps(summary, ensure_ascii=False))
PY

overall_status="$("$PYTHON_BIN" - "$SUMMARY_PATH" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["status"])
PY
)"

case "$overall_status" in
  success) overall_exit=0 ;;
  partial) overall_exit=2 ;;
  *) overall_exit=1 ;;
esac

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ========== 论坛选题采集结束：$overall_status =========="
echo "[content] 生成统一内容研究选题池"
if command -v "$NODE_BIN" >/dev/null 2>&1; then
  "$NODE_BIN" crawlers/content-research/build_topics.js || true
else
  echo "[content] 跳过：未找到 Node.js，可设置 NODE_BIN 后重试。"
fi
exit "$overall_exit"
