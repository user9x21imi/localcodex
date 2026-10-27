param([Parameter(Mandatory)][string]$Root)
$ErrorActionPreference='Stop'
$launcher=@'
@echo off
set "LCPS=%~dp0tools\powershell\pwsh.exe"
if not exist "%LCPS%" set "LCPS=pwsh.exe"
"%LCPS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0agent-v2.ps1" %*
'@
if((Test-Path "$Root/localcodex.cmd") -and !(Test-Path "$Root/localcodex-v1.cmd")){
 $old=Get-Content "$Root/localcodex.cmd" -Raw
 if($old -match 'agent\.ps1'){Copy-Item "$Root/localcodex.cmd" "$Root/localcodex-v1.cmd"}
}
$launcher|Set-Content "$Root/localcodex.cmd" -Encoding ascii
$launcher|Set-Content "$Root/localcodex-v2.cmd" -Encoding ascii
$userPath=[Environment]::GetEnvironmentVariable('Path','User')
if(@($userPath -split ';'|Where-Object {$_.TrimEnd('\') -eq $Root.TrimEnd('\')}).Count -eq 0){[Environment]::SetEnvironmentVariable('Path',(($userPath ?? '').TrimEnd(';')+';'+$Root),'User')}
Write-Host "Start: $Root/localcodex.cmd (new terminals: localcodex)"
