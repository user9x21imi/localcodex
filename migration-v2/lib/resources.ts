import { freemem, cpus } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
let last: any;
let sampledAt = 0;
export async function resources() {
  if (last && Date.now() - sampledAt < 10000) return { ...last, freeRamMB: Math.floor(freemem() / 1048576) };
  const sample: any = { freeRamMB: Math.floor(freemem() / 1048576), logicalCPUs: cpus().length };
  try {
    const { stdout } = await promisify(execFile)('nvidia-smi.exe', ['--query-gpu=memory.free,utilization.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 1800 });
    const [free, busy] = stdout.trim().split(',').map(v => Number.parseInt(v, 10));
    if (Number.isFinite(free)) sample.gpuFreeMB = free;
    if (Number.isFinite(busy)) sample.gpuBusyPercent = busy;
  } catch {}
  last = sample; sampledAt = Date.now();
  return sample;
}

