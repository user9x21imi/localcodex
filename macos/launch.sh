#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/tools/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p "$ROOT/logs"
# macOS dynamically manages disk-backed swap; do not replace dynamic_pager.
sysctl vm.swapusage >"$ROOT/logs/swap-macos.txt" 2>&1 || true
MODE=$(node -e 'try{const m=require(process.argv[1]).mode;console.log(["Auto","Fast","MaxPower"].includes(m)?m:"Auto")}catch{console.log("Auto")}' "$ROOT/config-v2/launcher.json")
if [[ "${1:-}" == --fast ]];then MODE=Fast;shift;elif [[ "${1:-}" == --max ]];then MODE=MaxPower;shift;fi
RAM=$(sysctl -n hw.memsize);CTX=8192
if ((RAM>=25769803776));then CTX=16384;fi
if ((RAM>=34359738368));then CTX=32768;fi
[[ "$MODE" == Fast ]] && CTX=8192
export LOCALCODEX_ROOT="$ROOT" LOCALCODEX_MODE="$MODE" LOCALCODEX_OUTPUT_LIMIT=$((CTX/2))
export LOCALCODEX_BACKEND=mlx
export OPENCODE_CONFIG="$ROOT/config-v2/opencode.json" XDG_DATA_HOME="$ROOT/data-v2" XDG_CONFIG_HOME="$ROOT/config-user-v2" XDG_CACHE_HOME="$ROOT/cache-v2" XDG_STATE_HOME="$ROOT/state-v2"
export OPENCODE_CONFIG_CONTENT="{\"providers\":{\"local\":{\"models\":{\"localcodex\":{\"limit\":{\"context\":$CTX,\"output\":$((CTX/2))}}}}},\"compaction\":{\"buffer\":$((CTX/4)),\"keep\":{\"tokens\":$((CTX/3))}}}"
if curl -fsS --max-time 2 http://127.0.0.1:8080/health >/dev/null;then
 [[ -f "$ROOT/logs/mlx-server.pid" ]] || { echo 'Port 8080 is already used by another server. Close it before starting MLX.';exit 1; }
 OWN_PID=$(cat "$ROOT/logs/mlx-server.pid")
 [[ "$OWN_PID" =~ ^[0-9]+$ ]] || exit 1
 COMMAND=$(ps -p "$OWN_PID" -o command= || true)
 [[ "$COMMAND" == *mlx_lm.server* && "$COMMAND" == *"$ROOT/models/mlx/gpt-oss-20b"* ]] || { echo 'Port 8080 belongs to a different server.';exit 1; }
else
 [[ -f "$ROOT/models/mlx/gpt-oss-20b/config.json" ]] || { echo 'MLX model missing. Run Install-macOS.command first.';exit 1; }
 "$ROOT/tools/mlx/bin/python" "$ROOT/macos/apple-hardware.py" > "$ROOT/logs/apple-accelerators.json"
 nohup "$ROOT/tools/mlx/bin/python" -m mlx_lm.server --model "$ROOT/models/mlx/gpt-oss-20b" --host 127.0.0.1 --port 8080 --allowed-origins http://127.0.0.1 --max-tokens "$((CTX/2))" --prompt-cache-size 1 --decode-concurrency 1 --prefill-step-size 256 >"$ROOT/logs/server-stdout.txt" 2>"$ROOT/logs/server-stderr.txt" & SERVER=$!
 printf '%s\n' "$SERVER" > "$ROOT/logs/mlx-server.pid"
 READY=false;for ((i=0;i<120;i++));do kill -0 "$SERVER" 2>/dev/null || { echo 'Model failed. Read logs/server-stderr.txt';exit 1; };if curl -fsS --max-time 2 http://127.0.0.1:8080/health >/dev/null;then READY=true;break;fi;sleep 1;done
 [[ "$READY" == true ]] || { echo 'Model startup timed out';exit 1; }
fi
AUTO=(--standalone);if [[ "$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).yolo===true" "$ROOT/config-v2/launcher.json")" == true ]];then AUTO+=(--auto);fi
if [[ $# -gt 0 ]];then "$ROOT/agent-v2/opencode" run "${AUTO[@]}" --model local/localcodex --agent local --format json -- "$*";else "$ROOT/agent-v2/opencode" "${AUTO[@]}";fi
