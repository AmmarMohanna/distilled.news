// Offline companion scope audit for the first control run, which predated
// executionScope tags. Original intents and settled receipts remain unchanged.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='.local-reports/news-end-to-end/',load=n=>JSON.parse(readFileSync(root+n,'utf8').replace(/^\uFEFF/,''));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const control=load('downstream-control-input.json');
if(hash(control.input)!==control.inputHash)throw Error('CONTROL_INPUT_HASH_CHANGED');
const facts=control.input.stories.flatMap(s=>s.approvedFacts);
if(facts.length!==12)throw Error('CONTROL_FACT_COUNT_CHANGED');
for(const s of control.input.stories)for(const f of s.approvedFacts)if(!s.evidence.some(e=>e.id===f.support[0].evidenceRevisionId&&e.body.includes(f.text)))throw Error('CONTROL_SOURCE_CHANGED');
for(const provider of ['openrouter','cloudflare']){
 const r=load(provider+'-report.json');
 if(r.stages.some(s=>['WRITING','FACTUAL_VERIFICATION','WRITER_REPAIR'].includes(s.name)))throw Error('PRIMARY_CONTROL_PHASE_AMBIGUITY');
}
const strings=v=>typeof v==='string'?[v]:v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
const operations={},bindings=[];
for(const name of readdirSync(root).filter(n=>n.endsWith('-accounted.json'))){
 const row=load(name);if(!['SYNTHESIS','GROUNDING'].includes(row.phase))continue;
 const intent=load(name.replace('-accounted.json','-intent.json'));
 if(hash(intent.body)!==row.requestHash||intent.requestHash!==row.requestHash)throw Error('CONTROL_REQUEST_HASH_CHANGED');
 const offered=new Set(strings(intent.payload));
 if(facts.some(f=>!offered.has(f.text)))throw Error('CONTROL_FACT_BINDING_FAILED');
 const key=row.route+':'+row.phase;if(bindings.some(b=>b.key===key))throw Error('UNEXPECTED_ADDITIONAL_CONTROL_CALL');
 operations[row.id]='AI_CURATED_DOWNSTREAM_CONTROL';
 bindings.push({key,operationId:row.id,requestHash:row.requestHash,inputHash:control.inputHash,scope:'AI_CURATED_DOWNSTREAM_CONTROL'});
}
const proof={operations,bindings,binding:'Exact frozen request hash and all 12 owned control facts; primary pipeline never entered paid writing/verification; no original receipt changed.'};
writeFileSync(root+'execution-scopes.json',JSON.stringify(proof,null,2)+'\n');
writeFileSync('benchmarks/news-end-to-end-execution-scopes.json',JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({boundControlCalls:bindings.length,inputHash:control.inputHash}));
