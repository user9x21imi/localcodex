import {filterSearchResults} from './search-diversity.ts';
// Official anonymous MCP transport: https://exa.ai/mcp . Queries leave this PC.
export function parseMcpReply(text:string){
 try{return JSON.parse(text)}catch{}
 const replies=text.split(/\r?\n\r?\n/).map(block=>block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n')).filter(Boolean);
 for(const value of replies){try{const reply=JSON.parse(value);if(reply.result||reply.error)return reply}catch{}}
 throw new Error('Поиск Exa вернул неподдерживаемый ответ MCP.');
}
export async function webSearch(query:string,signal?:AbortSignal,excluded:string[]=[]){
 query+=' '+excluded.map(d=>'-site:'+d).join(' ');
 const response=await fetch('https://mcp.exa.ai/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'web_search_exa',arguments:{query,numResults:5,objective:'Найти первоисточники, соответствующие запросу пользователя. Сохранить точные URL и проверяемые сведения; исключить вымышленные ссылки и нерелевантные страницы.'}}})});
 if(!response.ok)throw new Error('Поиск Exa недоступен: HTTP '+response.status);
 const reply=parseMcpReply(await response.text());
 if(reply.error||reply.result?.isError)throw new Error('Ошибка поиска Exa: '+JSON.stringify(reply.error||reply.result.content).slice(0,1200));
 const text=(reply.result?.content||[]).filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('\n');
 if(!text.trim())throw new Error('Поиск Exa не вернул результатов.');
 return filterSearchResults(text,excluded)||'Новых источников вне исключённых доменов не найдено. Не предлагай прежние сайты и не выдумывай новые ссылки.';
}
