import { setStatus } from './status.ts';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { root, pwsh } from './paths.ts';
const exec = promisify(execFile);
export async function detectAgents() {
  if(process.platform!=='win32'){
    const result=[];
    for(const name of ['codex','claude','gemini','antigravity','agy']){try{const {stdout}=await exec('/bin/zsh',['-lic','command -v '+name],{timeout:10000});const path=stdout.trim().split('\n').at(-1);if(path?.startsWith('/'))result.push({id:name,path,headless:['codex','claude','gemini'].includes(name)})}catch{}}
    return result;
  }
  const ps = `$names=@('codex','claude','gemini','antigravity','agy'); $result=@(); foreach($n in $names){$c=Get-Command $n -ErrorAction SilentlyContinue | Select-Object -First 1; if($c -and $c.Source){$result+=@{id=$n;path=$c.Source;headless=($n -in @('codex','claude','gemini'))}}}; $result | ConvertTo-Json -Compress -AsArray`;
  const {stdout}=await exec(pwsh,['-NoLogo','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{windowsHide:true,timeout:15000});
  return JSON.parse(stdout.trim()||'[]');
}
export async function delegateTask(input:{agent?:string,task:string,cwd?:string},directory:string) {
  let runtime:any;try{runtime=JSON.parse(await readFile(`${root}/config-v2/communication-runtime.json`,'utf8'))}catch{}
  if(runtime?.enabled===false||(!runtime&&process.env.LOCALCODEX_COMMUNICATION==='0'))throw new Error('Agent communication disabled. Enable it with /agent communication.');
  if(Number(process.env.LOCALCODEX_DELEGATION_DEPTH||0)>0)throw new Error('Recursive delegation is disabled.');
  const settings=JSON.parse(await readFile(`${root}/config-v2/agents.json`,'utf8'));
  if(!settings.enabled)throw new Error('External delegation disabled: enable config/agents.json. Cloud CLI uses its own account and limits.');
  const agents=await detectAgents();
  const chosen=agents.find((a:any)=>a.headless && settings.allowed.includes(a.id) && (!input.agent||input.agent==='auto'||a.id===input.agent));
  if(!chosen)throw new Error('No allowed headless CLI found. Install/login separately. GUI-only agents cannot be called as headless CLI.');
  if(!input.task.trim()||input.task.length>24000)throw new Error('Task must contain 1–24000 characters.');
  const id=randomUUID();const dir=`${root}/state/agent-channel/${id}`;await mkdir(dir,{recursive:true});
  const task=`You are handling one delegated task. Do not delegate to other agents. Return verified findings and unresolved limitations. Do not read unrelated personal files or credentials.\n${input.task}`;
  await writeFile(`${dir}/request.json`,JSON.stringify({id,agent:chosen.id,task:input.task,cwd:input.cwd||directory}));
  const cliArgs=chosen.id==='codex'?['exec','--skip-git-repo-check','--ephemeral','--sandbox','read-only','-']:chosen.id==='claude'?['-p',task,'--output-format','json']:['-p',task,'--output-format','json'];
  const payload=Buffer.from(JSON.stringify({exe:chosen.path,args:cliArgs})).toString('base64');
  const ps=`$ErrorActionPreference='Stop'; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json; & $p.exe @($p.args); exit $LASTEXITCODE`;
  await setStatus({channel:'outbound',peer:chosen.id});
  const response=await new Promise<{exitCode:number,stdout:string,stderr:string}>((resolve,reject)=>{
    const child=spawn(process.platform==='win32'?pwsh:chosen.path,process.platform==='win32'?['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')]:cliArgs,{cwd:input.cwd||directory,windowsHide:true,env:{...process.env,LOCALCODEX_DELEGATION_DEPTH:'1'},stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',overflow=false;
    const stop=()=>{void exec('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true}).catch(()=>child.kill());};
    const timer=setTimeout(stop,Math.min(settings.timeoutMs||300000,900000));
    child.stdout.on('data',b=>{stdout+=b.toString('utf8');if(stdout.length>2e6){overflow=true;stop()}});child.stderr.on('data',b=>{stderr+=b.toString('utf8');if(stderr.length>2e6){overflow=true;stop()}});
    child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('close',code=>{clearTimeout(timer);resolve({exitCode:overflow?-2:code??-1,stdout,stderr})});
    child.stdin.on('error',()=>{});child.stdin.end(chosen.id==='codex'?task:undefined);
  }).finally(()=>setStatus({channel:'idle',peer:chosen.id,lastDirection:'outbound'}));
  await setStatus({channel:'idle',peer:chosen.id,lastDirection:'outbound'});
  await writeFile(dir+'/response.json',JSON.stringify(response));
  if(response.exitCode!==0)throw new Error(`Agent ${chosen.id} failed: ${response.stderr.slice(-3000)}. Result: ${dir}`);
  return JSON.stringify({agent:chosen.id,channel:id,result:response.stdout.slice(-30000),artifact:`${dir}/response.json`,sha256:createHash('sha256').update(response.stdout).digest('hex')});
}






