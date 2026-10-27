import assert from 'node:assert/strict';
import {terminalTitle} from '../migration-v2/lib/terminal-title.ts';
assert.match(terminalTitle({phase:'working'}),/Работает/);
assert.notEqual(terminalTitle({phase:'working'},0),terminalTitle({phase:'working'},1));
assert.match(terminalTitle({result:'succeeded'}),/🔔/);
assert.match(terminalTitle({result:'failed'}),/Ошибка/);
assert.match(terminalTitle({phase:'working',channel:'inbound',peer:'codex'}),/← codex/);
console.log('PASS: animated title, completion bell, failure and direction');
