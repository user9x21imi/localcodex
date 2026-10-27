#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/logs"
# macOS dynamically manages disk-backed swap; do not replace dynamic_pager.
sysctl vm.swapusage >"$ROOT/logs/swap-macos.txt" 2>&1 || true
MODE=Auto
if [[ "${1:-}" == --fast ]];then MODE=Fast;shift;elif [[ "${1:-}" == --max ]];then MODE=MaxPower;shift;fi
RAM=$(sysctl -n hw.memsize);CTX=8192;LAYERS=12
if ((RAM>=25769803776));then CTX=16384;LAYERS=99;fi
if ((RAM>=34359738368));then CTX=32768;fi
[[ "$MODE" == Fast ]] && CTX=8192
export LOCALCODEX_ROOT="$ROOT" LOCALCODEX_MODE="$MODE" LOCALCODEX_OUTPUT_LIMIT=$((CTX/2))
export OPENCODE_CONFIG="$ROOT/config-v2/opencode.json" XDG_DATA_HOME="$ROOT/data-v2" XDG_CONFIG_HOME="$ROOT/config-user-v2" XDG_CACHE_HOME="$ROOT/cache-v2" XDG_STATE_HOME="$ROOT/state-v2"
export OPENCODE_CONFIG_CONTENT="{\"providers\":{\"local\":{\"models\":{\"localcodex\":{\"limit\":{\"context\":$CTX,\"output\":$((CTX/2))}}}}},\"compaction\":{\"buffer\":$((CTX/4)),\"keep\":{\"tokens\":$((CTX/3))}}}"
if ! curl -fsS --max-time 2 http://127.0.0.1:8080/health >/dev/null;then
 "$ROOT/runtime/llama-server" -m "$ROOT/models/ggml-org/gpt-oss-20b-GGUF/gpt-oss-20b-MXFP4.gguf" -ngl "$LAYERS" -c "$CTX" -np 1 --jinja -fa on --host 127.0.0.1 --port 8080 --alias localcodex --reasoning on --reasoning-budget 4096 --sleep-idle-seconds 120 >"$ROOT/logs/server-stdout.txt" 2>"$ROOT/logs/server-stderr.txt" & SERVER=$!
 READY=false;for ((i=0;i<120;i++));do kill -0 "$SERVER" 2>/dev/null || { echo 'Model failed. Read logs/server-stderr.txt';exit 1; };if curl -fsS --max-time 2 http://127.0.0.1:8080/health >/dev/null;then READY=true;break;fi;sleep 1;done
 [[ "$READY" == true ]] || { echo 'Model startup timed out';exit 1; }
fi
if [[ $# -gt 0 ]];then "$ROOT/agent-v2/opencode" run --standalone --model local/localcodex --agent local --format json -- "$*";else "$ROOT/agent-v2/opencode" --standalone;fi
