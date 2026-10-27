import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { root } from './paths.ts';
export async function windowsClient(){
  const child=spawn(`${root}/tools/windows-mcp/Scripts/python.exe`,['-m','windows_mcp','serve','--tools','Snapshot,Screenshot,App,Click,Type,Scroll,Shortcut,Move,Drag,Wait,WaitFor,Clipboard,ControlStatus'],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',WINDOWS_MCP_DISABLE_FLASH:'1',ANONYMIZED_TELEMETRY:'false',WINDOWS_MCP_SCREENSHOT_BACKEND:'mss'},stdio:['pipe','pipe','pipe']});
  let id=0;let failure:Error|undefined;const pending=new Map<number,any>();
  const fail=(error:Error)=>{failure=error;for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}pending.clear()};
  child.on('error',fail);child.on('close',code=>fail(new Error(`Windows MCP exited: ${code}`)));child.stderr.on('data',()=>{});child.stdin.on('error',fail);
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{try{const r=JSON.parse(line);const p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(new Error(JSON.stringify(r.error))):p.resolve(r.result)}catch{}});
  const send=(data:any)=>child.stdin.write(JSON.stringify(data)+'\n');
  const call=(method:string,params:any={})=>new Promise<any>((resolve,reject)=>{if(failure){reject(failure);return}const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error(`Windows MCP timeout: ${method}`))},120000);pending.set(n,{resolve,reject,timer});send({jsonrpc:'2.0',id:n,method,params})});
  try{
    await call('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'localcodex-windows',version:'0.1.0'}});
    send({jsonrpc:'2.0',method:'notifications/initialized'});
    const catalog=await call('tools/list');
    return {tools:catalog.tools,call:async(name:string,args:any)=>{const result=await call('tools/call',{name,arguments:args});if(result.isError)throw new Error(JSON.stringify(result.content));return result},dispose:()=>{lines.close();child.kill()}};
  }catch(error){lines.close();child.kill();throw error}
}
