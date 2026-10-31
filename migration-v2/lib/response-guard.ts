export function urls(text:string){return [...new Set((text.match(/https?:\/\/[^\s<>"'`\])}]+/g)||[]).map(u=>u.replace(/[.,;:]+$/,'')))];}
export function repository(url:string){try{const u=new URL(url);const p=u.pathname.split('/').filter(Boolean);if(!['github.com','raw.githubusercontent.com'].includes(u.hostname)||p.length<2)return '';return (p[0]+'/'+p[1]).toLowerCase().replace(/\.git$/,'')}catch{return ''}}
export function responseText(raw:string){
 let text='',tool=false,parsed=false,truncated=false;
 const values=raw.trim().startsWith('{')?[raw]:raw.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim());
 for(const value of values){if(value==='[DONE]')continue;try{const j=JSON.parse(value);for(const c of j.choices||[]){parsed=true;truncated ||= c.finish_reason==='length';const d=c.delta||c.message||{};if(typeof d.content==='string')text+=d.content;if(d.tool_calls?.length||d.function_call)tool=true}}catch{}}
 return {text,tool,parsed,truncated};
}
export function responseIssues(text:string,known:string[],fetches:number,webTask=known.length>0){
 const issues:string[]=[];const prose=text.replace(/```[\s\S]*?```/g,'').replace(/https?:\/\/\S+/g,'');
 if(!text.trim())issues.push('Модель вернула пустой ответ. Дай содержательный краткий ответ по задаче.');
 if((prose.match(/[А-Яа-яЁё]/g)||[]).length<8&&(prose.match(/[A-Za-z]/g)||[]).length>70)issues.push('Ответ написан не по-русски.');
 const cited=urls(text);const repos=new Set(known.map(repository).filter(Boolean));
 const invented=cited.filter(u=>repository(u)&&!repos.has(repository(u)));
 if(webTask&&invented.length)issues.push('В ответе указаны репозитории, которых нет в результатах инструментов: '+invented.slice(0,3).join(', '));
 if(webTask&&cited.length&&fetches===0)issues.push('Ни один первоисточник ещё не открыт инструментом webfetch. Сначала открой найденную страницу.');
 return issues;
}
export function guardInstruction(issues:string[],known:string[]){return 'Проверка ответа отклонила предыдущий вариант. '+issues.join(' ')+' Ответь по существу по-русски. Не выдумывай названия и URL. Используй только сведения из реально полученных источников; если данных не хватает, честно укажи это. Не цитируй README целиком. Проверенные/найденные адреса инструментов (результат поиска ещё требует чтения):\n'+known.slice(-8).join('\n');}
export function fallbackResponse(model:string,known:string[],sse:boolean){
 const content='Не удалось получить ответ, прошедший проверку языка и источников. Подтверждения для предложенных ссылок недостаточно.\n\nАдреса, полученные инструментами (их содержимое ещё нужно проверить):\n'+known.slice(-4).join('\n');
 const id='localcodex-response-guard';
 if(!sse)return JSON.stringify({id,object:'chat.completion',model,choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}]});
 return 'data: '+JSON.stringify({id,object:'chat.completion.chunk',model,choices:[{index:0,delta:{role:'assistant',content},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({id,object:'chat.completion.chunk',model,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
}
