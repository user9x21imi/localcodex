#!/bin/bash
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'This installer is for macOS.'; exit 1; }
[[ "$(uname -m)" == arm64 ]] || { echo 'This preview supports Apple Silicon only.'; exit 1; }
ROOT="${1:-$HOME/LLM}"
[[ "$ROOT" != / && "$ROOT" != "$HOME" && "$ROOT" = /* ]] || { echo 'Choose a dedicated absolute folder.'; exit 1; }
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v node >/dev/null; then
 command -v brew >/dev/null || { echo 'Install Node.js from https://nodejs.org/ or Homebrew, then retry.'; exit 1; }
 brew install node
fi
RAM=$(sysctl -n hw.memsize)
((RAM >= 17179869184)) || { echo 'gpt-oss-20b preview requires at least 16 GB unified memory; 24+ GB recommended.'; exit 1; }
mkdir -p "$ROOT"/{downloads,runtime,agent-v2,models/vision,config-v2,config-user-v2/opencode/plugins/localcodex,logs,state-v2}
receive(){ local url="$1" file="$2" hash="$3"; if [[ -f "$file" ]]; then [[ "$(shasum -a 256 "$file"|cut -d' ' -f1)" == "$hash" ]] || { echo "Checksum mismatch: $file"; exit 1; };return;fi;curl -fL --retry 3 -C - -o "$file.partial" "$url";[[ "$(shasum -a 256 "$file.partial"|cut -d' ' -f1)" == "$hash" ]] || { echo 'Checksum mismatch';exit 1; };mv "$file.partial" "$file"; }
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
node "$SOURCE/macos/models.mjs" "$SOURCE/models.json" "$ROOT"
printf 'SHA256 verified\n' > "$ROOT/models/vision/verified.txt"
PLUGIN="$ROOT/config-user-v2/opencode/plugins/localcodex"
cp "$SOURCE/migration-v2/"{index.ts,tui.tsx,powershell.ts,package.json,package-lock.json} "$PLUGIN/"
mkdir -p "$PLUGIN/lib";cp "$SOURCE/migration-v2/lib/"*.ts "$PLUGIN/lib/"
cp -R "$SOURCE/channel" "$ROOT/"
cp "$SOURCE/macos/launch.sh" "$ROOT/localcodex";chmod +x "$ROOT/localcodex"
CHANNEL=false;read -r -p 'Enable optional agent communication at startup? [y/N] ' ANSWER
[[ "$ANSWER" =~ ^[yY]$ ]] && CHANNEL=true
node "$SOURCE/macos/configure.mjs" "$SOURCE" "$ROOT" "$CHANNEL"
sysctl vm.swapusage | tee "$ROOT/logs/swap-macos.txt"
"$ROOT/agent-v2/opencode" --version
printf '\nInstalled preview. Start: %s/localcodex\nmacOS runtime has not been tested on the Windows build machine.\n' "$ROOT"
