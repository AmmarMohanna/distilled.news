import type {SynthesisWriterInput} from './publication';
/** Partition by the actual operation admission function, not a story/evidence quota.
 * A complex story can span packets: packets never become publication stories. */
export function partitionWriterInput(input:SynthesisWriterInput,fits:(packet:SynthesisWriterInput)=>boolean,options:{onPending?:(candidateId:string)=>void}={}):SynthesisWriterInput[]{
 const units:SynthesisWriterInput['stories']=[];
 for(const story of input.stories){
  if(fits({...input,stories:[story]})){units.push(story);continue}
  if(!story.approvedFacts?.length){if(options.onPending){options.onPending(story.candidate.id);continue}throw Error('MODEL_CONTEXT_CONTINUATION_REQUIRED')}
  const fragments:SynthesisWriterInput['stories']=[];let unresolved=false;
  let offset=0;
  while(offset<story.approvedFacts.length){
   const fragment=(count:number)=>{const approvedFacts=story.approvedFacts!.slice(offset,offset+count),owned=new Set(approvedFacts.map(f=>f.id));
    const plan=story.plan?{...story.plan,...Object.fromEntries(['newUnderstandingFactIds','contextFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'].map(k=>[k,(story.plan as any)[k].filter((id:string)=>owned.has(id))])),correctionObligations:offset?[]:story.plan.correctionObligations,correctionObligationIds:offset?[]:story.plan.correctionObligationIds}:undefined;
    return {...story,plan,approvedFacts,approvedSpans:approvedFacts.flatMap(f=>f.support)};
   };
   let lo=1,hi=story.approvedFacts.length-offset,size=0;
   while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(fits({...input,stories:[fragment(mid)]})){size=mid;lo=mid+1}else hi=mid-1}
   if(!size){unresolved=true;break}fragments.push(fragment(size));offset+=size;
  }
  if(unresolved){if(options.onPending){options.onPending(story.candidate.id);continue}throw Error('MODEL_CONTEXT_CONTINUATION_REQUIRED')}
  units.push(...fragments);
 }
 const packets:SynthesisWriterInput[]=[];let pending:SynthesisWriterInput['stories']=[];
 for(const unit of units){if(pending.some(s=>s.candidate.id===unit.candidate.id)||!fits({...input,stories:[...pending,unit]})){if(pending.length)packets.push({...input,stories:pending});pending=[]}pending.push(unit)}
 if(pending.length)packets.push({...input,stories:pending});return packets;
}
