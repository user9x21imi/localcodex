import assert from 'node:assert/strict';import {mkdir,writeFile,readFile} from 'node:fs/promises';import {EventEmitter} from 'node:events';
import {SafetyGate,stopText,actionKey} from '../migration-v2/lib/safety-gate.ts';
import {bindEmergencyInput} from '../migration-v2/lib/emergency-input.ts';
const base=await (await import('node:fs/promises')).mkdtemp((await import('node:path')).join((await import('node:os')).tmpdir(),'localcodex-safety-'));let n=0;
async function gate(limits={calls:24,models:16,ms:10000}){const root=base+'/case-'+Date.now()+'-'+n++;await mkdir(root+'/config-v2',{recursive:true});await writeFile(root+'/config-v2/emergency-stop.json','{"stopped":false}');let reasons=[];return {g:new SafetyGate(root,limits,async r=>{reasons.push(r)}),reasons,root}}
{
const {g,reasons}=await gate();await g.begin('s','установи программу');await g.before('s','windows_App',{name:'powershell'});await g.before('s','windows_App',{name:'powershell'});await assert.rejects(g.before('s','windows_App',{name:'powershell'}));assert.equal(reasons.length,1);await assert.rejects(g.before('s','powershell',{script:'write host'}));g.dispose();
}
{
const {g,reasons}=await gate();await g.begin('s','задача');const signal=await g.before('s','powershell',{script:'a'});await g.after('s',true);await g.after('s',true);await g.after('s',true);assert.equal(signal.aborted,true);assert.equal(reasons.length,1);g.dispose();
}
{
const {g,reasons}=await gate({calls:3,models:3,ms:10000});await g.begin('s','задача');for(let i=0;i<3;i++)await g.before('s','read',{path:'x'});await assert.rejects(g.before('s','read',{path:'x'}));assert.equal(reasons.length,1);g.dispose();
}
{
const {g,reasons}=await gate({calls:3,models:2,ms:40});await g.begin('s','задача');await new Promise(r=>setTimeout(r,90));assert.equal(reasons.length,1);g.dispose();
}
{
const {g,reasons}=await gate();await assert.rejects(g.begin('s','стоп!!!'));assert.equal(reasons.length,1);g.dispose();
}
for(const text of ['стоп','СТОП!','stop','/stop','остановись пожалуйста'])assert.equal(stopText(text),true);assert.equal(stopText('Не останавливайся'),false);
{
const {g,reasons}=await gate({calls:24,models:16,ms:40});await g.begin('s','задача');g.finish('s');await new Promise(r=>setTimeout(r,90));assert.equal(reasons.length,0);await assert.rejects(g.before('s','powershell',{script:'late action'}));g.dispose();
}
assert.equal(actionKey('webfetch',{url:'https://example.com/a#x',format:'text'}),actionKey('webfetch',{url:'https://example.com/a',format:'markdown'}));
const keyInput=new EventEmitter();let stopped=0;const ctx={renderer:{keyInput,currentFocusedEditor:{plainText:'стоп'}}};const off=bindEmergencyInput(ctx,()=>stopped++);let prevented=0;keyInput.emit('keypress',{name:'return',preventDefault(){prevented++},stopPropagation(){prevented++}});assert.equal(stopped,1);assert.equal(prevented,2);ctx.renderer.currentFocusedEditor.plainText='Найди другое';keyInput.emit('keypress',{name:'return'});assert.equal(stopped,1);off();
console.log('PASS: repeat/action/time/error budgets; latch; active abort; STOP intercepted before submit.');
