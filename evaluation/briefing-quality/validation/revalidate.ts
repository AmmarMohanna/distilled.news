/** No provider access: replay recorded evidence through audited research checks. */
import fs from'node:fs';import path from'node:path';
import{inventory,type Case}from'../worker/src/protocol';
import{groundedInventory,parseGrounding,groundedReview}from'../worker/src/grounding';
import{languageCompliance,combinedLanguageStatus}from'./language-compliance';
import{consistencyRequest}from'./review-consistency';
import{auditDataset}from'./benchmark-audit';
import{immutable,digest}from'./offline';
const prior='evaluation/briefing-quality/private/reliability-v1',revision=process.argv[2]??'r1';if(!['r1','r2'].includes(revision))throw Error('UNKNOWN_REVALIDATION_REVISION');const out='evaluation/briefing-quality/private/reliability-v2'+(revision==='r2'?'/r2':'');fs.mkdirSync(out,{recursive:true});
const datasets=[['synthetic',prior],['real-source',path.join(prior,'real-challenges')]],all:any[]=[];
for(const [dataset,root]of datasets){const audited=auditDataset(root);immutable(path.join(out,dataset+'-reference-audit.json'),audited);const cases:Case[]=JSON.parse(fs.readFileSync(path.join(root,'blind-controls.json'),'utf8'));const labels=JSON.parse(fs.readFileSync(path.join(root,'control-labels.json'),'utf8'));
 for(const c of cases){const independent=c.items.map((i,item)=>({item,...languageCompliance(i.headline,i.body,c.language)}));
  for(const model of ['openai--gpt-4.1','anthropic--claude-sonnet-4.5']){const dir=path.join(root,'controls-run',model,c.id),file=path.join(dir,'result.private.json'),r=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined;let correction:any;
   if(r?.status==='failed'&&r.error==='Error: UNBOUND_REVIEW_FINDING'){
    const call=(stage:string)=>{const row=r.calls.find(x=>x.stage===stage&&x.state==='SETTLED');if(!row)return null;const p=path.join(dir,'evidence/calls',row.id+'.json');if(!fs.existsSync(p))return null;return JSON.parse(JSON.parse(fs.readFileSync(p,'utf8')).choices[0].message.content)};
    const raw=call('atomic_claims_and_coverage'),proposedRaw=call('independent_developments'),grounding=call('inventory_grounding_v1');
    if(raw&&proposedRaw){const proposed=inventory(proposedRaw,c),d=grounding?groundedInventory(proposed,parseGrounding(grounding,proposed)):proposed;const request=consistencyRequest(c,d,raw,'UNBOUND_REVIEW_FINDING');const key=dataset+'-'+model+'-'+c.id;immutable(path.join(out,'pending-corrections',key+'.json'),{case:c,inventory:d,originalRawReview:raw,request,originalPaidCallIds:r.calls.map(c=>c.id),reason:'Requires one new separately accounted correction, not sent without credit.'});correction={requestSha256:digest(JSON.stringify(request)),status:'not_executed_account_credit_unavailable'};}
   }
   all.push({dataset,id:c.id,language:c.language,eventGroup:labels[c.id].eventGroup,isFault:labels[c.id].isFault,targetCategory:labels[c.id].category,model,originalStatus:r?.status??'missing',originalError:r?.error,originalPredicted:r?.predicted,originalAlert:r?.alert,independentLanguage:independent,combinedLanguage:r?.status==='completed'?r.review.items.map(i=>({item:i.item,original:i.language,combined:combinedLanguageStatus(i.language,independent[i.item])})):null,correction});
  }
 }
}
const summary={policy:'offline-language-and-consistency-audit-v2',freshModelCalls:0,originalRecordsModified:false,rows:all,detectorStats:Object.fromEntries(['synthetic','real-source'].map(dataset=>{const rows=all.filter(r=>r.dataset===dataset&&r.model==='openai--gpt-4.1');const eligible=rows.filter(r=>!r.isFault||r.targetCategory==='language');const classified=eligible.filter(r=>r.independentLanguage.every(i=>i.status!=='unknown'));const counts={TP:0,FP:0,TN:0,FN:0};for(const r of classified){const predicted=r.independentLanguage.some(i=>i.status==='noncompliant'),truth=r.isFault&&r.targetCategory==='language';counts[(predicted===truth?'T':'F')+(predicted?'P':'N')]++;}return [dataset,{eligible:eligible.length,classifiable:classified.length,abstentions:eligible.length-classified.length,...counts,scope:'Independent language validation of retained development packets only, not rerun model quality or held-out performance'}]}))};
immutable(path.join(out,'revalidation.private.json'),summary);const publicSummary={policy:summary.policy,freshModelCalls:0,originalRecordsModified:false,referenceAuditCases:all.length/2,detectorStats:summary.detectorStats,correctionRequestsPrepared:all.filter(r=>r.correction).length,rows:all.map(({independentLanguage,combinedLanguage,...r})=>({...r,independentLanguage:independentLanguage.map(({candidates,...i})=>i),combinedLanguage}))};
immutable('evaluation/briefing-quality/reports/reliability-v2/OFFLINE_REVALIDATION'+(revision==='r2'?'_R2':'')+'.json',publicSummary);console.log(JSON.stringify({revision,detectorStats:summary.detectorStats,correctionsPrepared:publicSummary.correctionRequestsPrepared,freshModelCalls:0}));
