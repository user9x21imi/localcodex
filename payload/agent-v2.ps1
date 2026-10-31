param([string]$Task,[string[]]$File,[ValidateSet('Auto','Fast','MaxPower')][string]$Mode,[switch]$Hardware,[switch]$NoBridgePrompt,[ValidateSet('Main','Uncensored')][string]$ModelProfile,[switch]$Resume)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$settings=Get-Content "$root\config-v2\launcher.json" -Raw | ConvertFrom-Json
if(!$ModelProfile){$ModelProfile=if($env:LOCALCODEX_MODEL_PROFILE -eq 'Uncensored'){'Uncensored'}else{'Main'}}
$env:LOCALCODEX_MODEL_PROFILE=$ModelProfile
$definition=$null
if($ModelProfile -eq 'Uncensored'){$definition=(Get-Content "$root\config-v2\model-profiles.json" -Raw|ConvertFrom-Json).Uncensored}
$env:LOCALCODEX_MODEL_ARCH=if($definition){$definition.architecture}else{'gpt-oss'}
if(!$Mode){$Mode=if($env:LOCALCODEX_MODE -in @('Auto','Fast','MaxPower')){$env:LOCALCODEX_MODE}else{$settings.mode}}
. "$root\hardware.ps1"
function Set-AgentModelProfile($Profile){
 if($definition){
  $free=$Profile.gpu.freeMB
  $Profile.gpuLayers=if(!$Profile.gpu){0}elseif($free -ge 8500){99}elseif($free -ge 6000){20}else{8}
  $Profile.context=if($free -ge 11000 -and $Mode -eq 'MaxPower'){32768}elseif($free -ge 9000 -and $Mode -ne 'Fast'){16384}else{8192}
  $Profile.reasoningBudget=if($Mode -eq 'Fast'){256}else{2048}
  $Profile.warning=if($Profile.gpuLayers -eq 99){''}else{'Partial CPU offload; close GPU applications for full GPU speed.'}
 }
 $Profile|Add-Member -NotePropertyName modelProfile -NotePropertyValue $ModelProfile -Force
 $Profile.outputLimit=if($Profile.context -le 8192){[math]::Min(1536,[math]::Floor($Profile.context/4))}else{[math]::Min(8192,[math]::Floor($Profile.context/4))}
 return $Profile
}
if($Hardware){Set-AgentModelProfile (Select-LocalProfile (Get-LocalHardware) $Mode); exit 0}
$stopPath="$root\config-v2\emergency-stop.json"
if(Test-Path $stopPath){$stopState=Get-Content $stopPath -Raw|ConvertFrom-Json;if($stopState.stopped -and !$Resume){throw "Агент остановлен: $($stopState.reason). Для нового сеанса: uncensored -Resume (или localcodex -Resume)."}}
$watchReady=$false
try{$watch=Get-Content "$root\state-v2\stop-hotkey.json" -Raw|ConvertFrom-Json;$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$($watch.pid)";$watchReady=$watch.registered -and $proc.CommandLine -like '*Watch-Agent.ps1*'}catch{}
if(!$watchReady){
 Start-Process (Get-Process -Id $PID).Path -ArgumentList @('-NoProfile','-File',('"'+$root+'\Watch-Agent.ps1"'),'-Root',('"'+$root+'"')) -WindowStyle Hidden -RedirectStandardOutput "$root\logs\stop-watch-stdout.txt" -RedirectStandardError "$root\logs\stop-watch-stderr.txt"|Out-Null
 for($i=0;$i-lt 40;$i++){Start-Sleep -Milliseconds 200;try{$watch=Get-Content "$root\state-v2\stop-hotkey.json" -Raw|ConvertFrom-Json;$proc=Get-CimInstance Win32_Process -Filter "ProcessId=$($watch.pid)";if($watch.registered -and $proc.CommandLine -like '*Watch-Agent.ps1*'){$watchReady=$true;break}}catch{}}
}
if(!$watchReady){throw 'Не работает аварийная клавиша. Запуск агента заблокирован; смотри logs/stop-watch-stderr.txt.'}
if($Resume){
 & "$root\Stop-Agent.ps1" -Root $root -Reason 'Завершение старых процессов перед новым сеансом'|Out-Null
 $settled=$false
 for($i=0;$i-lt 30;$i++){
  if(!(Test-Path "$root\config-v2\stop-request.json")){$settled=$true;break}
  try{$request=Get-Content "$root\config-v2\stop-request.json" -Raw|ConvertFrom-Json;$ack=Get-Content "$root\state-v2\stop-request-handled.json" -Raw|ConvertFrom-Json;if($request.nonce -eq $ack.nonce){$settled=$true;break}}catch{}
  Start-Sleep -Milliseconds 200
 }
 if(!$settled){throw 'Аварийная остановка ещё не завершена. Запуск заблокирован.'}
 @{stopped=$false;reason='Явный запуск нового сеанса';time=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content $stopPath -Encoding utf8
}
$env:LOCALCODEX_ROOT=$root
$env:LOCALCODEX_PWSH=(Get-Process -Id $PID).Path
$env:LOCALCODEX_MODE=$Mode
$env:OPENCODE_CONFIG="$root\config-v2\opencode.json"
$env:XDG_DATA_HOME="$root\data-v2";$env:XDG_CONFIG_HOME="$root\config-user-v2";$env:XDG_CACHE_HOME="$root\cache-v2";$env:XDG_STATE_HOME="$root\state-v2"
$env:OPENCODE_ENABLE_EXA='1';$env:PYTHONUTF8='1';$env:PYTHONIOENCODING='utf-8'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$OutputEncoding=[Text.UTF8Encoding]::new($false)
$marker="$root\logs\hardware-profile.json";$reuse=$false;$profile=$null
try {$models=Invoke-RestMethod http://127.0.0.1:8080/v1/models -TimeoutSec 2; if(Test-Path $marker){$profile=Get-Content $marker -Raw|ConvertFrom-Json;$loadedProfile=if($profile.modelProfile){$profile.modelProfile}else{'Main'};$reuse=(@($models.data.id)-contains 'localcodex') -and $profile.mode -eq $Mode -and $loadedProfile -eq $ModelProfile}}catch{}
if(!$reuse){
 $model=if($definition){Join-Path $root $definition.path}else{Join-Path $root 'models\ggml-org\gpt-oss-20b-GGUF\gpt-oss-20b-MXFP4.gguf'}
 if(!(Test-Path -LiteralPath $model)){throw "Model not installed: $model"}
 $frontends=Get-CimInstance Win32_Process -Filter "name='opencode.exe'"|Where-Object {$_.ExecutablePath -eq "$root\agent-v2\opencode.exe"}
 if($frontends){throw 'Close the other LocalCodex window before switching model profiles.'}
 $ours=Get-CimInstance Win32_Process -Filter "name='llama-server.exe'" | Where-Object {$_.ExecutablePath -eq "$root\runtime\llama-server.exe"}
 foreach($proc in $ours){Stop-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue}
 $profile=Set-AgentModelProfile (Select-LocalProfile (Get-LocalHardware) $Mode)
 $profile | ConvertTo-Json -Depth 5 | Set-Content $marker -Encoding utf8
 $threads=[string]$profile.threads
 $arguments=@('-m',('"'+$model+'"'),'--device',$profile.device,'-ngl',[string]$profile.gpuLayers,'-c',[string]$profile.context,'-np','1','-t',$threads,'--jinja','-fa','on','-ctk','q8_0','-ctv','q8_0','--reasoning','on','--reasoning-budget',[string]$profile.reasoningBudget,'--host','127.0.0.1','--port','8080','--alias','localcodex','--no-warmup','--sleep-idle-seconds','120')
 Write-Host "Loading local agent | $ModelProfile | $Mode | context $($profile.context) | GPU layers $($profile.gpuLayers)"
 $server=Start-Process "$root\runtime\llama-server.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput "$root\logs\server-stdout.txt" -RedirectStandardError "$root\logs\server-stderr.txt"
 $ready=$false
 for($i=0;$i-lt 120;$i++){if($server.HasExited){throw "Model failed to start. See $root\logs\server-stderr.txt"};try{$health=Invoke-RestMethod http://127.0.0.1:8080/health -TimeoutSec 2;if($health.status-eq'ok'){$ready=$true;break}}catch{};Start-Sleep -Seconds 1}
 if(!$ready){throw 'Model startup timed out.'}
}
$profile.outputLimit=if($profile.context -le 8192){[math]::Min(1536,[math]::Floor($profile.context/4))}else{[math]::Min(8192,[math]::Floor($profile.context/4))}
$env:LOCALCODEX_OUTPUT_LIMIT=[string]$profile.outputLimit
$modelOptions=@{limit=@{context=$profile.context;output=$profile.outputLimit}}
if($definition){$modelOptions.name=$definition.name}
$env:OPENCODE_CONFIG_CONTENT=(@{providers=@{local=@{models=@{localcodex=$modelOptions}}};compaction=@{buffer=[math]::Min(2048,[math]::Floor($profile.context/16));keep=@{tokens=[math]::Floor($profile.context/3)}}} | ConvertTo-Json -Depth 12 -Compress)
$argsList=@('--standalone')
if($settings.yolo){$argsList+='--auto'}
if($Task){$argsList=@('run')+$argsList+@('--model','local/localcodex','--agent','local','--format','json');foreach($attachment in $File){$argsList+=@('--file',$attachment)};$argsList+=@('--',$Task)}
& "$root\agent-v2\opencode.exe" @argsList
if(Test-Path $stopPath){$stopState=Get-Content $stopPath -Raw|ConvertFrom-Json;if($stopState.stopped){Write-Host "Агент остановлен: $($stopState.reason). Новый сеанс: uncensored -Resume" -ForegroundColor Yellow}}
exit $LASTEXITCODE

