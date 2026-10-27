import {readFile,writeFile,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {root} from './paths.ts';
export async function communicationController(){
 let child:ReturnType<typeof spawn>|undefined;
 const configPath=root+'/config-v2/launcher.json';
 const runtimePath=root+'/config-v2/communication-runtime.json';
 let enabled=false;
 const read=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
 async function set(value:boolean,persist=true){
  if(value&&!child){
   let running=false;try{const r:any=await fetch('http://127.0.0.1:8099/health',{signal:AbortSignal.timeout(800)}).then(x=>x.json());running=r.name==='LocalCodex'}catch{}
   if(!running){
    let node=process.platform==='win32'?'node.exe':'node';try{await access(root+'/tools/node/node.exe');node=root+'/tools/node/node.exe'}catch{}
    child=spawn(node,[root+'/channel/server.mjs',root],{windowsHide:true,stdio:'ignore',env:{...process.env,LOCALCODEX_COMMUNICATION:'1'}});
    let failure:Error|undefined;child.once('error',e=>{failure=e});
    let ready=false;for(let i=0;i<40;i++){if(failure)throw failure;try{const r:any=await fetch('http://127.0.0.1:8099/health',{signal:AbortSignal.timeout(500)}).then(x=>x.json());if(r.name==='LocalCodex'){ready=true;break}}catch{};await new Promise(r=>setTimeout(r,100))}
    if(!ready){child.kill();child=undefined;throw new Error('Не удалось запустить локальный канал. Проверь Node.js и порт 8099.')}
   }
  }
  enabled=value;
  await writeFile(runtimePath,JSON.stringify({enabled}));
  if(persist){const settings=await read(configPath);settings.agentChannel=enabled;await writeFile(configPath,JSON.stringify(settings,null,2))}
  const agents=await read(root+'/config-v2/agents.json');agents.enabled=enabled;await writeFile(root+'/config-v2/agents.json',JSON.stringify(agents,null,2));
  if(!value&&child){child.kill();child=undefined}
  return enabled;
 }
 const settings=await read(configPath);await set(!!settings.agentChannel,false);
 return {get enabled(){return enabled},toggle:()=>set(!enabled),dispose(){child?.kill();void writeFile(runtimePath,JSON.stringify({enabled:false})).catch(()=>{})}};
}
