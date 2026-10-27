param([string]$Task,[string[]]$File,[ValidateSet('Auto','Fast','MaxPower')][string]$Mode,[switch]$Hardware,[switch]$NoBridgePrompt)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$settings=Get-Content "$root\config-v2\launcher.json" -Raw | ConvertFrom-Json
if(!$Mode){$Mode=$settings.mode}
. "$root\hardware.ps1"
if($Hardware){Select-LocalProfile (Get-LocalHardware) $Mode; exit 0}
$env:LOCALCODEX_ROOT=$root
$env:LOCALCODEX_PWSH=(Get-Process -Id $PID).Path
$env:LOCALCODEX_MODE=$Mode
$env:OPENCODE_CONFIG="$root\config-v2\opencode.json"
$env:XDG_DATA_HOME="$root\data-v2";$env:XDG_CONFIG_HOME="$root\config-user-v2";$env:XDG_CACHE_HOME="$root\cache-v2";$env:XDG_STATE_HOME="$root\state-v2"
$env:OPENCODE_ENABLE_EXA='1';$env:PYTHONUTF8='1';$env:PYTHONIOENCODING='utf-8'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$OutputEncoding=[Text.UTF8Encoding]::new($false)
$marker="$root\logs\hardware-profile.json";$reuse=$false;$profile=$null
try {$models=Invoke-RestMethod http://127.0.0.1:8080/v1/models -TimeoutSec 2; if(Test-Path $marker){$profile=Get-Content $marker -Raw|ConvertFrom-Json;$reuse=(@($models.data.id)-contains 'localcodex') -and $profile.mode -eq $Mode}}catch{}
if(!$reuse){
 $ours=Get-CimInstance Win32_Process -Filter "name='llama-server.exe'" | Where-Object {$_.ExecutablePath -eq "$root\runtime\llama-server.exe"}
 foreach($proc in $ours){Stop-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue}
 $profile=Select-LocalProfile (Get-LocalHardware) $Mode
 $profile | ConvertTo-Json -Depth 5 | Set-Content $marker -Encoding utf8
 $model=Join-Path $root 'models\ggml-org\gpt-oss-20b-GGUF\gpt-oss-20b-MXFP4.gguf'
 $threads=[string]$profile.threads
 $arguments=@('-m',('"'+$model+'"'),'--device',$profile.device,'-ngl',[string]$profile.gpuLayers,'-c',[string]$profile.context,'-np','1','-t',$threads,'--jinja','-fa','on','-ctk','q8_0','-ctv','q8_0','--reasoning','on','--reasoning-budget',[string]$profile.reasoningBudget,'--host','127.0.0.1','--port','8080','--alias','localcodex','--no-warmup','--sleep-idle-seconds','120')
 Write-Host "Loading local model | $Mode | context $($profile.context) | GPU layers $($profile.gpuLayers)"
 $server=Start-Process "$root\runtime\llama-server.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput "$root\logs\server-stdout.txt" -RedirectStandardError "$root\logs\server-stderr.txt"
 $ready=$false
 for($i=0;$i-lt 120;$i++){if($server.HasExited){throw "Model failed to start. See $root\logs\server-stderr.txt"};try{$health=Invoke-RestMethod http://127.0.0.1:8080/health -TimeoutSec 2;if($health.status-eq'ok'){$ready=$true;break}}catch{};Start-Sleep -Seconds 1}
 if(!$ready){throw 'Model startup timed out.'}
}
$env:LOCALCODEX_OUTPUT_LIMIT=[string]$profile.outputLimit
$env:OPENCODE_CONFIG_CONTENT=(@{providers=@{local=@{models=@{localcodex=@{limit=@{context=$profile.context;output=$profile.outputLimit}}}}};compaction=@{buffer=[math]::Min(4096,[math]::Floor($profile.context/4));keep=@{tokens=[math]::Floor($profile.context/3)}}} | ConvertTo-Json -Depth 12 -Compress)
$argsList=@('--standalone')
if($settings.yolo){$argsList+='--auto'}
if($Task){$argsList=@('run')+$argsList+@('--model','local/localcodex','--agent','local','--format','json');foreach($attachment in $File){$argsList+=@('--file',$attachment)};$argsList+=@('--',$Task)}
& "$root\agent-v2\opencode.exe" @argsList
exit $LASTEXITCODE

