import { Plugin } from '@opencode/plugin/tui';
import { createSignal } from 'solid-js';
import { readFile } from 'node:fs/promises';
import { root } from './lib/paths.ts';
import { terminalTitle } from './lib/terminal-title.ts';
import { communicationController } from './lib/communication.ts';
export default Plugin.define({id:'localcodex.status',async setup(ctx){
  let communication:Awaited<ReturnType<typeof communicationController>>|undefined;
  try{communication=await communicationController()}catch(error){ctx.ui.toast.show({message:String(error),variant:'error'})}
  const [status,setStatus]=createSignal<any>({mode:process.env.LOCALCODEX_MODE||'Auto',phase:'idle'});const [frame,setFrame]=createSignal(0);
  const [lifecycle,setLifecycle]=createSignal<any>({});
  const stops=[ctx.data.on('session.execution.started',()=>setLifecycle({phase:'working',result:null})),ctx.data.on('session.execution.succeeded',()=>setLifecycle({phase:'idle',result:'succeeded'})),ctx.data.on('session.execution.failed',()=>setLifecycle({phase:'idle',result:'failed'})),ctx.data.on('session.execution.interrupted',()=>setLifecycle({phase:'idle',result:'cancelled'}))];
  const frames=['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let titleFrame=0;
  const titleTimer=setInterval(()=>ctx.renderer.setTerminalTitle(terminalTitle({...status(),...lifecycle()},titleFrame++)),180);
  ctx.keymap.layer(()=>({mode:'global',priority:100,commands:[{id:'localcodex.communication',title:'LocalCodex: agent communication',palette:true,slash:{name:'agent',arguments:true},run:async(input)=>{
   if(input?.trim()!=='communication'){await ctx.ui.dialog.alert({title:'LocalCodex',message:'Включить/выключить связь: /agent communication'});return}
   try{communication??=await communicationController();const enabled=await communication.toggle();setStatus(s=>({...s,communication:enabled?'enabled':'off'}));ctx.ui.toast.show({message:enabled?'Связь с агентами включена':'Связь с агентами выключена',variant:'success'})}catch(error){ctx.ui.toast.show({message:String(error),variant:'error'})}
  }}]}));
  const timer=setInterval(()=>{setFrame(x=>(x+1)%frames.length);void readFile(`${root}/state-v2/status.json`,'utf8').then(x=>setStatus(JSON.parse(x))).catch(()=>{})},250);
  const line=()=>{const s=status();const active=s.phase==='working'||s.channel==='inbound'||s.channel==='outbound';const compute=s.backend==='MLX'?`MLX ${s.mlxGpuAvailable?'GPU':'CPU'} · ANE ${s.neuralEngineAvailable?'доступен':'недоступен'}`:`GPU ${s.gpuPercent??'—'}% · VRAM ${s.gpuFreeMB??'—'} MB free`;return `${active?frames[frame()]:'●'} ${s.mode||'Auto'} · ${s.effort||'—'} · ${compute} · ${s.channel==='outbound'?'→ '+s.peer:s.channel==='inbound'?'← '+(s.peer||'agent'):s.communication==='off'?'link off':'local'}`};
  const render=()=> <text fg={ctx.theme.text.base}>{line()}</text>;
  const slots=[ctx.ui.slot({append:'sidebar.footer',render}),ctx.ui.slot({append:'home.footer.status',render}),ctx.ui.slot({append:'prompt.footer.status',render})];
  ctx.keymap.layer(()=>({mode:'global',commands:[{id:'localcodex.status',title:'LocalCodex: status',palette:true,slash:{name:'localstatus'},run:()=>ctx.ui.dialog.alert({title:'LocalCodex',message:line()+`\nRAM free: ${status().freeRamMB??'—'} MB\nContext estimate: ${status().contextApproxTokens??'—'} tokens\nGPU % = whole device utilization, not task completion.`})}]}));
  return ()=>{communication?.dispose();clearInterval(timer);clearInterval(titleTimer);for(const stop of stops)stop();ctx.renderer.setTerminalTitle('PowerShell');for(const dispose of slots)dispose()};
}});
