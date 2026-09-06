#!/bin/bash
# p2-database 每日自动数据管线
# 作用：确保 Dashboard 服务在运行 → 依次触发 4 个发布任务 → 状态快照写入个人工作台
#
# 用法：
#   bash scripts/auto_daily.sh                          # 跑全部 4 个任务（cron 同款）
#   bash scripts/auto_daily.sh --snapshot               # 只刷新工作台状态快照，不跑任务
#   bash scripts/auto_daily.sh --only daily_publish     # 只跑指定任务（逗号分隔多个）
#
# 日志：dashboard/runtime/logs/auto_daily_YYYYMMDD.log（cron 总日志见 auto_daily_cron.log）

set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${DASHBOARD_PORT:-5177}"
API="http://localhost:${PORT}"
ENV_NAME="${P2_ENV:-release}"
LOG_DIR="$BASE/dashboard/runtime/logs"
STATUS_JS="/Users/zhangyajun/Documents/workbench/assets/p2-status.js"
TODAY_TAG=$(date +%Y%m%d)
RUN_LOG="$LOG_DIR/auto_daily_${TODAY_TAG}.log"
QCLAW_NODE_BIN="/Applications/QClaw.app/Contents/Resources/node/node"
CODEX_NODE_BIN="/Users/zhangyajun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
NODE_BIN="${NODE_BIN:-}"

if [ -z "$NODE_BIN" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [ -x "$QCLAW_NODE_BIN" ]; then
    NODE_BIN="$QCLAW_NODE_BIN"
  elif [ -x "$CODEX_NODE_BIN" ]; then
    NODE_BIN="$CODEX_NODE_BIN"
  else
    NODE_BIN="node"
  fi
fi

# 任务超时（秒）——ladder 实测约 80 分钟，给 2 小时
TIMEOUT_daily_publish=900
TIMEOUT_ladder_bd_publish=7200
TIMEOUT_poe1_publish=1800
TIMEOUT_forum_content_scan=900

ALL_TASKS="daily_publish,ladder_bd_publish,poe1_publish,forum_content_scan"
TASKS="$ALL_TASKS"
MODE="run"
for arg in "$@"; do
  case "$arg" in
    --snapshot) MODE="snapshot" ;;
    --only) : ;;
    *) if [ "$arg" != "${arg#*,}" ] || echo "$ALL_TASKS" | grep -qw "$arg" 2>/dev/null; then TASKS="$arg"; fi ;;
  esac
done

log(){ echo "[$(date '+%H:%M:%S')] $*" | tee -a "$RUN_LOG"; }

# ---------- 1. 确保 Dashboard 服务在运行 ----------
SERVER_STARTED=0
api_alive(){ curl -sf --noproxy '*' -m 5 "$API/api/tasks" >/dev/null 2>&1; }

if ! api_alive; then
  log "Dashboard 未运行，拉起中…"
  (cd "$BASE" && nohup "$NODE_BIN" dashboard/server.js >> "$LOG_DIR/auto_server.log" 2>&1 & echo $! > /tmp/p2_dashboard.pid)
  for i in $(seq 1 30); do
    sleep 2
    if api_alive; then break; fi
    if [ "$i" = "30" ]; then log "错误：Dashboard 60 秒内未启动，中止"; exit 1; fi
  done
  SERVER_STARTED=1
  log "Dashboard 已拉起 (pid $(cat /tmp/p2_dashboard.pid 2>/dev/null))"
fi

# ---------- 2. 依次触发任务 ----------
get_json(){ curl -sf --noproxy '*' -m 10 "$1" 2>/dev/null; }

run_id_of(){ # $1=task -> 当前 state 里记录的 runId
  get_json "$API/api/status" | python3 -c "
import json,sys
try: print(json.load(sys.stdin)['state']['runs'].get('$1',{}).get('runId',''))
except Exception: print('')" 2>/dev/null
}

