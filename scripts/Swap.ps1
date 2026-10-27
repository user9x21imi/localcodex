param([switch]$EnableSystemManaged)
$ErrorActionPreference='Stop'
$system=Get-CimInstance Win32_ComputerSystem
$changed=$false
if($EnableSystemManaged -and !$system.AutomaticManagedPagefile){
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent();$principal=[Security.Principal.WindowsPrincipal]::new($identity)
 if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Enable system-managed pagefile from an elevated PowerShell. Restart may be required.'}
 Set-CimInstance -InputObject $system -Property @{AutomaticManagedPagefile=$true}|Out-Null; $changed=$true
}
[pscustomobject]@{changed=$changed;restartMayBeRequired=$changed;systemManaged=(Get-CimInstance Win32_ComputerSystem).AutomaticManagedPagefile;pagefiles=@(Get-CimInstance Win32_PageFileUsage|Select-Object Name,AllocatedBaseSize,CurrentUsage,PeakUsage);note='Swap backs RAM, not GPU VRAM or the model context limit. Windows controls pagefile growth.'}
