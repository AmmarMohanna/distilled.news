import {createHash} from 'node:crypto';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const supportedProvenance=['INDEPENDENT_HUMAN','HUMAN_ASSISTED','AI_ASSISTED','INVESTIGATOR','CONTROLLED_FIXTURE'];
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const walk=function*(value,path=''){
 if(Array.isArray(value)){for(const [i,item] of value.entries())yield* walk(item,`${path}/${i}`);}
 else if(value&&typeof value==='object'){yield [path,value];for(const [key,item]of Object.entries(value))yield* walk(item,`${path}/${key}`);}
};
function section(text,id){
 const headings=[...text.matchAll(/^## ([A-Z]\d+(?:S\d+)?)\b[^\n]*\n/gm)],index=headings.findIndex(m=>m[1]===id);
 if(index<0||headings.filter(m=>m[1]===id).length!==1)throw Error('UNKNOWN_SECTION');
 const start=headings[index].index,body=start+headings[index][0].length,end=headings[index+1]?.index??text.length;
 return {text:text.slice(body,end),start:Array.from(text.slice(0,start)).length,end:Array.from(text.slice(0,end)).length};
}
/** Pure offline import validation. Artifact bytes must come from a caller-owned,
 * whitelisted manifest, never a path supplied by the label file. Does not turn
 * reviewer judgments into semantic provider verdicts or certify an edition. */
export function validateLabels(labels,manifest){
 const diagnostics=[],cases=[];let exactWitnessOccurrences=0,scopeHashOccurrences=0;
 const require=(condition,code)=>{if(!condition)throw Error(code);};
 const check=(action,path)=>{try{action();}catch(error){diagnostics.push({path,code:error.message});}};
 check(()=>{
  require(labels.schemaVersion==='publication-validation-labels-v2','SCHEMA_VERSION');
  require(nonempty(labels.reviewer)&&nonempty(labels.reviewedAt),'REVIEWER_REQUIRED');
  require(supportedProvenance.includes(labels.provenance),'PROVENANCE');
  require(typeof labels.modelAssistanceUsed==='boolean'&&typeof labels.previouslyReadAudit==='boolean','EXPOSURE_REQUIRED');
  require(labels.provenance!=='INDEPENDENT_HUMAN'||!labels.modelAssistanceUsed&&!labels.previouslyReadAudit,'FALSE_INDEPENDENCE');
  require(labels.sourceManifestSha256===manifest.sourceManifestSha256,'SOURCE_MANIFEST_HASH');
  const ids=labels.cases.map(c=>c.id);require(new Set(ids).size===ids.length&&ids.length===manifest.caseIds.length&&manifest.caseIds.every(id=>ids.includes(id)),'CASE_IDS');
 },'/');
 const artifact=record=>{
  require(Object.hasOwn(manifest.artifacts,record.artifact),'UNKNOWN_ARTIFACT');
  const bytes=manifest.artifacts[record.artifact];require(hash(bytes)===record.sha256,'ARTIFACT_HASH');
  return bytes.toString('utf8').replace(/\r\n/g,'\n');
 };
 for(const [index,record]of (labels.evidenceInspected??[]).entries())check(()=>{artifact(record);require(nonempty(record.scope),'EVIDENCE_SCOPE');},`/evidenceInspected/${index}`);
 if(!labels.evidenceInspected?.length)diagnostics.push({path:'/evidenceInspected',code:'EVIDENCE_REQUIRED'});
 for(const [index,c]of (labels.cases??[]).entries()){
  const path=`/cases/${index}`;
  if(c.reviewState==='UNREVIEWED'){
   check(()=>require(c.claims===null&&c.requirements===null&&c.readerScopesInspected===null&&c.reason===null,'UNREVIEWED_NOT_NULL'),path);
   cases.push({id:c.id,outcome:'UNREVIEWED',claims:[],errors:[],drafts:[]});continue;
  }
  check(()=>{
   require(['PARTIAL','REVIEWED'].includes(c.reviewState),'REVIEW_STATE');
   require(Array.isArray(c.claims)&&Array.isArray(c.requirements)&&nonempty(c.reason),'REVIEW_INCOMPLETE');
   require(c.claims.length+c.requirements.length>0,'EMPTY_REVIEW');
   const ids=items=>items.map(x=>x.claimId??x.propositionId);
   require(new Set(ids(c.claims)).size===c.claims.length&&new Set(ids(c.requirements)).size===c.requirements.length,'DUPLICATE_REVIEW_IDS');
   for(const claim of c.claims){
    require(nonempty(claim.claimId)&&nonempty(claim.readerText)&&nonempty(claim.reason),'CLAIM_FIELDS');
    require(['SUPPORTED','ERROR','UNRESOLVED'].includes(claim.support),'SUPPORT');
    require(claim.sourceWitnesses?.length&&claim.readerWitnesses?.length,'CLAIM_WITNESSES');
    require(claim.support==='ERROR'?['UNSUPPORTED_ADDITION','DISTORTED_FACT'].includes(claim.errorKind):claim.errorKind===null,'ERROR_KIND');
    require(Array.isArray(claim.facets),'FACETS');
   }
   for(const req of c.requirements){
    require(nonempty(req.propositionId)&&nonempty(req.sourcePropositionText)&&nonempty(req.reason),'REQUIREMENT_FIELDS');
    require(['REQUIRED','OPTIONAL','NOT_NEWS','UNRESOLVED'].includes(req.materiality),'MATERIALITY');
    require(['COMMUNICATED','OMITTED','UNRESOLVED'].includes(req.communication),'COMMUNICATION');
    require(req.sourceWitnesses?.length,'SOURCE_WITNESS_REQUIRED');
    if(req.communication==='COMMUNICATED')require(req.readerWitnesses?.length,'READER_WITNESS_REQUIRED');
    if(req.communication==='OMITTED')require(req.omissionScopeWitnesses?.length&&!req.readerWitnesses?.length,'OMISSION_SCOPE_REQUIRED');
   }
  },path);
  for(const [sub,record]of walk(c)){
   if(!record.artifact)continue;
   check(()=>{
    const text=artifact(record),scope=section(text,record.section);
    if('start'in record||'end'in record){
     require(Number.isInteger(record.start)&&Number.isInteger(record.end)&&record.start>=scope.start&&record.end>record.start&&record.end<=scope.end,'WITNESS_BOUNDS');
     require(Array.from(text).slice(record.start,record.end).join('')===record.quote,'EXACT_WITNESS');exactWitnessOccurrences++;
    }
    if('scopeSha256'in record){
     let value=scope.text;
     if(record.scope==='COMPLETE_CONTROL_READER'){
      const readers=value.split('\n').filter(line=>line.startsWith('Reader:'));require(readers.length===1,'CONTROL_READER_SCOPE');value=readers[0].slice('Reader:'.length).trim();
     }else require(record.scope==='COMPLETE_STORY_SECTION','UNKNOWN_SCOPE');
     require(hash(value)===record.scopeSha256,'SCOPE_HASH');scopeHashOccurrences++;
    }
   },path+sub);
  }
  const claims=c.claims??[],requirements=c.requirements??[];
  const outcome=(claims,requirements)=>claims.some(x=>x.support==='ERROR')||requirements.some(x=>x.materiality==='REQUIRED'&&x.communication==='OMITTED')?'NEGATIVE':claims.some(x=>x.support==='UNRESOLVED')||requirements.some(x=>x.materiality==='UNRESOLVED'||x.communication==='UNRESOLVED')?'UNRESOLVED':'POSITIVE';
  const errors=[...new Set([...claims.filter(x=>x.support==='ERROR').map(x=>x.errorKind),...requirements.filter(x=>x.materiality==='REQUIRED'&&x.communication==='OMITTED').map(()=>'MISSING_MANDATORY_COVERAGE')])];
  const scopes=x=>[...(x.readerWitnesses??[]),...(x.omissionScopeWitnesses??[])].map(w=>w.section);
  const sections=[...new Set([...claims,...requirements].flatMap(scopes))];
  cases.push({id:c.id,outcome:c.reviewState==='PARTIAL'?'PARTIAL':outcome(claims,requirements),errors,claims:claims.map(x=>({claimId:x.claimId,support:x.support})),drafts:sections.map(id=>({section:id,outcome:outcome(claims.filter(x=>scopes(x).includes(id)),requirements.filter(x=>scopes(x).includes(id)))}))});
 }
 return {valid:diagnostics.length===0,diagnostics,cases,exactWitnessOccurrences,scopeHashOccurrences,provenance:labels.provenance,editionCertified:false};
}

/** Missing/incompatible semantic results are excluded, never manufactured as
 * safe accepts or zero errors. Case labels with substantive uncertainty are
 * reported separately from reviewed positives/negatives. */
export function scoreValidationEvaluation(labels,verdicts,provenance){
 const scored=[],missing=[],incompatible=[];
 for(const label of labels){const matches=verdicts.filter(v=>v.id===label.id);
  if(!matches.length)missing.push(label.id);
  else if(matches.length!==1||matches[0].compatible!==true||!['ACCEPT','REJECT','UNRESOLVED'].includes(matches[0].decision))incompatible.push(label.id);
  else scored.push({...label,decision:matches[0].decision});
 }
 const known=scored.filter(x=>['POSITIVE','NEGATIVE'].includes(x.outcome)),count=(truth,decision)=>known.filter(x=>x.outcome===truth&&x.decision===decision).length;
 return {provenance,independentGold:provenance==='INDEPENDENT_HUMAN',total:labels.length,compatibleVerdicts:scored.length,scoredKnownLabels:known.length,missingVerdicts:missing.length,incompatibleVerdicts:incompatible.length,labelUnresolved:labels.filter(x=>x.outcome==='UNRESOLVED').length,unreviewed:labels.filter(x=>['PARTIAL','UNREVIEWED'].includes(x.outcome)).length,accuracy:known.length?'OBSERVED_ON_COMPATIBLE_INTERSECTION':'UNMEASURED',falseAcceptances:known.length?count('NEGATIVE','ACCEPT'):null,falseRejections:known.length?count('POSITIVE','REJECT'):null,positiveAccepts:count('POSITIVE','ACCEPT'),unresolvedPositives:count('POSITIVE','UNRESOLVED'),unresolvedNegatives:count('NEGATIVE','UNRESOLVED'),missingCaseIds:missing,incompatibleCaseIds:incompatible};
}
