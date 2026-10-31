$ErrorActionPreference='Stop'
. "$PSScriptRoot/../scripts/Hardware.ps1"
$hw=[pscustomobject]@{threads=32;freeRamMB=20000;gpu=[pscustomobject]@{index=0;freeMB=14700}}
$auto=Select-LocalProfile $hw Auto
$fast=Select-LocalProfile $hw Fast
if($auto.gpuLayers-ne 99 -or $auto.context-ne 16384 -or $fast.context-gt 8192){throw '16GB GPU capacity regression'}
if($fast.outputLimit -gt 1536 -or $auto.outputLimit -gt $auto.context/4){throw 'Output reservation crowds out context'}
$hw.gpu.freeMB=4000
$small=Select-LocalProfile $hw Auto
if($small.gpuLayers-ge 24 -or $small.context-gt $auto.context){throw 'Low VRAM must reduce capacity'}
$hw.freeRamMB=1000
try{Select-LocalProfile $hw Auto|Out-Null;throw 'Expected memory failure'}catch{if($_.Exception.Message-notmatch 'Not enough free RAM'){throw}}
$hw.freeRamMB=20000;$hw.gpu=$null
$cpu=Select-LocalProfile $hw Auto
if($cpu.device-ne 'none' -or $cpu.gpuLayers-ne 0){throw 'Unknown GPU must use CPU fallback'}
'PASS: hardware capacity, Fast cap, low VRAM/RAM and CPU fallback'
