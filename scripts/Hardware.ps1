param([ValidateSet('Auto','Fast','MaxPower')][string]$Mode='Auto',[string]$OutputPath)
$ErrorActionPreference='Stop'
function Get-LocalHardware {
    $os=Get-CimInstance Win32_OperatingSystem
    $cpu=Get-CimInstance Win32_ComputerSystem
    $gpu=$null
    try {
        $rows=& nvidia-smi.exe --query-gpu=index,name,memory.total,memory.free,utilization.gpu --format=csv,noheader,nounits 2>$null
        if($LASTEXITCODE -eq 0){$gpu=@($rows | ForEach-Object {$v=$_ -split ',\s*'; [pscustomobject]@{index=[int]$v[0];name=$v[1];totalMB=[int]$v[2];freeMB=[int]$v[3];busy=[int]$v[4]}} | Sort-Object freeMB -Descending)[0]}
    } catch {}
    [pscustomobject]@{ramMB=[math]::Floor($cpu.TotalPhysicalMemory/1MB);freeRamMB=[math]::Floor($os.FreePhysicalMemory/1024);threads=[Environment]::ProcessorCount;gpu=$gpu}
}
function Select-LocalProfile($Hardware,[string]$Mode) {
    # Capacity is fixed at launch; model request reasoning can change per prompt.
    $gpu=$Hardware.gpu
    $usable=if($gpu){[math]::Max(0,$gpu.freeMB-1536)}else{0}
    $context=if($usable -ge 14000){32768}elseif($usable -ge 10500){16384}elseif($usable -ge 6500){8192}else{4096}
    if($Mode -eq 'Fast'){$context=[math]::Min($context,8192)}
    $layers=if($usable -ge 12800){99}else{[math]::Max(0,[math]::Min(23,[math]::Floor(($usable-512)/550)))}
    if($Hardware.freeRamMB -lt 4096 -and $layers -lt 24){throw 'Not enough free RAM for partial CPU offload. Close applications before loading the model.'}
    [pscustomobject]@{mode=$Mode;context=$context;gpuLayers=$layers;device=if($gpu){"Vulkan$($gpu.index)"}else{'none'};threads=[math]::Max(2,[math]::Min(16,[math]::Floor($Hardware.threads/2)));reasoningBudget=if($Mode -eq 'Fast'){256}else{4096};outputLimit=if($context -le 8192){[math]::Min(1536,[math]::Floor($context/4))}else{[math]::Min(8192,[math]::Floor($context/4))};gpu=$gpu;freeRamMB=$Hardware.freeRamMB;warning=if(!$gpu){'NVIDIA VRAM probe unavailable. Conservative CPU mode; AMD/Intel not yet calibrated.'}elseif($layers -lt 24){'Partial CPU offload: slower than full GPU. Layer count is a conservative estimate, not a speed benchmark.'}else{''}}
}
if($MyInvocation.InvocationName -ne '.'){
    $result=Select-LocalProfile (Get-LocalHardware) $Mode
    if($OutputPath){$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputPath -Encoding utf8}
    $result
}

