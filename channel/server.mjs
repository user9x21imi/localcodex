import http from 'node:http';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomBytes,randomUUID,timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(process.argv[2]||process.env.LOCALCODEX_ROOT||process.cwd());
const state=path.join(root,'state-v2');await mkdir(state,{recursive:true});
const tokenFile=path.join(root,'config-v2','channel-token');let token;
try{token=(await readFile(tokenFile,'utf8')).trim()}catch{token=randomBytes(32).toString('hex');await writeFile(tokenFile,token,{mode:0o600})}
const jobs=new Map();let active=false;const queue=[];
async function status(update){let old={};try{old=JSON.parse(await readFile(path.join(state,'status.json'),'utf8'))}catch{};await writeFile(path.join(state,'status.json'),JSON.stringify({...old,...update,time:new Date().toISOString()}))}
function run(){if(active||!queue.length)return;active=true;const job=queue.shift();job.status='running';void status({channel:'inbound',peer:job.peer});
const child=spawn(process.platform==='win32'?(process.env.LOCALCODEX_PWSH||'pwsh.exe'):path.join(root,'localcodex'),process.platform==='win32'?['-NoLogo','-NoProfile','-File',path.join(root,'agent-v2.ps1'),'-Task',job.task]:[job.task],{cwd:job.cwd||root,windowsHide:true,env:{...process.env,LOCALCODEX_CHANNEL_INBOUND:'1',LOCALCODEX_DELEGATION_DEPTH:'1'},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>{if(process.platform==='win32'){spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true})}else child.kill('SIGTERM')},600000);child.stdout.on('data',b=>{output=(output+b.toString('utf8')).slice(-1000000)});child.stderr.on('data',b=>{output=(output+b.toString('utf8')).slice(-1000000)});
let finished=false;const finish=(error,code)=>{if(finished)return;finished=true;clearTimeout(timer);job.status=error||code!==0?'failed':'completed';job.output=error?String(error):output;job.exitCode=code;active=false;void status({channel:'idle',lastDirection:'inbound',peer:job.peer});run()};child.on('error',e=>finish(e,-1));child.on('close',code=>finish(null,code));}
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
const server=http.createServer(async(req,res)=>{try{
 let enabled=false;try{enabled=JSON.parse(await readFile(path.join(root,'config-v2','communication-runtime.json'),'utf8')).enabled===true}catch{}
 if(req.method==='GET'&&req.url==='/health')return json(res,200,{name:'LocalCodex',version:'0.2.0',channel:'loopback',enabled});
 const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));const secret=Buffer.from(token);if(supplied.length!==secret.length||!timingSafeEqual(supplied,secret))return json(res,401,{error:'Local bearer token required'});
 if(!enabled&&req.method==='POST')return json(res,403,{error:'Agent communication disabled. Enable /agent communication in LocalCodex.'});
 if(req.method==='GET'&&req.url==='/status'){let s={};try{s=JSON.parse(await readFile(path.join(state,'status.json'),'utf8'))}catch{};return json(res,200,s)}
 if(req.method==='GET'&&req.url?.startsWith('/tasks/')){const job=jobs.get(req.url.slice(7));return json(res,job?200:404,job?{id:job.id,status:job.status,output:job.output,exitCode:job.exitCode}:{error:'Unknown job'})}
 if(req.method==='POST'&&req.url==='/tasks'){let body='';for await(const chunk of req){body+=chunk;if(body.length>32768)return json(res,413,{error:'Task exceeds 32KB'})}const data=JSON.parse(body);if(typeof data.task!=='string'||!data.task.trim())return json(res,400,{error:'task required'});if(queue.length>=2)return json(res,429,{error:'Local queue full'});const job={id:randomUUID(),task:data.task,peer:String(data.peer||'local-agent').slice(0,80),cwd:root,status:'queued'};jobs.set(job.id,job);if(jobs.size>100){for(const[id,old]of jobs)if(old.status==='completed'||old.status==='failed'){jobs.delete(id);break}}queue.push(job);run();return json(res,202,{id:job.id,status:job.status})}
 json(res,404,{error:'Unknown endpoint'});
}catch(error){json(res,400,{error:String(error)})}});
server.requestTimeout=30000;server.headersTimeout=10000;server.on('error',e=>{console.error(e.message);process.exitCode=1});
server.listen(8099,'127.0.0.1',async()=>{await writeFile(path.join(state,'agent-discovery.json'),JSON.stringify({name:'LocalCodex',url:'http://127.0.0.1:8099',auth:'bearer-local-file',tokenFile,capabilities:['local-code','files','vision',...(process.platform==='win32'?['windows-computer-use']:[])],mcp:path.join(root,'channel','mcp.mjs')}));console.log('LocalCodex discovery channel: 127.0.0.1:8099')});


