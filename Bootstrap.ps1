param([string]$Root='C:\LLM',[switch]$AgentChannel,[switch]$Voice,[switch]$Yolo,[switch]$EnableDelegation,[switch]$EnableSystemSwap,[ValidateSet('Auto','Fast','MaxPower')][string]$Mode='Auto')
$ErrorActionPreference='Stop'
$command=Get-Command pwsh.exe -ErrorAction SilentlyContinue
if($command){$pwsh=$command.Source}else{
 $tools=Join-Path $Root 'tools\powershell';New-Item $tools -ItemType Directory -Force|Out-Null
 $archive=Join-Path $tools 'powershell.zip'
 Invoke-WebRequest -UseBasicParsing 'https://github.com/PowerShell/PowerShell/releases/download/v7.6.8/PowerShell-7.6.8-win-x64.zip' -OutFile $archive
 if((Get-FileHash $archive -Algorithm SHA256).Hash -ne 'b9f074f923c499b51ec99d313da8e9ae90d17a9f3adf00c73d6189f34d908528'){throw 'PowerShell download checksum mismatch'}
 Expand-Archive $archive $tools -Force;$pwsh=Join-Path $tools 'pwsh.exe'
}
$argsList=@('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'Install.ps1'),'-Root',$Root,'-Mode',$Mode)
foreach($name in @('AgentChannel','Voice','Yolo','EnableDelegation','EnableSystemSwap')){if($PSBoundParameters.ContainsKey($name)-and $PSBoundParameters[$name]){$argsList+='-'+$name}}
& $pwsh @argsList
exit $LASTEXITCODE
