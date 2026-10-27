import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
// Run only when no user channel is listening. Never stop another instance.
try{await fetch('http://127.0.0.1:8099/health',{signal:AbortSignal.timeout(300)});console.log('SKIP: user channel already running');process.exit(0)}catch{}
const root=await mkdtemp(path.join(tmpdir(),'localcodex-channel-'));
process.env.LOCALCODEX_ROOT=root;
await mkdir(path.join(root,'config-v2'));await mkdir(path.join(root,'channel'));
await writeFile(path.join(root,'config-v2/launcher.json'),JSON.stringify({agentChannel:false}));
await writeFile(path.join(root,'config-v2/agents.json'),JSON.stringify({enabled:false,allowed:['codex']}));
await copyFile(new URL('../channel/server.mjs',import.meta.url),path.join(root,'channel/server.mjs'));
const {communicationController}=await import('../migration-v2/lib/communication.ts');
let controller;
try{
 controller=await communicationController();assert.equal(controller.enabled,false);
 await controller.toggle();assert.equal(controller.enabled,true);
 assert.equal((await fetch('http://127.0.0.1:8099/health').then(r=>r.json())).enabled,true);
 assert.equal((await fetch('http://127.0.0.1:8099/status')).status,401);
 const token=(await readFile(path.join(root,'config-v2/channel-token'),'utf8')).trim();
 assert.equal((await fetch('http://127.0.0.1:8099/status',{headers:{Authorization:'Bearer '+token}})).status,200);
 await controller.toggle();assert.equal(controller.enabled,false);
 assert.equal(JSON.parse(await readFile(path.join(root,'config-v2/launcher.json'),'utf8')).agentChannel,false);
 console.log('PASS: communication opt-in, startup state, authentication and persistent toggle');
}finally{controller?.dispose();await new Promise(r=>setTimeout(r,300));await rm(root,{recursive:true,force:true})}
