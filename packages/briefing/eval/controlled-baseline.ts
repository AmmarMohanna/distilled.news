/** Offline request reconstruction only. This module never invokes a provider. */
import development from '../test/fixtures/v3-factual-reliability.json';
import heldout from '../test/fixtures/v3-controlled-baseline.json';
import recordedDateComparison from '../test/fixtures/v3-date-prompt-comparison.json';
import {verifyUser} from '../src/prompts';

// Historical experiments must reconstruct their tested prompt, not today's default.
const VERIFY_SYSTEM=recordedDateComparison.records.find(r=>r.name==='baseline-heldout-bad')!.request.system;

interface Case {
  id:string; headline:string; body:string; sources:string[];
  relation?:string; updatesId?:string;
}

export function controlledVerifierRequests(){
  const sources=heldout.sources.map((s,i)=>({...s,ref:`H${i+1}`,alsoIds:[],similarRefs:[]}));
  const cases=heldout.cases.map(c=>({...c,sources:c.sourceIds.map(id=>sources.find(s=>s.id===id)!.ref)}));
  const groups:Array<{name:string;sources:typeof sources;cases:Case[];prior:typeof heldout.prior;cutoff:string}>=[
    {name:'development-bad',sources:development.sources,cases:development.cases.filter(c=>c.expected!=='ok'),prior:[],cutoff:development.windowEnd},
    {name:'development-good',sources:development.sources,cases:development.cases.filter(c=>c.expected==='ok'),prior:[],cutoff:development.windowEnd},
    {name:'heldout-bad',sources,cases:cases.filter(c=>!c.allowedVerdicts.includes('ok')),prior:heldout.prior,cutoff:heldout.reportingWindow.end},
    {name:'heldout-good',sources,cases:cases.filter(c=>c.allowedVerdicts.includes('ok')),prior:heldout.prior,cutoff:heldout.reportingWindow.end},
    {name:'heldout-ordinary',sources,cases:heldout.ordinaryBatch.map(id=>cases.find(c=>c.id===id)!),prior:heldout.prior,cutoff:heldout.reportingWindow.end}
  ];
  return groups.flatMap(group=>['openai/gpt-4.1-mini','google/gemini-2.5-flash'].map(model=>({
    name:`${group.name}:${model}`,
    request:{model,temperature:0.1,max_tokens:2000,response_format:{type:'json_object'},usage:{include:true},
      ...(model.startsWith('google/')?{reasoning:{enabled:false}}:{}),
      messages:[{role:'system',content:VERIFY_SYSTEM},{role:'user',content:verifyUser({
        windowEnd:group.cutoff,prior:group.prior,sources:group.sources,
        items:group.cases.map((c,index)=>({index,headline:c.headline,body:c.body,relation:c.relation??'new',sources:c.sources,hints:[],
          updatesText:c.updatesId?heldout.prior.find(p=>p.id===c.updatesId)?.body:undefined}))
      })}]
    }
  })));
}

/** Same frozen cases for the separately authorized Haiku low-reasoning trial. */
export function controlledHaikuVerifierRequests(){
  return controlledVerifierRequests().filter(job=>job.request.model==='openai/gpt-4.1-mini').map(job=>{
    const {temperature:_,...request}=job.request;
    return {name:job.name.replace('openai/gpt-4.1-mini','anthropic/claude-haiku-5.5'),
      request:{...request,model:'anthropic/claude-haiku-5.5',reasoning:{effort:'low'}}};
  });
}
