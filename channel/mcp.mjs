import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]||process.env.LOCALCODEX_ROOT||process.cwd());
async function call(route,body){const token=(await readFile(path.join(root,'config-v2','channel-token'),'utf8')).trim();const r=await fetch('http://127.0.0.1:8099'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`LocalCodex HTTP ${r.status}`);return r.json()}
const tools=[{name:'localcodex_status',description:'LocalCodex is a local assistant on this computer. Check current mode, GPU and communication status.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'localcodex_ask',description:'Send a bounded task to LocalCodex running on this PC. Requires user-enabled channel. Returns a job ID; poll with localcodex_result. No recursive delegation.',inputSchema:{type:'object',properties:{task:{type:'string'}},required:['task'],additionalProperties:false}},{name:'localcodex_result',description:'Read a delegated LocalCodex job result by ID.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}}];
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
createInterface({input:process.stdin}).on('line',async line=>{let message;try{message=JSON.parse(line);if(message.id===undefined)return;let result;
if(message.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'localcodex-channel',version:'0.2.0'}};
else if(message.method==='tools/list')result={tools};
else if(message.method==='tools/call'){const a=message.params.arguments||{};let value;if(message.params.name==='localcodex_status')value=await call('/status');else if(message.params.name==='localcodex_ask'){if(Number(process.env.LOCALCODEX_DELEGATION_DEPTH||0)>0)throw new Error('Recursive delegation blocked');value=await call('/tasks',{task:a.task,peer:'mcp-agent'})}else if(message.params.name==='localcodex_result')value=await call('/tasks/'+encodeURIComponent(a.id));else throw new Error('Unknown tool');result={content:[{type:'text',text:JSON.stringify(value)}]}}
else if(message.method==='ping')result={};else throw new Error('Unsupported method');send({jsonrpc:'2.0',id:message.id,result})
}catch(error){if(message?.id!==undefined)send({jsonrpc:'2.0',id:message.id,error:{code:-32000,message:String(error)}})}});
