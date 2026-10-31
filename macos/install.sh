#!/bin/bash
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'This installer is for macOS.'; exit 1; }
[[ "$(uname -m)" == arm64 ]] || { echo 'This preview supports Apple Silicon only.'; exit 1; }
ROOT="${1:-$HOME/LLM}"
[[ "$ROOT" != / && "$ROOT" != "$HOME" && "$ROOT" = /* ]] || { echo 'Choose a dedicated absolute folder.'; exit 1; }
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
RAM=$(sysctl -n hw.memsize)
if [[ "${LOCALCODEX_RUNTIME_ONLY:-0}" != 1 ]];then
 ((RAM >= 17179869184)) || { echo 'Нужно минимум 16 ГБ памяти; рекомендуется 24–32 ГБ.'; exit 1; }
fi
[[ ! -L "$ROOT" ]] || { echo 'Папка установки не должна быть символической ссылкой.';exit 1; }
mkdir -p "$ROOT"/{downloads,runtime,tools/node,agent-v2,models/vision,config-v2,channel,config-user-v2/opencode/plugins/localcodex,logs,state-v2}
AVAILABLE=$(df -Pk "$ROOT"|awk 'END {print $4}')
if [[ "${LOCALCODEX_RUNTIME_ONLY:-0}" != 1 ]] && ((AVAILABLE<25*1024*1024));then echo 'Нужно минимум 25 ГБ свободного диска; рекомендуется 30 ГБ.';exit 1;fi
receive(){ local url="$1" file="$2" hash="$3"; if [[ -f "$file" ]]; then [[ "$(shasum -a 256 "$file"|cut -d' ' -f1)" == "$hash" ]] || { echo "Checksum mismatch: $file"; exit 1; };return;fi;curl -fL --retry 3 -C - -o "$file.partial" "$url";[[ "$(shasum -a 256 "$file.partial"|cut -d' ' -f1)" == "$hash" ]] || { echo 'Checksum mismatch';exit 1; };mv "$file.partial" "$file"; }
receive 'https://nodejs.org/dist/v24.22.1/node-v24.22.1-darwin-arm64.tar.gz' "$ROOT/downloads/node-macos.tar.gz" '89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7'
tar -xzf "$ROOT/downloads/node-macos.tar.gz" --strip-components=1 -C "$ROOT/tools/node"
export PATH="$ROOT/tools/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
node --version
receive 'https://github.com/astral-sh/uv/releases/download/0.13.5/uv-aarch64-apple-darwin.tar.gz' "$ROOT/downloads/uv-macos.tar.gz" '743f85035a1996ecb350659e01cd9faea9709829be09b1b4b03c73eaf3c9cd73'
mkdir -p "$ROOT/tools/uv" "$ROOT/macos"
tar -xzf "$ROOT/downloads/uv-macos.tar.gz" --strip-components=1 -C "$ROOT/tools/uv"
export UV_PYTHON_INSTALL_DIR="$ROOT/python" UV_CACHE_DIR="$ROOT/cache/uv"
if [[ ! -x "$ROOT/tools/mlx/bin/python" ]];then "$ROOT/tools/uv/uv" venv --python 3.13 "$ROOT/tools/mlx";fi
"$ROOT/tools/uv/uv" pip install --python "$ROOT/tools/mlx/bin/python" -r "$SOURCE/macos/requirements.txt"
cp "$SOURCE/macos/"*.py "$ROOT/macos/"
"$ROOT/tools/mlx/bin/python" "$ROOT/macos/apple-hardware.py" > "$ROOT/logs/apple-accelerators.json"
"$ROOT/tools/mlx/bin/python" "$ROOT/macos/coreml-selftest.py" > "$ROOT/logs/coreml-selftest.json"
"$ROOT/tools/mlx/bin/python" -m mlx_lm.server --help > "$ROOT/logs/mlx-server-help.txt"
receive 'https://github.com/ggml-org/llama.cpp/releases/download/b11889/llama-b11889-bin-macos-arm64.tar.gz' "$ROOT/downloads/llama-macos.tar.gz" '4a3aa4a1e6425d6e0709dc3752943f5e58f4fde6ccb9cebdf0f5de8d1d694f57'
tar -xzf "$ROOT/downloads/llama-macos.tar.gz" -C "$ROOT/runtime"
SERVER=$(find "$ROOT/runtime" -type f -name llama-server -print -quit)
[[ -n "$SERVER" ]] || { echo 'llama-server missing';exit 1; }
if [[ "$SERVER" != "$ROOT/runtime/llama-server" ]];then ln -sf "$SERVER" "$ROOT/runtime/llama-server";fi
curl -fL --retry 3 -o "$ROOT/downloads/opencode-macos.tgz" 'https://registry.npmjs.org/@opencode/cli-darwin-arm64/-/cli-darwin-arm64-2.1.4.tgz'
[[ "$(openssl dgst -sha512 -binary "$ROOT/downloads/opencode-macos.tgz"|openssl base64 -A)" == 'QwjyvovTdT0gFi5rxUyPVlYePIe3ELduR9olu+KJWe089XVIDOTMhxylBe/ZGIpvoXHYo6bp2NskIiqCFAEXsw==' ]] || { echo 'OpenCode checksum mismatch';exit 1; }
tar -xzf "$ROOT/downloads/opencode-macos.tgz" -C "$ROOT/agent-v2"
cp "$ROOT/agent-v2/package/bin/opencode" "$ROOT/agent-v2/opencode"
chmod +x "$ROOT/agent-v2/opencode" "$ROOT/runtime/llama-server"
if [[ "${LOCALCODEX_RUNTIME_ONLY:-0}" != 1 ]];then
 node "$SOURCE/macos/models.mjs" "$SOURCE/macos/mlx-models.json" "$ROOT"
 node "$SOURCE/macos/models.mjs" "$SOURCE/macos/vision-models.json" "$ROOT"
 printf 'SHA256 verified\n' > "$ROOT/models/vision/verified.txt"
fi
PLUGIN="$ROOT/config-user-v2/opencode/plugins/localcodex"
cp "$SOURCE/migration-v2/"{index.ts,tui.tsx,powershell.ts,package.json,package-lock.json} "$PLUGIN/"
mkdir -p "$PLUGIN/lib";cp "$SOURCE/migration-v2/lib/"*.ts "$PLUGIN/lib/"
cp "$SOURCE/channel/"*.mjs "$ROOT/channel/"
cp "$SOURCE/macos/launch.sh" "$ROOT/localcodex";chmod +x "$ROOT/localcodex"
cp "$SOURCE/macos/Start-LocalCodex.command" "$ROOT/Start-LocalCodex.command";chmod +x "$ROOT/Start-LocalCodex.command"
CHANNEL=${LOCALCODEX_AGENT_CHANNEL:-false};YOLO=${LOCALCODEX_YOLO:-false}
if [[ ! -f "$ROOT/config-v2/AGENTS.md" ]];then cp "$SOURCE/payload/AGENTS.md" "$ROOT/config-v2/AGENTS.md";fi
if [[ "${LOCALCODEX_NONINTERACTIVE:-0}" != 1 ]];then
 read -r -p 'Включить связь с другими ИИ? Внешние агенты используют свои лимиты [y/N]: ' ANSWER
 [[ "$ANSWER" =~ ^[yYдД] ]] && CHANNEL=true
 read -r -p 'Автоматически разрешать действия инструментов (YOLO)? [y/N]: ' ANSWER
 [[ "$ANSWER" =~ ^[yYдД] ]] && YOLO=true
fi
STAMP=$(date +%Y%m%d-%H%M%S)
for NAME in opencode.json agents.json launcher.json;do if [[ -f "$ROOT/config-v2/$NAME" ]];then cp "$ROOT/config-v2/$NAME" "$ROOT/config-v2/$NAME.backup-$STAMP";fi;done
node "$SOURCE/macos/configure.mjs" "$SOURCE" "$ROOT" "$CHANNEL" "$YOLO"
if [[ "$CHANNEL" == true ]] && command -v codex >/dev/null;then
 codex mcp add localcodex -- "$ROOT/tools/node/bin/node" "$ROOT/channel/mcp.mjs" "$ROOT" || echo 'MCP Codex можно зарегистрировать вручную.'
fi
sysctl vm.swapusage | tee "$ROOT/logs/swap-macos.txt"
"$ROOT/runtime/llama-server" --version
"$ROOT/agent-v2/opencode" --version
if [[ "${LOCALCODEX_RUNTIME_ONLY:-0}" == 1 ]];then
 echo 'Runtime smoke test finished; model weights were not downloaded.'
else
 printf '\nУстановка завершена. Запуск: %s/Start-LocalCodex.command\nИз терминала: "%s/localcodex"\nСвязь переключается /agent communication.\n' "$ROOT" "$ROOT"
fi
