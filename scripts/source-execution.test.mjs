import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSourceExecution } from './source-execution.mjs';

function fixture(body){const dir=mkdtempSync(join(tmpdir(),'distilled-execution-'));const script=join(dir,'child.mjs');writeFileSync(script,body);return {script,dispose:()=>rmSync(dir,{recursive:true,force:true})};}
test('source execution sends structured stdin and does not forward unrelated environment secrets',async()=>{
  const f=fixture('let s=""; for await(const c of process.stdin)s+=c;console.log(JSON.stringify({received:JSON.parse(s),leaked:!!process.env.UNRELATED_SECRET}));');
  try{const execution=createSourceExecution({python:process.execPath,script:f.script,environment:{UNRELATED_SECRET:'never-forward'}});
    const result=await execution.execute('extract',{url:'https://example.com',html:'article'});
    assert.equal(result.received.kind,'extract');assert.equal(result.leaked,false);
  }finally{f.dispose();}
});
test('source execution bounds child output',async()=>{
  const f=fixture('console.log("x".repeat(10000));');
  try{const execution=createSourceExecution({python:process.execPath,script:f.script,maxOutputBytes:100});await assert.rejects(execution.execute('extract',{}),/EXECUTION_OUTPUT_TOO_LARGE/);}finally{f.dispose();}
});
test('source execution enforces its deadline and rejects unknown operations',async()=>{
  const f=fixture('setInterval(()=>{},1000);');
  try{const execution=createSourceExecution({python:process.execPath,script:f.script,timeoutMs:20});await assert.rejects(execution.execute('telethon',{}),/EXECUTION_TIMEOUT/);await assert.rejects(execution.execute('unknown',{}),/INVALID_EXECUTION_KIND/);}finally{f.dispose();}
});
