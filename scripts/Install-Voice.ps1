param([string]$Root)
$ErrorActionPreference='Stop'
# Receive-Verified is provided by Install.ps1.
$asset=$assets|Where-Object repo -eq 'cjpais/Handy'
$installer="$Root/downloads/$($asset.name)"
Receive-Verified $asset.browser_download_url $installer ($asset.digest -replace '^sha256:','')
$target="$Root/voice/Handy"
if(!(Test-Path "$target/handy.exe")){
 $p=Start-Process $installer -ArgumentList @('/S',"/D=$target") -WindowStyle Hidden -Wait -PassThru
 if($p.ExitCode-ne 0){throw 'Handy installer failed'}
}
New-Item "$target/Data/models" -ItemType Directory -Force|Out-Null
New-Item "$target/portable" -ItemType File -Force|Out-Null
if(!(Test-Path "$target/Data/settings_store.json")){Copy-Item "$PSScriptRoot/../payload/handy-settings.json" "$target/Data/settings_store.json"}
$archive="$Root/downloads/parakeet-v3-int8.tar.gz"
Receive-Verified 'https://blob.handy.computer/parakeet-v3-int8.tar.gz' $archive '43d37191602727524a7d8c6da0eef11c4ba24320f5b4730f1a2497befc2efa77'
& tar.exe -xzf $archive -C "$target/Data/models"
if($LASTEXITCODE-ne 0){throw 'Voice model extraction failed'}
Write-Host "F5 voice installed. Start $target/handy.exe. F5 toggles recording and pastes; Enter stays manual."
