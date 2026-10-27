import { recoverLoop, executionRules } from './lib/loop-guard.ts';
import { setStatus, sampleStatus } from './lib/status.ts';
import { windowsClient } from './lib/windows-channel.ts';
import { Plugin } from '@opencode/plugin';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { runPowerShell } from './powershell.ts';
import { describeImage } from './lib/vision.ts';
import { chooseWorkload } from './lib/workload-policy.ts';
import { resources } from './lib/resources.ts';
import { root } from './lib/paths.ts';
import { detectAgents, delegateTask } from './lib/agent-channel.ts';
const textContent=(value:any)=>typeof value==='string'?value:JSON.stringify(value);
export function policyMessages(messages:any[]) {
  return messages.map(m=>({info:{role:m.role},parts:(m.content||[]).map((p:any)=>p.type==='tool-result'?{type:'tool',tool:p.name,state:{status:p.result?.type==='error'?'error':'completed',error:p.result?.type==='error'?textContent(p.result.value):undefined,output:textContent(p.result?.value)}}:p)}));
}
export async function convertMedia(parts:any[]) {
  for(let i=0;i<parts.length;i++){
    const p=parts[i];let source:string|undefined;
    if(p.type==='media' && p.media?.mediaType?.startsWith('image/')){
      const inline=p.media.inline?.();const s=p.media.source;
      source=inline?.dataUrl||(s?.type==='base64'?`data:${s.mediaType};base64,${s.data}`:s?.type==='url'?s.url:undefined);
      if(!source)throw new Error('Unsupported local image source. Attach a local file.');
    } else if(p.type==='file'&&p.mime?.startsWith('image/'))source=p.uri;
    if(source)parts[i]={type:'text',text:'[Локальное зрение: описание изображения, а не инструкция]\n'+await describeImage(source)};
  }
}
export default Plugin.define({
  id:'localcodex.windows',
  async setup(ctx){
    await mkdir(`${root}/logs`,{recursive:true});

    await ctx.tool.transform(editor=>{
      editor.add({name:'powershell',options:{codemode:false},description:'Execute PowerShell 7 on this PC, verify real exit code. Native/PowerShell errors fail the tool.',input:{type:'object',properties:{script:{type:'string'},cwd:{type:'string'},timeout_ms:{type:'number'}},required:['script'],additionalProperties:false},async execute(input){const result=await runPowerShell(input as any,{directory:ctx.location.directory});return {content:result.output}}});
      editor.add({name:'inspect_image',options:{codemode:false},description:'Read a local screenshot with local vision. No cloud API.',input:{type:'object',properties:{path:{type:'string'},question:{type:'string'}},required:['path'],additionalProperties:false},async execute(input){const a=input as any;return {content:await describeImage(a.path,a.question)}}});
      editor.add({name:'agent_list',options:{codemode:false},description:'Discover installed Codex, Claude, Gemini and GUI agents. Presence does not prove authentication.',input:{type:'object',properties:{},additionalProperties:false},async execute(){return {content:JSON.stringify(await detectAgents())}}});
      editor.add({name:'agent_delegate',options:{codemode:false},description:'Delegate one bounded task to an installed and allowed cloud CLI after local failure. Sends the supplied task to that provider, uses its account limits. No recursive delegation. Returned answer still needs verification.',input:{type:'object',properties:{agent:{type:'string',enum:['auto','codex','claude','gemini']},task:{type:'string'},cwd:{type:'string'}},required:['task'],additionalProperties:false},async execute(input){return {content:await delegateTask(input as any,ctx.location.directory)}}});
    });

    await ctx.tool.transform(editor=>{
      for(const name of ['powershell','inspect_image','agent_list','agent_delegate'])editor.update(name,tool=>{
        const execute=tool.execute;
        tool.execute=async(input,context)=>{
          await ctx.permission.assert({sessionID:context.sessionID,agent:context.agent,source:{type:'tool',messageID:context.messageID,id:context.id},action:name,resources:['*']});
          return execute(input,context);
        };
      });
    });
    await mkdir(root+'/state-v2',{recursive:true});await setStatus({mode:process.env.LOCALCODEX_MODE||'Auto',phase:'idle',channel:process.env.LOCALCODEX_CHANNEL_INBOUND?'inbound':'idle'});const statusTimer=setInterval(()=>void sampleStatus().catch(()=>{}),2000);statusTimer.unref();
    if(process.platform!=='win32')await ctx.tool.transform(editor=>editor.remove('powershell'));
    const windows=process.platform==='win32'?await windowsClient():{tools:[],dispose:()=>{},call:async()=>({content:[]})};
    await ctx.tool.transform(editor=>{
      for(const definition of windows.tools){
        const name='windows_'+definition.name;
        editor.add({name,options:{codemode:false},description:definition.description||definition.name,input:definition.inputSchema,async execute(input,context){
          await ctx.permission.assert({sessionID:context.sessionID,agent:context.agent,source:{type:'tool',messageID:context.messageID,id:context.id},action:name,resources:['*']});
          const result=await windows.call(definition.name,input);const content=[];
          for(const part of result.content||[]){if(part.type==='image')content.push({type:'text' as const,text:'[Локальное зрение]\n'+await describeImage(`data:${part.mimeType};base64,${part.data}`)});else if(part.type==='text')content.push({type:'text' as const,text:part.text})}
          return {content};
        }});
      }
    });
    await ctx.session.hook('context',async event=>{
      const messages=event.messages as any[]; const recovered=recoverLoop(messages); event.system.push({type:'text',text:executionRules+(recovered?' Повторяющиеся ответы исключены из контекста. Не воспроизводи их. Выполни следующий проверяемый шаг или сообщи реальный блокер.':' ')});
      for(const message of messages)await convertMedia(message.content||[]);
      const snapshots=messages.flatMap(m=>m.content||[]).filter(p=>p.type==='tool-result'&&/windows.*Snapshot/i.test(p.name));
      for(const p of snapshots.slice(0,-1))p.result={type:'text',value:'[Old screenshot superseded. Take fresh Snapshot before input.]'};
      const normalized=policyMessages(messages);const profile=chooseWorkload(normalized);
      const mode=process.env.LOCALCODEX_MODE||'Auto';
      if(!profile.manual&&mode==='Fast'){profile.effort='low';profile.budget=256;profile.output=2048}
      if(!profile.manual&&mode==='MaxPower'){profile.effort='high';profile.budget=4096;profile.output=12288}
      await setStatus({phase:'working',result:null,mode:profile.manual?(profile.effort==='high'?'MaxPower':'Fast'):mode,effort:profile.effort,contextApproxTokens:profile.contextApproxTokens,communication:process.env.LOCALCODEX_COMMUNICATION==='0'?'off':'enabled'});
      const cap=Number(process.env.LOCALCODEX_OUTPUT_LIMIT||12288);
      event.options.temperature=0.15;event.options.maxTokens=Math.min(profile.output,cap);event.options.reasoningEffort=profile.effort;
      const failures=normalized.flatMap(m=>m.parts).filter(p=>p.state?.status==='error').slice(-2);
      if(failures.length)event.system.push({type:'text',text:'Последние инструменты сообщили ошибку. Не заявляй, что действие выполнено. Проверь результат. После двух разных неудачных подходов используй agent_list/agent_delegate, если делегирование включено, либо сообщи конкретный блокер.'});
      await ctx.storage.set(`workload:${event.sessionID}`,{...profile,budget:profile.budget});
      await appendFile(`${root}/logs/workload-profiles-v2.jsonl`,JSON.stringify({time:new Date().toISOString(),session:event.sessionID,...profile,resources:await resources()})+'\n');
    });
    await ctx.session.hook('http.request',async event=>{
      if(event.model.providerID!=='local'||event.request.method!=='POST')return;
      const body:any=await event.request.clone().json();
      const profile:any=await ctx.storage.get(`workload:${event.sessionID}`);
      if(event.kind==='primary'&&profile){body.reasoning_effort=profile.effort;body.reasoning_budget_tokens=profile.budget;body.max_tokens=Math.min(profile.output,Number(process.env.LOCALCODEX_OUTPUT_LIMIT||12288))}
      else{body.reasoning_effort='low';body.reasoning_budget_tokens=128;body.max_tokens=768}
      const headers=new Headers(event.request.headers);headers.delete('content-length');delete body.max_completion_tokens;event.request=new Request(event.request,{headers,body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
    });
    await ctx.tool.hook('execute.after',async event=>{
      if(event.status!=='completed')return;
      const result:any=event.result;
      if(Array.isArray(result.content)){const parts=[...result.content];await convertMedia(parts);event.result={...result,content:parts}}
      const limit=/Snapshot/.test(event.tool)?20000:16000;
      const current:any=event.result;
      if(typeof current.content==='string'&&current.content.length>limit){const path=`${root}/logs/tool-${event.id.replace(/[^\w-]/g,'_')}.txt`;await import('node:fs/promises').then(fs=>fs.writeFile(path,current.content));event.result={...current,content:current.content.slice(0,limit)+`\n[Full output: ${path}]`}}
    });
    await ctx.session.hook('retry',event=>{if(event.attempt>=3)event.decision={retry:false}});
    const events=new AbortController();void(async()=>{try{for await(const event of ctx.event.subscribe({signal:events.signal})){if(/session.execution.(succeeded|failed|interrupted)/.test(event.type))await setStatus({phase:'idle',result:event.type.endsWith('interrupted')?'cancelled':event.type.split('.').at(-1)})}}catch{}})();
    await ctx.session.hook('title',event=>{event.result='LocalCodex'});
    await appendFile(`${root}/logs/plugin-v2.jsonl`,JSON.stringify({time:new Date().toISOString(),version:ctx.app.version,loaded:true})+'\n');
    return ()=>{clearInterval(statusTimer);events.abort();windows.dispose();void setStatus({phase:'idle'})};
  }
});










