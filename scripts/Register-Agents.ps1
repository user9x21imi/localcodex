param([Parameter(Mandatory)][string]$Root)
$ErrorActionPreference='Stop'
$codex=Get-Command codex -ErrorAction SilentlyContinue|Select-Object -First 1
$node=if(Test-Path "$Root/tools/node/node.exe"){"$Root/tools/node/node.exe"}else{(Get-Command node.exe -ErrorAction SilentlyContinue).Source}
if($codex -and $node){
 & $codex.Source mcp add localcodex -- $node "$Root/channel/mcp.mjs" $Root
 if($LASTEXITCODE -ne 0){Write-Warning 'Codex MCP registration failed. See README for manual registration.'}
}else{Write-Host 'Codex/Node not found: MCP bridge can be registered later using README.'}
