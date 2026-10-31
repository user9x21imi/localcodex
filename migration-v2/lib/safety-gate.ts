import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
export const stopText=(s:string)=>/^\s*\/?(?:стоп|stop|остановись|отмена|cancel|прекрати)(?:[\s!.,]|$)/iu.test(s);
function stable(v:any):any{if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return typeof v==='string'?v.trim().replace(/\s+/g,' '):v}
export function actionKey(tool:string,input:any){
 let value=input;
 if(tool==='webfetch'&&input?.url){try{const u=new URL(input.url);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^fbclid$/i.test(k))u.searchParams.delete(k);value=u.toString().replace(/\/$/,'')}catch{value=input.url}}
 if(tool==='websearch')value=String(input?.query||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(Boolean).sort().join(' ');
 return tool+':'+createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
type Turn={calls:number;models:number;failures:number;started:number;seen:Map<string,number>;controller:AbortController;timer:ReturnType<typeof setTimeout>};
export class SafetyGate {
 turns=new Map<string,Turn>();tripping=false;
 root:string;limits:{calls:number;models:number;ms:number};stopper?:((reason:string)=>Promise<void>);
 constructor(root:string,limits={calls:24,models:16,ms:180000},stopper?:(reason:string)=>Promise<void>){this.root=root;this.limits=limits;this.stopper=stopper}
 async check(){try{if(JSON.parse(await readFile(this.root+'/config-v2/emergency-stop.json','utf8')).stopped)throw Error('Агент остановлен. Новый сеанс: uncensored -Resume')}catch(e:any){if(e.code!=='ENOENT')throw e}}
 async begin(id:string,text:string){if(stopText(text)){await this.trip('Команда пользователя: стоп');throw Error('Остановлено пользователем')}await this.check();this.turns.get(id)?.controller.abort();clearTimeout(this.turns.get(id)?.timer);const t:Turn={calls:0,models:0,failures:0,started:Date.now(),seen:new Map(),controller:new AbortController(),timer:setTimeout(()=>void this.trip('Лимит времени задачи'),this.limits.ms)};t.timer.unref?.();this.turns.set(id,t)}
 async before(id:string,tool?:string,input?:any){await this.check();let t=this.turns.get(id);if(!t){await this.begin(id,'');t=this.turns.get(id)!}
  if(t.controller.signal.aborted)throw Error('Задача остановлена');
  if(Date.now()-t.started>this.limits.ms){await this.trip('Лимит времени задачи');throw Error('Лимит времени')}
  if(tool){if(!/^(read|glob|grep|windows_(Snapshot|Screenshot|ControlStatus))$/i.test(tool)){const key=actionKey(tool,input);const n=(t.seen.get(key)||0)+1;t.seen.set(key,n);if(n>2){await this.trip('Повтор одного действия: '+tool);throw Error('Повтор действия запрещён')}}if(++t.calls>this.limits.calls){await this.trip('Лимит действий задачи');throw Error('Лимит действий')}}
  else if(++t.models>this.limits.models){await this.trip('Лимит шагов модели');throw Error('Лимит шагов модели')}
  return t.controller.signal;
 }
 async after(id:string,failed:boolean){const t=this.turns.get(id);if(!t)return;t.failures=failed?t.failures+1:0;if(t.failures>=3)await this.trip('Три ошибки инструментов подряд')}
 finish(id:string){const t=this.turns.get(id);if(t){clearTimeout(t.timer);t.controller.abort(Error('Задача завершена'))}}
 async trip(reason:string){if(this.tripping)return;this.tripping=true;await mkdir(this.root+'/config-v2',{recursive:true});await writeFile(this.root+'/config-v2/emergency-stop.json',JSON.stringify({stopped:true,reason,time:new Date().toISOString()}));await writeFile(this.root+'/config-v2/stop-request.json',JSON.stringify({nonce:Date.now()+'-'+Math.random(),reason}));for(const t of this.turns.values()){t.controller.abort(Error(reason));clearTimeout(t.timer)}if(this.stopper)await this.stopper(reason);else if(process.platform==='win32')execFile(process.env.LOCALCODEX_PWSH||'pwsh.exe',['-NoProfile','-File',this.root+'/Stop-Agent.ps1','-Root',this.root,'-Reason',reason],{windowsHide:true},()=>{});else setTimeout(()=>process.exit(130),300).unref()}
 dispose(){for(const t of this.turns.values()){clearTimeout(t.timer);t.controller.abort()}this.turns.clear()}
}
