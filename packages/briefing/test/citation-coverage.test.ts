import {it,expect} from 'vitest';
import {generateBriefing} from '../src/engine';
import {completeStorySources} from '../src/citation-coverage';
import {UsageMeter} from '../src/model';
import {FEED,MODELS,WINDOW,article} from './helpers';
import {prepareArticles} from '../src/prepare';
it('keeps one heading and all supporting sources through verification and final publication output',async()=>{
 const articles=[article('outlet-a','The cabinet approved a new airport terminal. Construction starts in June.'),article('outlet-b','A new airport terminal has been approved by the cabinet. Work begins in June.'),article('outlet-c','The cabinet is considering a different proposal to build a railway station.')];
 let verifierText='';
 const port={complete:async(request:any)=>{
  let reply;
  if(request.system.startsWith('You audit source coverage')){
   const payload=JSON.parse(request.user);reply={sources:payload.sources.map((s:any)=>({ref:s.ref,stories:/railway/.test(s.text)?[]:[0]}))};
  }else if(request.system.includes('meticulous fact-checker')){verifierText=request.user;reply={results:[{i:0,verdict:'ok',issues:[]}]};}
  else reply={items:[{headline:'Cabinet approves new airport terminal',body:'Construction starts in June.',sources:['S1'],relation:'new',updates:null,importance:1}]};
  return {text:JSON.stringify(reply),inputTokens:1,outputTokens:1};
 }};
 const result=await generateBriefing({feed:FEED,...WINDOW,articles},port,MODELS,{citationCoverage:true,promptVersion:4,prepare:{nearDuplicate:1.01}});
 expect(result.items).toHaveLength(1);expect(result.items[0].sourceIds.sort()).toEqual(['outlet-a','outlet-b']);
 expect(verifierText).toContain('cites S1, S2');expect(result.items[0].sourceIds).not.toContain('outlet-c');
});
it('requires coverage for every source and rejects fabricated references',async()=>{
 const articles=prepareArticles([article('a','The cabinet approved a terminal with construction starting in June.'),article('b','The same terminal decision was announced by the cabinet this morning.')],{nearDuplicate:1.01}).prepared;
 const drafts=[{headline:'Cabinet approves terminal',body:'',refs:['S1']}];
 for(const response of [{sources:[{ref:'S1',stories:[0]}]},{sources:[{ref:'S1',stories:[0]},{ref:'S999',stories:[0]}]}]){
  const port={complete:async()=>({text:JSON.stringify(response),inputTokens:1,outputTokens:1})};
  await expect(completeStorySources(port,new UsageMeter(),'test',drafts,articles,10000)).rejects.toThrow();
 }
});

it('audits independent chunks concurrently and preserves citation order when replies arrive out of order',async()=>{
 const articles=prepareArticles([article('a','First outlet reports the cabinet decision on the airport terminal.'),article('b','Second outlet confirms the same cabinet decision about the terminal.'),article('c','Third outlet reports the decision to approve the airport terminal.')],{nearDuplicate:1.01}).prepared;
 const pending:{ref:string;resolve:(value:any)=>void}[]=[];
 const port={complete:(request:any)=>new Promise<any>(resolve=>{const {sources}=JSON.parse(request.user);pending.push({ref:sources[0].ref,resolve});})};
 const work=completeStorySources(port,new UsageMeter(),'test',[{headline:'Cabinet approves terminal',body:'',refs:['S1']}],articles,1);
 await Promise.resolve();
 // Release every started call even when this assertion fails, avoiding hung tests.
 const count=pending.length;
 for(const call of [...pending].reverse())call.resolve({text:JSON.stringify({sources:[{ref:call.ref,stories:[0]}]}),inputTokens:1,outputTokens:1});
 expect(count).toBe(3);
 expect(await work).toEqual([['S1','S2','S3']]);
});

it('waits for sibling corrective replies before reporting a failed concurrent audit',async()=>{
 const articles=prepareArticles([article('a','Cabinet approves a new terminal and work starts in June.'),article('b','A second outlet reports approval of the terminal by the cabinet.')],{nearDuplicate:1.01}).prepared;
 let releaseFirst!:(value:any)=>void,releaseRetry!:(value:any)=>void,secondCalls=0;
 const port={complete:(request:any)=>{
  const ref=JSON.parse(request.user.split('\n\nYour previous reply')[0]).sources[0].ref;
  if(ref==='S1')return Promise.resolve({text:'{"sources":[]}',inputTokens:1,outputTokens:1});
  secondCalls++;
  return new Promise<any>(resolve=>{if(secondCalls===1)releaseFirst=resolve;else releaseRetry=resolve});
 }};
 let finished=false;
 const work=completeStorySources(port,new UsageMeter(),'test',[{headline:'Cabinet approves terminal',body:'',refs:['S1']}],articles,1).then(()=>{finished=true},()=>{finished=true});
 for(let i=0;i<20;i++)await Promise.resolve();
 const beforeSibling=finished;
 releaseFirst({text:'{"sources":[]}',inputTokens:1,outputTokens:1});
 for(let i=0;i<20;i++)await Promise.resolve();
 const beforeCorrection=finished;
 releaseRetry({text:'{"sources":[{"ref":"S2","stories":[0]}]}',inputTokens:1,outputTokens:1});
 await work;expect(beforeSibling).toBe(false);expect(beforeCorrection).toBe(false);expect(finished).toBe(true);
});
