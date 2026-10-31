import assert from 'node:assert/strict';
import {domain,differentSites,blockedDomain,filterSearchResults} from '../migration-v2/lib/search-diversity.ts';
assert.equal(differentSites('Найди по другим сайтам'),true);assert.equal(differentSites('Давай заново'),true);assert.equal(differentSites('Проверь файл'),false);
assert.equal(domain('https://www.example.com/a'),'example.com');assert.equal(domain('https://shop.example.com.by/a'),'example.com.by');assert.equal(blockedDomain('https://news.example.com/a',['example.com']),true);
const text='Title: Old\nURL: https://old.example/a\nOld content\nTitle: New\nURL: https://new.example/b\nNew content';
const filtered=filterSearchResults(text,['old.example']);assert.ok(!filtered.includes('old.example'));assert.ok(filtered.includes('new.example'));
console.log('PASS: other-sites intent, domain/subdomain exclusion, actual result filtering.');
