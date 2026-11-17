/** Offline current-engine preparation diagnostics. No generated/model verdicts. */
import fs from 'node:fs';
import path from 'node:path';
import {prepareArticles} from '../../packages/briefing/src/prepare';
import {adapt,admit,hash} from './replay';
const [prepared,challenges,out]=process.argv.slice(2);
if(!prepared||!challenges||!out)throw Error('Usage: diagnose.ts PREPARED CHALLENGES PRIVATE_OUTPUT.json');
const target=path.resolve(out),root=path.resolve('evaluation/briefing-quality/private')+path.sep;
if(!target.startsWith(root)||fs.existsSync(target))throw Error('NEW_PRIVATE_OUTPUT_REQUIRED');
const load=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const manifest=load(path.join(prepared,'archive/dataset/manifest.json'));
const splits=load(path.join(prepared,'splits.provisional.json')).assignments;
const cases=manifest.files.filter((f:any)=>splits[f.file].split==='development').map((f:any)=>({
  ...load(path.join(prepared,'archive/dataset',f.file)),_file:f.file,measurementClass:'real_development_preparation_diagnostic'}));
for(const file of fs.readdirSync(path.join(challenges,'synthetic')))cases.push(load(path.join(challenges,'synthetic',file)));
const results=cases.map((c:any)=>{
  try {
    const input=adapt(c,[]);admit(input,100000);
    const result=prepareArticles(input.articles);
    const variants=result.prepared.flatMap(p=>p.alsoIds.map(id=>{
      const original=input.articles.find(a=>a.id===id)!;
      return {primaryId:p.id,foldedId:id,sameUrl:original.url===p.url,
        distinctNormalizedBody:original.text.replace(/\s+/g,' ').trim()!==p.text,
        foldedBodySha256:hash(original.text),retainedBodySha256:hash(p.text)};
    }));
    return {caseId:c._file,language:c.language,measurementClass:c.measurementClass,inputArticles:input.articles.length,
      preparedArticles:result.prepared.length,skipped:result.skipped,foldedVariants:variants,
      claim:'Mechanical preparation observation only; distinct body does not prove a material update',paidCalls:0};
  }catch(error){return {caseId:c._file,language:c.language,measurementClass:c.measurementClass,error:String(error),paidCalls:0};}
});
fs.writeFileSync(target,JSON.stringify({results,paidCalls:0,semanticQuality:'NOT ASSESSED'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({cases:results.length,explicitAdmissionFailures:results.filter((r:any)=>r.error).length,
  foldedDistinctBodies:results.reduce((n:number,r:any)=>n+(r.foldedVariants??[]).filter((v:any)=>v.distinctNormalizedBody).length,0)}));
