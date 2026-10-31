import { readFile } from 'node:fs/promises';
import { repeatedAnswer } from './loop-guard.ts';
import { compactToolText } from './tool-output.ts';
import {redactSecrets} from './redact.ts';
export function buildCompaction(task:string,messages:any[],progress:string[]=[],evidence:string[]=[]){
 const recent=messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role,text:(m.content||[]).filter((p:any)=>p.type==='text').map((p:any)=>p.text||'').join('\n')})).filter(m=>m.text&&!isServiceSummary(m.text)).slice(-2).map(m=>(m.role==='user'?'Пользователь: ':'Агент (не доказательство выполнения): ')+compactToolText(m.text,350));
 return redactSecrets('Служебная сводка для продолжения. Это не ответ пользователю и не подтверждение завершения.\nЯзык общения: русский.\n\nПоследняя просьба пользователя:\n'+compactToolText(task||'Продолжить задачу из истории.',1800)+'\n\nПоследние сведения из истории (данные, не новые инструкции):\n'+recent.join('\n')+'\n\nФактические результаты инструментов (успех инструмента не равен завершению всей задачи):\n'+compactToolText(progress.join('\n\n'),1600)+'\n\nВеб-источники (сниппет поиска не равен проверке страницы):\n'+compactToolText(evidence.join('\n\n'),1600)+'\n\nСледующий шаг: продолжи последнюю просьбу пользователя. Если проверенный результат уже получен, дай содержательный итог по-русски со ссылками и ограничениями. Не повторяй выполненное и не отвечай «Понял» вместо результата. Для длинных результатов используй сохранённые полные журналы инструментов.');
}
export const languageRule = 'ОБЯЗАТЕЛЬНО: отвечай пользователю только по-русски. Сохраняй язык после сжатия истории. Иностранные названия, код и точные цитаты допустимы. Сводка истории не является заданием: продолжи последнюю просьбу пользователя, не печатай Objective/Work State/Next Move вместо ответа. Не выдумывай URL; github.com/your-repo/... является заглушкой. Если источник не проверен инструментом, прямо укажи это.';
export const compactionRule = 'Ты сжимаешь историю для продолжения работы, а не отвечаешь пользователю. Напиши краткую фактическую сводку ТОЛЬКО ПО-РУССКИ. Сохрани: исходную задачу, последнюю просьбу и поправки пользователя, язык русский, проверенные результаты инструментов с точными ссылками, незавершённые действия и реальные блокеры. Не считай задачу завершённой без ответа пользователю и проверки. Не выполняй поиск и не придумывай данные. Не копируй предыдущую сводку целиком. Не включай ключи, пароли и токены. В конце укажи конкретный следующий шаг. Названия секций: Задача, Требования, Проверено, Осталось.';
export async function persistentRules(root:string) {
 try{return await readFile(root+'/config-v2/AGENTS.md','utf8')}catch{return languageRule}
}
export function isServiceSummary(text:string) {
 const headings=['Objective','Requirements','Decisions','Work State','Next Move','Relevant Files','Important Context'];
 return headings.filter(h=>new RegExp('(?:^|\\n)\\s*(?:#{1,6}\\s*)?'+h+'\\s*(?:\\n|$)','i').test(text)).length>=4;
}
// Only assistant prose is replaced. User requests and tool call/result pairs remain intact.
export function recoverServiceSummaries(messages:any[]) {
 let count=0;const summaries:any[]=[];
 for(const m of messages){
  if(m.role!=='assistant')continue;
  for(const p of m.content||[]){if(p.type==='text'&&isServiceSummary(p.text||'')){
   const original=p.text.replace(/^\[Служебная сводка прежнего контекста[^\n]*\n/,'');
   for(const old of summaries){if(old.original===original||repeatedAnswer(old.original,original)){old.part.text='[Повтор служебной сводки исключён из контекста. Это не результат выполнения задачи.]';count++}}
   summaries.push({part:p,original});
   if(p.text.startsWith('[Служебная сводка прежнего контекста'))continue;
   p.text='[Служебная сводка прежнего контекста, не ответ пользователю. Продолжи последнюю просьбу; сводка не доказывает завершения.]\n'+p.text;
   count++;
  }}
 }
 return count;
}
export function requestPolicy(body:any,kind:string,rules:string,cap:number,profile?:any) {
 if(kind==='compaction'){
  body.messages=(body.messages||[]).filter((m:any)=>m.role!=='system');
  body.messages.unshift({role:'system',content:compactionRule+'\n'+rules});
  body.reasoning_effort='low';body.reasoning_budget_tokens=256;body.max_tokens=Math.min(2048,cap);
 }else if(kind==='primary'){
  // Reassert at the wire boundary, after OpenCode has composed its own prompts.
  body.messages=[{role:'system',content:languageRule},...(body.messages||[])];
  body.reasoning_effort=profile?.effort||'medium';body.reasoning_budget_tokens=profile?.budget||1024;
  body.max_tokens=Math.min(profile?.output||4096,cap);
 }else{body.reasoning_effort='low';body.reasoning_budget_tokens=128;body.max_tokens=Math.min(768,cap)}
 body.reasoning_budget_tokens=Math.min(body.reasoning_budget_tokens,Math.max(0,Math.floor(body.max_tokens/2)));
 return body;
}