trigger_task(){ # $1=task -> 0 成功触发；409（其他任务运行中）时等待释放后重试
  local task="$1" code wait_elapsed=0 retry=0
  local max_wait="${TASK_WAIT_TIMEOUT:-7200}" # 409 等待上限（ladder 最长约80分钟，默认2小时）
  while :; do
    code=$(curl -s --noproxy '*' -m 10 -o /tmp/p2_run_resp.json -w "%{http_code}" -X POST "$API/api/run" \
      -H 'Content-Type: application/json' \
      -d "{\"taskId\":\"$task\",\"environment\":\"$ENV_NAME\"}")
    if [ "$code" = "202" ]; then return 0; fi
    if [ "$code" = "409" ]; then
      if [ "$wait_elapsed" = "0" ]; then
        local holder; holder=$(python3 -c "
import json
try: print(json.load(open('/tmp/p2_run_resp.json')).get('error','未知任务'))
except Exception: print('未知任务')" 2>/dev/null)
        log "  任务被占用（${holder}），等待释放后重试（上限 ${max_wait}s）"
      fi
      if [ "$wait_elapsed" -ge "$max_wait" ]; then
        log "  等待 ${wait_elapsed}s 后仍被占用，跳过 $task"
        return 1
      fi
      sleep 30; wait_elapsed=$((wait_elapsed+30))
      if [ $((wait_elapsed % 600)) = "0" ]; then log "  …已等待 ${wait_elapsed}s（占用中）"; fi
      continue
    fi
    # 其他错误（网络抖动/服务重启等）快速重试 3 次
    retry=$((retry+1))
    if [ "$retry" -le "3" ]; then
      log "  触发失败 (HTTP $code)，第 ${retry}/3 次重试…"
      sleep 10
      continue
    fi
    log "  触发失败 (HTTP $code): $(head -c 200 /tmp/p2_run_resp.json 2>/dev/null)"
    return 1
  done
}

wait_task(){ # $1=task $2=timeout秒 ; 轮询直到 state 里出现新 runId 且无运行中任务
  local task="$1" timeout="$2" before="$3" elapsed=0 new_id status
  while :; do
    sleep 30; elapsed=$((elapsed+30))
    local snapshot; snapshot=$(get_json "$API/api/status")
    new_id=$(echo "$snapshot" | python3 -c "
import json,sys
try: print(json.load(sys.stdin)['state']['runs'].get('$task',{}).get('runId',''))
except Exception: print('')" 2>/dev/null)
    local running; running=$(echo "$snapshot" | python3 -c "
import json,sys
try: print('1' if json.load(sys.stdin).get('currentRun') else '0')
except Exception: print('0')" 2>/dev/null)
    if [ -n "$new_id" ] && [ "$new_id" != "$before" ] && [ "$running" = "0" ]; then
      status=$(echo "$snapshot" | python3 -c "
import json,sys
try: print(json.load(sys.stdin)['state']['runs'].get('$task',{}).get('status',''))
except Exception: print('')" 2>/dev/null)
      log "  完成：$status"
      return 0
    fi
    if [ "$elapsed" -ge "$timeout" ]; then log "  超时（${timeout}s），放弃等待"; return 1; fi
    if [ $((elapsed % 300)) = 0 ]; then log "  …已等待 ${elapsed}s"; fi
  done
}

if [ "$MODE" = "run" ]; then
  log "===== 开始自动数据管线（环境 $ENV_NAME，任务：$TASKS）====="
  IFS=',' read -ra TASK_ARR <<< "$TASKS"
  for task in "${TASK_ARR[@]}"; do
    log "▶ $task"
    before=$(run_id_of "$task")
    if trigger_task "$task"; then
      eval "wait_task \"$task\" \"\${TIMEOUT_$task:-1800}\" \"\$before\"" || true
    fi
  done
  log "===== 任务全部结束 ====="
fi

# ---------- 3. 状态快照写入工作台 ----------
write_snapshot(){
  local status_json auto_json
  status_json=$(get_json "$API/api/status")
  [ -z "$status_json" ] && { log "快照失败：/api/status 无响应"; return 1; }
  auto_json=$(get_json "$API/api/automation-settings")
  STATUS_JSON="$status_json" AUTO_JSON="$auto_json" STATUS_JS="$STATUS_JS" python3 <<'PYEOF'
import json, os, datetime

status = json.loads(os.environ["STATUS_JSON"])
try:
    auto = json.loads(os.environ["AUTO_JSON"]).get("automation", {})
except Exception:
    auto = {}

order = ["daily_publish", "ladder_bd_publish", "poe1_publish", "forum_content_scan"]
meta = {
    "daily_publish":     {"name": "日常数据更新",  "game": "POE2", "desc": "通货·DD373·急救箱·复访摘要"},
    "ladder_bd_publish": {"name": "天梯/BD 解析",  "game": "POE2", "desc": "poe.ninja 天梯与查 BD 索引"},
    "poe1_publish":      {"name": "POE1 全量更新", "game": "POE1", "desc": "天梯·开荒BD·行情·天赋树"},
    "forum_content_scan":{"name": "论坛选题池",    "game": "选题", "desc": "POE/暗黑/魔兽热点参考"},
}
runs = status.get("state", {}).get("runs", {})
tasks = []
for tid in order:
    r = runs.get(tid, {})
    m = meta.get(tid, {})
    tasks.append({
        "id": tid, "name": m.get("name", tid), "game": m.get("game", ""),
        "desc": m.get("desc", ""), "status": r.get("status", "never"),
        "startedAt": r.get("startedAt", ""), "finishedAt": r.get("finishedAt", ""),
        "durationMs": r.get("durationMs", 0), "runId": r.get("runId", ""),
        "error": (r.get("error") or "")[:300],
    })

out = {
    "generatedAt": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "serverPort": 5177,
    "environment": "release",
    "currentRun": status.get("currentRun"),
    "automation": {
        "enabled": bool(auto.get("enabled")),
        "intervalMinutes": auto.get("intervalMinutes", 0),
    },
    "localCron": "每天 09:00（本机 crontab → scripts/auto_daily.sh）",
    "cloudJobs": [
        {"name": "POE2 经济摘要", "schedule": "每天 4/10/16/22 点", "where": "GitHub Actions"},
        {"name": "POE1 赛季数据", "schedule": "每 2 小时", "where": "GitHub Actions"},
        {"name": "DD373 国服行情", "schedule": "每 15 分钟", "where": "GitHub Actions"},
    ],
    "tasks": tasks,
}
js = "window.P2_STATUS = " + json.dumps(out, ensure_ascii=False, indent=2) + ";\n"
path = os.environ["STATUS_JS"]
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    f.write(js)
print("快照已写入:", path)
PYEOF
}

write_snapshot || true

# ---------- 4. 若本次由脚本拉起服务，收尾关掉 ----------
if [ "$SERVER_STARTED" = "1" ]; then
  running=$(get_json "$API/api/status" | python3 -c "
import json,sys
try: print('1' if json.load(sys.stdin).get('currentRun') else '0')
except Exception: print('0')" 2>/dev/null)
  if [ "$running" = "0" ] && [ -f /tmp/p2_dashboard.pid ]; then
    kill "$(cat /tmp/p2_dashboard.pid)" 2>/dev/null && log "临时拉起的 Dashboard 已关闭"
  else
    log "仍有任务运行中，保留 Dashboard 服务"
  fi
fi
log "auto_daily 结束"
