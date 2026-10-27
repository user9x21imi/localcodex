import { writeFile, readFile } from 'node:fs/promises';
import { resources } from './resources.ts';
import { root } from './paths.ts';
export async function setStatus(update:any){
  const path=`${root}/state-v2/status.json`;let previous:any={};try{previous=JSON.parse(await readFile(path,'utf8'))}catch{}
  await writeFile(path,JSON.stringify({...previous,...update,time:new Date().toISOString()})).catch(()=>{});
}
export async function sampleStatus(){const r=await resources();let communication='off';let apple:any={};try{communication=JSON.parse(await readFile(root+'/config-v2/communication-runtime.json','utf8')).enabled?'enabled':'off'}catch{};if(process.platform==='darwin'){try{apple=JSON.parse(await readFile(root+'/logs/apple-accelerators.json','utf8'))}catch{}}await setStatus({gpuPercent:r.gpuBusyPercent??null,gpuFreeMB:r.gpuFreeMB??null,freeRamMB:r.freeRamMB,communication,...apple});}
