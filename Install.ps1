param([string]$Root='C:\LLM',[string]$ModelCache,[ValidateSet('Auto','Fast','MaxPower')][string]$Mode='Auto',[switch]$Yolo,[switch]$EnableDelegation,[switch]$Voice,[switch]$SkipModels,[switch]$ConfigureOnly,[switch]$AgentChannel,[switch]$EnableSystemSwap,[switch]$NonInteractive)
#requires -Version 7.0
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
if($Root -eq [IO.Path]::GetPathRoot($Root) -or $Root -eq $HOME -or $Root.StartsWith($env:SystemRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Choose a dedicated LocalCodex folder, not a drive root, home or Windows.'}
if(Test-Path $Root){if((Get-Item -LiteralPath $Root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Install target must not be a reparse point.'}}
foreach($dir in @('downloads','runtime','agent-v2','tools','models/vision','logs','config-v2','config-user-v2/opencode/plugins/localcodex')){New-Item (Join-Path $Root $dir) -ItemType Directory -Force|Out-Null}
function Receive-Verified([string]$Url,[string]$Path,[string]$Sha256){
 if(Test-Path -LiteralPath $Path){if((Get-FileHash $Path -Algorithm SHA256).Hash -eq $Sha256){return};throw "Checksum mismatch in existing file: $Path. Move it aside and retry."}
 New-Item (Split-Path $Path) -ItemType Directory -Force|Out-Null
 & curl.exe --fail --location --retry 3 --continue-at - --output "$Path.partial" $Url
 if($LASTEXITCODE -ne 0){throw "Download failed: $Url"}
 if((Get-FileHash "$Path.partial" -Algorithm SHA256).Hash -ne $Sha256){throw "Download checksum mismatch: $Path.partial"}
 Move-Item -LiteralPath "$Path.partial" -Destination $Path
}
function Expand-Asset($Asset,[string]$Destination){
 $path=Join-Path "$Root/downloads" $Asset.name
 Receive-Verified $Asset.browser_download_url $path ($Asset.digest -replace '^sha256:','')
 Expand-Archive -LiteralPath $path -DestinationPath $Destination -Force
}
$assets=Get-Content "$PSScriptRoot/versions.json" -Raw|ConvertFrom-Json
if(!$ConfigureOnly){
 Expand-Asset ($assets|Where-Object repo -eq 'ggml-org/llama.cpp') "$Root/runtime"
 Expand-Asset ($assets|Where-Object repo -eq 'astral-sh/uv') "$Root/tools/uv"
 $opencode=Get-Content "$PSScriptRoot/opencode-v2.json" -Raw|ConvertFrom-Json
 Receive-Verified $opencode.url "$Root/downloads/opencode-2.1.4.tgz" $opencode.sha256
 & tar.exe -xzf "$Root/downloads/opencode-2.1.4.tgz" -C "$Root/agent-v2"
 if($LASTEXITCODE -ne 0){throw 'OpenCode archive extraction failed.'}
 Copy-Item "$Root/agent-v2/package/bin/opencode.exe" "$Root/agent-v2/opencode.exe" -Force
 $env:UV_PYTHON_INSTALL_DIR="$Root/python";$env:UV_CACHE_DIR="$Root/cache/uv"
 $uv=(Get-ChildItem "$Root/tools/uv" -Filter uv.exe -Recurse|Select-Object -First 1).FullName
 if(!(Test-Path "$Root/tools/windows-mcp/Scripts/python.exe")){& $uv venv --python 3.13 "$Root/tools/windows-mcp";if($LASTEXITCODE-ne 0){throw 'Python environment failed'}}
 & $uv pip install --python "$Root/tools/windows-mcp/Scripts/python.exe" windows-mcp==0.8.8
 if($LASTEXITCODE-ne 0){throw 'Windows MCP install failed'}
}
if(!$SkipModels){foreach($model in (Get-Content "$PSScriptRoot/models.json" -Raw|ConvertFrom-Json)){
 $target=Join-Path $Root $model.path
 if(!(Test-Path $target) -and $ModelCache){$relative=$model.path -replace '^models/','';$cached=Join-Path $ModelCache $relative;if(Test-Path $cached){if((Get-FileHash $cached -Algorithm SHA256).Hash-ne$model.sha256){throw "Invalid model cache $cached"};New-Item (Split-Path $target) -ItemType Directory -Force|Out-Null;Copy-Item $cached $target}}
 Receive-Verified $model.url $target $model.sha256
}; 'SHA256 verified'|Set-Content "$Root/models/vision/verified.txt"}
$plugin="$Root/config-user-v2/opencode/plugins/localcodex"
foreach($name in @('index.ts','tui.tsx','powershell.ts','package.json','package-lock.json')){Copy-Item "$PSScriptRoot/migration-v2/$name" $plugin -Force}
New-Item "$plugin/lib" -ItemType Directory -Force|Out-Null; Copy-Item "$PSScriptRoot/migration-v2/lib/*" "$plugin/lib" -Recurse -Force
Copy-Item "$PSScriptRoot/scripts/Hardware.ps1" "$Root/hardware.ps1" -Force
Copy-Item "$PSScriptRoot/payload/agent-v2.ps1" "$Root/agent-v2.ps1" -Force
foreach($name in @('opencode.json','launcher.json','agents.json')){if(Test-Path "$Root/config-v2/$name"){Copy-Item "$Root/config-v2/$name" "$Root/config-v2/$name.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"}}
& "$PSScriptRoot/scripts/Configure.ps1" -Root $Root -Mode $Mode -Yolo:$Yolo -EnableDelegation:$EnableDelegation
@('@echo off','pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent-v2.ps1" %*')|Set-Content "$Root/localcodex-v2.cmd" -Encoding ascii
if(!$NonInteractive -and !$PSBoundParameters.ContainsKey('AgentChannel')){$AgentChannel=(Read-Host 'Включить связь с другими ИИ? Внешние агенты используют свои аккаунты и лимиты [y/N]') -match '^(y|yes|д|да)$'}
$launch=Get-Content "$Root/config-v2/launcher.json" -Raw|ConvertFrom-Json -AsHashtable
$launch['agentChannel']=[bool]$AgentChannel
$launch|ConvertTo-Json|Set-Content "$Root/config-v2/launcher.json" -Encoding utf8
New-Item "$Root/channel" -ItemType Directory -Force|Out-Null;Copy-Item "$PSScriptRoot/channel/*" "$Root/channel" -Recurse -Force
Copy-Item "$PSScriptRoot/scripts/Swap.ps1" "$Root/swap.ps1" -Force
& "$Root/swap.ps1" -EnableSystemManaged:$EnableSystemSwap | ConvertTo-Json -Depth 5 | Set-Content "$Root/logs/swap.json"
if(!(Get-Command node.exe -ErrorAction SilentlyContinue) -and !(Test-Path "$Root/tools/node/node.exe")){
 $node=Get-Content "$PSScriptRoot/node.json" -Raw|ConvertFrom-Json
 Receive-Verified $node.url "$Root/downloads/node.zip" $node.sha256
 Expand-Archive "$Root/downloads/node.zip" "$Root/tools/node-extracted" -Force
 New-Item "$Root/tools/node" -ItemType Directory -Force|Out-Null
 Get-ChildItem "$Root/tools/node-extracted/node-v24.22.1-win-x64" | Copy-Item -Destination "$Root/tools/node" -Recurse -Force
}
if($Voice){& "$PSScriptRoot/scripts/Install-Voice.ps1" -Root $Root}
if($AgentChannel){
 $agents=Get-Content "$Root/config-v2/agents.json" -Raw|ConvertFrom-Json -AsHashtable
 $agents['enabled']=$true
 $agents|ConvertTo-Json|Set-Content "$Root/config-v2/agents.json" -Encoding utf8

}
& "$PSScriptRoot/scripts/Register-Agents.ps1" -Root $Root
& "$PSScriptRoot/scripts/Activate.ps1" -Root $Root
& "$Root/agent-v2/opencode.exe" --version
if($LASTEXITCODE-ne 0){throw 'OpenCode verification failed'}
Write-Host "Installed: $Root/localcodex-v2.cmd | $Mode | YOLO=$([bool]$Yolo) | external delegation=$([bool]$EnableDelegation)"
Write-Host 'First startup may download pinned plugin dependencies. Existing V1 chats are preserved separately.'


