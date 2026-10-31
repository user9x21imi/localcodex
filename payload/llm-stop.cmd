@echo off
set "LCPS=%~dp0tools\powershell\pwsh.exe"
if not exist "%LCPS%" set "LCPS=pwsh.exe"
"%LCPS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-Agent.ps1" %*
