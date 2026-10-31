param([string]$Root=$PSScriptRoot,[string]$Reason='Остановлено пользователем')
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
New-Item "$Root\config-v2","$Root\state-v2" -ItemType Directory -Force|Out-Null
@{stopped=$true;reason=$Reason;time=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content "$Root\config-v2\emergency-stop.json" -Encoding utf8
@{enabled=$false}|ConvertTo-Json|Set-Content "$Root\config-v2\communication-runtime.json" -Encoding utf8
@{phase='stopped';result='cancelled';reason=$Reason}|ConvertTo-Json|Set-Content "$Root\state-v2\status.json" -Encoding utf8
$all=@(Get-CimInstance Win32_Process)
$roots=@($all|Where-Object{
 $_.ExecutablePath -in @("$Root\agent-v2\opencode.exe","$Root\agent\opencode.exe","$Root\runtime\llama-server.exe") -or
 ($_.Name -eq 'node.exe' -and $_.CommandLine -match ([regex]::Escape(($Root -replace '\\','/'))+'/channel/server\.mjs|'+[regex]::Escape($Root)+'\\channel\\server\.mjs')) -or
 ($_.Name -eq 'python.exe' -and $_.CommandLine -match 'windows_mcp' -and $_.CommandLine.Replace('/','\') -match [regex]::Escape($Root))
}|ForEach-Object ProcessId)
$targets=@($roots)
do{$more=@($all|Where-Object{$_.ParentProcessId -in $targets -and $_.ProcessId -notin $targets}|ForEach-Object ProcessId);$targets+=$more}while($more.Count)
$killed=@()
foreach($taskId in ($targets|Select-Object -Unique)){
 if($taskId -eq $PID){continue}
 $original=$all|Where-Object ProcessId -eq $taskId|Select-Object -First 1
 $current=Get-CimInstance Win32_Process -Filter "ProcessId=$taskId" -ErrorAction SilentlyContinue
 if($current -and $current.CreationDate -eq $original.CreationDate){Stop-Process -Id $taskId -Force -ErrorAction SilentlyContinue;$killed+=$taskId}
}
@{reason=$Reason;killed=$killed;time=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content "$Root\state-v2\last-stop.json" -Encoding utf8
Write-Output "LocalCodex остановлен: $Reason"
