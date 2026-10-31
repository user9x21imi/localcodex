import { recoverLoop, executionRules } from './lib/loop-guard.ts';
import {persistentRules, recoverServiceSummaries, requestPolicy, buildCompaction} from './lib/conversation-policy.ts';
import {compactToolText} from './lib/tool-output.ts';
import {webSearch} from './lib/web-search.ts';
import {urls,responseText,responseIssues,guardInstruction,fallbackResponse} from './lib/response-guard.ts';
import {redactSecrets} from './lib/redact.ts';
import {SafetyGate} from './lib/safety-gate.ts';
import {domain,differentSites,blockedDomain} from './lib/search-diversity.ts';
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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
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
    const safety=new SafetyGate(root,process.env.LOCALCODEX_MODE==='MaxPower'?{calls:40,models:24,ms:300000}:process.env.LOCALCODEX_MODE==='Fast'?{calls:16,models:12,ms:120000}:{calls:24,models:16,ms:180000});
    const requestBodies=new Map<string,any>();
    await mkdir(`${root}/logs`,{recursive:true});
    await ctx.session.hook('prompt',async event=>{
      await safety.begin(event.sessionID,event.prompt.text);
      const history:any=await ctx.storage.get(`search-history:${event.sessionID}`)||{proposed:[],excluded:[]};
      history.excluded=differentSites(event.prompt.text)?[...new Set([...history.excluded,...history.proposed.map(domain).filter(Boolean)])]:[];
      await ctx.storage.set(`search-history:${event.sessionID}`,history);
      await ctx.storage.set(`latest-task:${event.sessionID}`,redactSecrets(event.prompt.text.slice(0,16000)));
      await ctx.storage.set(`compacted:${event.sessionID}`,false);
      await ctx.storage.set(`web-failures:${event.sessionID}`,{});
      await ctx.storage.set(`web-progress:${event.sessionID}`,{searches:0,calls:0,fetches:0,sources:[],evidence:[]});
      await ctx.storage.set(`tool-progress:${event.sessionID}`,[]);
    });

    await ctx.tool.transform(editor=>{
      editor.update('websearch',tool=>{
        tool.output=undefined;
        tool.execute=async(input:any,context)=>{
          await ctx.permission.assert({sessionID:context.sessionID,agent:context.agent,source:{type:'tool',messageID:context.messageID,id:context.id},action:'websearch',resources:['*']});
          const history:any=await ctx.storage.get(`search-history:${context.sessionID}`);
          return {content:await webSearch(input.query,context.signal,history?.excluded||[])};
        };
      });
      editor.add({name:'powershell',options:{codemode:false},description:'Execute PowerShell 7 on this PC, verify real exit code. Native/PowerShell errors fail the tool.',input:{type:'object',properties:{script:{type:'string'},cwd:{type:'string'},timeout_ms:{type:'number'}},required:['script'],additionalProperties:false},async execute(input,context){const result=await runPowerShell(input as any,{directory:ctx.location.directory,signal:context.signal});return {content:result.output}}});
      editor.add({name:'inspect_image',options:{codemode:false},description:'Read a local screenshot with local vision. No cloud API.',input:{type:'object',properties:{path:{type:'string'},question:{type:'string'}},required:['path'],additionalProperties:false},async execute(input){const a=input as any;return {content:await describeImage(a.path,a.question)}}});
      editor.add({name:'agent_list',options:{codemode:false},description:'Discover installed Codex, Claude, Gemini and GUI agents. Presence does not prove authentication.',input:{type:'object',properties:{},additionalProperties:false},async execute(){return {content:JSON.stringify(await detectAgents())}}});
      if(process.platform==='darwin')editor.add({name:'coreml_predict',options:{codemode:false},description:'Run a local user-provided Core ML model using CPU_AND_NE policy (CPU + Apple Neural Engine; Core ML schedules operations). Not an NPU backend for GPT-OSS/MLX. Requires an existing .mlpackage/.mlmodel/.mlmodelc and JSON feature inputs.',input:{type:'object',properties:{model:{type:'string'},inputs_json:{type:'string'}},required:['model','inputs_json'],additionalProperties:false},async execute(input){const a=input as any;const output=root+'/state-v2/coreml-'+randomUUID()+'.json';const r=await promisify(execFile)(root+'/tools/mlx/bin/python',[root+'/macos/coreml-run.py','--model',a.model,'--inputs',a.inputs_json,'--output',output],{timeout:120000,maxBuffer:1024*1024});return {content:r.stdout}}});
      editor.add({name:'agent_delegate',options:{codemode:false},description:'Delegate one bounded task to an installed and allowed cloud CLI after local failure. Sends the supplied task to that provider, uses its account limits. No recursive delegation. Returned answer still needs verification.',input:{type:'object',properties:{agent:{type:'string',enum:['auto','codex','claude','gemini']},task:{type:'string'},cwd:{type:'string'}},required:['task'],additionalProperties:false},async execute(input){return {content:await delegateTask(input as any,ctx.location.directory)}}});
    });

    await ctx.tool.transform(editor=>{
      for(const name of ['powershell','inspect_image','agent_list','agent_delegate',...(process.platform==='darwin'?['coreml_predict']:[])])editor.update(name,tool=>{
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
    await ctx.tool.transform(editor=>{
      for(const {id} of editor.list())editor.update(id,tool=>{
        const execute=tool.execute;
        tool.execute=async(input,context)=>{
          const signal=await safety.before(context.sessionID,id,input);
          if(id==='webfetch'){const h:any=await ctx.storage.get(`search-history:${context.sessionID}`);if(blockedDomain((input as any)?.url,h?.excluded||[]))throw Error('Пользователь попросил другие сайты. Этот домен исключён, найди новый источник.')}
          const timeout=setTimeout(()=>void safety.trip('Инструмент не завершился за 90 секунд: '+id),90000);timeout.unref?.();
          try{return await execute(input,{...context,signal:AbortSignal.any([context.signal,signal])})}finally{clearTimeout(timeout)};
        };
      });
    });
    await ctx.session.hook('context',async event=>{
      await safety.check();
      const searchHistory:any=await ctx.storage.get(`search-history:${event.sessionID}`);if(searchHistory?.excluded?.length)event.system.push({type:'text',text:'Пользователь запросил другие сайты. Исключены ранее предложенные домены: '+searchHistory.excluded.join(', ')+'. Не цитируй и не открывай их, ищи новые источники. Если новых нет, честно скажи об этом.'});
      const messages=event.messages as any[]; const recovered=recoverLoop(messages); const summaries=recoverServiceSummaries(messages); event.system.push({type:'text',text:await persistentRules(root)+'\n'+executionRules+((recovered||summaries)?' История содержит повторение или служебную сводку. Продолжи последнюю просьбу пользователя; не считай её выполненной по старому статусу.':' ')});
      const webFailures:any=await ctx.storage.get(`web-failures:${event.sessionID}`)||{};
      for(const [tool,count] of Object.entries(webFailures)){if(Number(count)>=2){delete event.tools[tool];event.system.push({type:'text',text:`Инструмент ${tool} уже дважды завершился ошибкой в этой задаче и временно отключён до следующего сообщения пользователя. Не повторяй его вызов. Используй другой доступный способ, например webfetch для открытого URL; если способов нет, сообщи конкретный блокер по-русски.`})}}
      const webProgress:any=await ctx.storage.get(`web-progress:${event.sessionID}`);
      if(webProgress?.searches>=2){delete event.tools.websearch;event.system.push({type:'text',text:'Два поиска уже дали результаты. Теперь открой подходящий первоисточник инструментом webfetch и ответь по проверенным данным. Повторный поиск станет доступен после чтения страницы. Не заменяй чтение страницы ещё одним поисковым запросом.'})}
      const originalTask=await ctx.storage.get(`latest-task:${event.sessionID}`);
      const webLimit=process.env.LOCALCODEX_MODE==='MaxPower'||/\[MODE:MAX\]/i.test(String(originalTask))?24:process.env.LOCALCODEX_MODE==='Fast'?6:10;
      if(webProgress?.calls>=webLimit){delete event.tools.websearch;delete event.tools.webfetch;event.system.push({type:'text',text:'Бюджет веб-проверок этого хода исчерпан. Прекрати поиск, дай содержательный ответ по уже полученным первоисточникам и прямо перечисли, что не подтверждено. Не придумывай недостающие данные. Не задавай необязательный вопрос и не отвечай одной фразой «Понял». Дополнительный поиск можно продолжить после следующего сообщения пользователя.'})}
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
    await ctx.session.hook('compaction',async event=>{
      await ctx.storage.set(`compacted:${event.sessionID}`,true);
      const task=await ctx.storage.get(`latest-task:${event.sessionID}`);
      const progress:any=await ctx.storage.get(`tool-progress:${event.sessionID}`)||[];
      const web:any=await ctx.storage.get(`web-progress:${event.sessionID}`);
      event.result={summary:buildCompaction(String(task||''),event.messages as any[],progress,web?.evidence||[]),metadata:{method:'russian-factual-checkpoint',version:1}};
    });
    await ctx.session.hook('http.request',async event=>{
      if(event.model.providerID!=='local'||event.request.method!=='POST')return;
      const safetySignal=event.kind==='primary'?await safety.before(event.sessionID):undefined;
      const body:any=await event.request.clone().json();
      const profile:any=await ctx.storage.get(`workload:${event.sessionID}`);
      requestPolicy(body,event.kind,await persistentRules(root),Number(process.env.LOCALCODEX_OUTPUT_LIMIT||12288),profile);
      if(event.kind==='primary'&&await ctx.storage.get(`compacted:${event.sessionID}`)){
        const task=await ctx.storage.get(`latest-task:${event.sessionID}`);
        if(typeof task==='string'&&task)body.messages.push({role:'user',content:'Напоминание после сжатия истории. Последняя реальная просьба пользователя приведена ниже. Продолжи её выполнение. Если проверенный результат уже получен, дай содержательный ответ по-русски; не повторяй выполненные действия. Не заменяй ответ сводкой, «Понял» или «Что дальше?».\n<последняя_просьба>\n'+compactToolText(task,3000)+'\n</последняя_просьба>'});
      }
      await appendFile(`${root}/logs/request-policy-v2.jsonl`,JSON.stringify({time:new Date().toISOString(),session:event.sessionID,kind:event.kind,messages:body.messages?.length,maxTokens:body.max_tokens,effort:body.reasoning_effort,russianPolicy:true})+'\n');
      if(process.env.LOCALCODEX_BACKEND==='mlx'){body.model='default_model';body.chat_template_kwargs={...body.chat_template_kwargs,reasoning_effort:body.reasoning_effort};delete body.reasoning_budget_tokens;}
      if(process.env.LOCALCODEX_MODEL_ARCH==='qwen35'){
        body.chat_template_kwargs={...body.chat_template_kwargs,enable_thinking:event.kind==='primary'&&profile?.effort==='high'};
        const system=body.messages.filter((m:any)=>m.role==='system'||m.role==='developer').map((m:any)=>typeof m.content==='string'?m.content:(m.content||[]).filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('\n')).join('\n\n');
        body.messages=[{role:'system',content:system},...body.messages.filter((m:any)=>m.role!=='system'&&m.role!=='developer')];
      }
      if(event.kind==='primary')requestBodies.set(event.sessionID,body);
      const headers=new Headers(event.request.headers);headers.delete('content-length');delete body.max_completion_tokens;event.request=new Request(event.request,{headers,body:JSON.stringify(body),signal:AbortSignal.any([event.request.signal,...(safetySignal?[safetySignal]:[]),AbortSignal.timeout(120000)])});
    });
    await ctx.session.hook('http.response',async event=>{
      if(event.kind!=='primary'||event.model.providerID!=='local'||!event.response.ok)return;
      const original=requestBodies.get(event.sessionID);if(!original)return;requestBodies.delete(event.sessionID);
      const progress:any=await ctx.storage.get(`web-progress:${event.sessionID}`)||{};
      const known:string[]=(progress.fetches?progress.verifiedSources:progress.sources)||[];const sse=(event.response.headers.get('content-type')||'').includes('event-stream');
      const searchHistory:any=await ctx.storage.get(`search-history:${event.sessionID}`)||{proposed:[],excluded:[]};
      const checkAnswer=(text:string)=>{const issues=responseIssues(text,known,progress.fetches||0,(progress.calls||0)>0);if(urls(text).some(u=>blockedDomain(u,searchHistory.excluded)))issues.push('Ответ снова предлагает ранее исключённые пользователем сайты. Найди другие домены.');return issues};
      let response=event.response;let raw=await response.text();let parsed=responseText(raw);
      for(let attempt=0;attempt<2&&parsed.parsed&&!parsed.tool;attempt++){
        const issues=checkAnswer(parsed.text);if(parsed.truncated)issues.push('Предыдущий ответ обрезан лимитом контекста. Дай завершённый ответ в 2–6 коротких предложениях, без таблиц и листингов.');if(!issues.length)break;
        await appendFile(`${root}/logs/response-guard-v2.jsonl`,JSON.stringify({time:new Date().toISOString(),session:event.sessionID,attempt:attempt+1,language:issues.some(i=>i.includes('по-русски')),sources:issues.some(i=>i.includes('репозитории')),needsFetch:issues.some(i=>i.includes('webfetch'))})+'\n');
        const body={...original,reasoning_effort:'low',reasoning_budget_tokens:128,messages:[...original.messages,{role:'user',content:guardInstruction(issues,known)}]};
        if(process.env.LOCALCODEX_BACKEND==='mlx'){body.chat_template_kwargs={...body.chat_template_kwargs,reasoning_effort:'low'};delete body.reasoning_budget_tokens;}
        if(process.env.LOCALCODEX_MODEL_ARCH==='qwen35')body.chat_template_kwargs={...body.chat_template_kwargs,enable_thinking:false};
        if(searchHistory.excluded.length&&!known.length&&body.tools?.some((t:any)=>t.function?.name==='websearch'))body.tool_choice={type:'function',function:{name:'websearch'}};
        else if((progress.fetches||0)===0&&body.tools?.some((t:any)=>t.function?.name==='webfetch'))body.tool_choice={type:'function',function:{name:'webfetch'}};
        const headers=new Headers(event.request.headers);headers.delete('content-length');
        await safety.before(event.sessionID);
        try{response=await fetch(event.request.url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.any([event.request.signal,AbortSignal.timeout(120000)])});if(!response.ok)break;raw=await response.text();parsed=responseText(raw)}catch{break}
      }
      if(parsed.parsed&&!parsed.tool&&(parsed.truncated||checkAnswer(parsed.text).length))raw=fallbackResponse(original.model,known.filter(u=>!blockedDomain(u,searchHistory.excluded)),sse);
      else if(parsed.parsed&&!parsed.tool){searchHistory.proposed=urls(parsed.text);await ctx.storage.set(`search-history:${event.sessionID}`,searchHistory)}
      const headers=new Headers(event.response.headers);headers.delete('content-length');headers.delete('content-encoding');event.response=new Response(raw,{status:event.response.status,headers});
    });
    await ctx.tool.hook('execute.after',async event=>{
      await safety.after(event.sessionID,event.status==='error');
      const raw:any=event.status==='completed'?event.result:undefined;
      const output=event.status==='error'?JSON.stringify(event.error):typeof raw?.content==='string'?raw.content:Array.isArray(raw?.content)?raw.content.filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('\n'):'';
      const progress:any=await ctx.storage.get(`tool-progress:${event.sessionID}`)||[];
      progress.push(redactSecrets(event.tool+' · '+(event.status==='completed'?'инструмент завершён':'ошибка')+'\nАргументы: '+compactToolText(JSON.stringify(event.input)||'',500)+'\nРезультат: '+compactToolText(output||'',1000)));
      await ctx.storage.set(`tool-progress:${event.sessionID}`,progress.slice(-4));
      if(/^web(search|fetch)$/.test(event.tool)){
        const progress:any=await ctx.storage.get(`web-progress:${event.sessionID}`)||{searches:0,calls:0,evidence:[]};progress.calls=(progress.calls||0)+1;await ctx.storage.set(`web-progress:${event.sessionID}`,progress);
      }
      if(event.status==='error'&&(event.tool==='websearch'||event.tool==='webfetch'&&/cancel|timeout|abort|network|ENOTFOUND|ECONN/i.test(String(event.error)))){
        const failures:any=await ctx.storage.get(`web-failures:${event.sessionID}`)||{};failures[event.tool]=(failures[event.tool]||0)+1;await ctx.storage.set(`web-failures:${event.sessionID}`,failures);
      }
      if(event.status!=='completed')return;
      const result:any=event.result;
      if(Array.isArray(result.content)){const parts=[...result.content];await convertMedia(parts);event.result={...result,content:parts}}
      const limit=/Snapshot/.test(event.tool)?20000:/web(fetch|search)/i.test(event.tool)?5000:16000;
      const current:any=event.result;
      const full=typeof current.content==='string'?current.content:Array.isArray(current.content)?current.content.filter((p:any)=>p.type==='text').map((p:any)=>p.text||'').join('\n'):'';
      if(/^web(search|fetch)$/.test(event.tool)){
        const progress:any=await ctx.storage.get(`web-progress:${event.sessionID}`)||{searches:0,calls:0,evidence:[]};
        progress.searches=event.tool==='websearch'?progress.searches+1:0;
        const a=event.input as any;
        progress.fetches=(progress.fetches||0)+(event.tool==='webfetch'?1:0);
        progress.sources=[...new Set([...(progress.sources||[]),...(event.tool==='webfetch'?[a.url]:[]),...urls(full)])].slice(-32);
        if(event.tool==='webfetch')progress.verifiedSources=[...new Set([...(progress.verifiedSources||[]),a.url,...urls(full)])].slice(-48);
        const sources=event.tool==='websearch'?full.split(/(?=Title:)/).slice(0,5).map((s:string)=>s.slice(0,650)).join('\n'):compactToolText(full,2200);
        progress.evidence.push(event.tool+' '+(a.url||a.query||'')+'\n'+sources);progress.evidence=progress.evidence.slice(-2);
        await ctx.storage.set(`web-progress:${event.sessionID}`,progress);
      }
      const compact=compactToolText(full,limit);
      if(compact!==full){
        const path=`${root}/logs/tool-${event.id.replace(/[^\w-]/g,'_')}.txt`;await import('node:fs/promises').then(fs=>fs.writeFile(path,full));
        const text=compact+`\n[Полный вывод: ${path}]`;
        event.result={...current,content:typeof current.content==='string'?text:[...(current.content||[]).filter((p:any)=>p.type!=='text'),{type:'text',text}]};
      }
    });
    await ctx.session.hook('retry',event=>{if(event.attempt>=3)event.decision={retry:false}});
    const events=new AbortController();void(async()=>{try{for await(const event of ctx.event.subscribe({signal:events.signal})){if(/session.execution.(succeeded|failed|interrupted)/.test(event.type)){const data:any=event.data;safety.finish(data?.sessionID||'');await setStatus({phase:'idle',result:event.type.endsWith('interrupted')?'cancelled':event.type.split('.').at(-1)})}}}catch{}})();
    await ctx.session.hook('title',event=>{event.result='LocalCodex'});
    await appendFile(`${root}/logs/plugin-v2.jsonl`,JSON.stringify({time:new Date().toISOString(),version:ctx.app.version,loaded:true})+'\n');
    return ()=>{safety.dispose();clearInterval(statusTimer);events.abort();windows.dispose();void setStatus({phase:'idle'})};
  }
});










