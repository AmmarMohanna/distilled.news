import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import frozen from './fixtures/v3-controlled-baseline.json';
import {prepareArticles,selectPrior} from '../src/prepare';

it('freezes source bytes, known development cases and unseen held-out labels separately',()=>{
  for(const source of frozen.sources){
    expect(createHash('sha256').update(source.text).digest('hex')).toBe(source.sha256);
    expect(source.source).toContain('synthetic');
  }
  for(const d of frozen.development){
    const content=readFileSync(new URL(`../../../${d.file}`,import.meta.url));
    expect(createHash('sha256').update(JSON.stringify(JSON.parse(content.toString('utf8')))).digest('hex')).toBe(d.sha256);
  }
  expect(frozen.cases).toHaveLength(21);
  expect(new Set(frozen.cases.map(c=>c.id)).size).toBe(21);
  for(const c of frozen.cases){
    expect(c.split).toBe('heldout');
    expect(c.labelStatus).toContain('not independent human gold');
    for(const id of c.sourceIds)expect(frozen.sources.some(s=>s.id===id)).toBe(true);
  }
});

it('includes an ordinary shared-evidence batch, prior reporting, updates and corrections without paired near-duplicates',()=>{
  const batch=frozen.ordinaryBatch.map(id=>frozen.cases.find(c=>c.id===id)!);
  expect(batch.every(Boolean)).toBe(true);
  expect(new Set(batch.map(c=>c.sourceIds[0])).size).toBe(batch.length-1);
  expect(frozen.cases.some(c=>c.category==='repetition'&&c.allowedVerdicts.includes('redundant'))).toBe(true);
  expect(batch.some(c=>c.relation==='update')).toBe(true);
  expect(batch.some(c=>c.relation==='correction')).toBe(true);
  const articles=frozen.sources.map(s=>({...s,text:s.text}));
  const {prepared}=prepareArticles(articles,{minChars:1,nearDuplicate:1.01});
  expect(prepared).toHaveLength(articles.length);
  expect(selectPrior(frozen.prior,prepared,new Date(frozen.reportingWindow.end)).map(p=>p.id).sort())
    .toEqual(frozen.prior.map(p=>p.id).sort());
  expect(frozen.authorization.paidCallsAllowed).toBe(0);
});
