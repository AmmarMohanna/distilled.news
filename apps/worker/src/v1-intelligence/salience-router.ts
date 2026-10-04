import {DeterministicSalienceScorer,salienceInputSchema,salienceResultSchema,type EventSalienceScorer,type SalienceInput,type SalienceResult,type ExperimentUsage} from './salience';
export const SEMANTIC_SALIENCE_POLICY='semantic-router-jev-gpt-v1';
export interface SalienceAttempt {scorer:string;model:string;reason?:string;confidence?:number;judgment?:SalienceResult['judgment'];latencyMs:number;usage:ExperimentUsage}
export interface RoutedSalienceResult extends SalienceResult {
 route:'NATIVE_JEV'|'GPT_FALLBACK'|'NATIVE_GPT_STORYLINE'|'DETERMINISTIC_FALLBACK';
 attempts:SalienceAttempt[];latencyMs:number;componentOrigin:{overallScore:string;otherComponents:'DETERMINISTIC'};
}
/** Models supply salience only. Eligibility is deterministic; relevance, window,
 * diversity and publication remain outside this port. JEV is optional. */
export class SemanticSalienceRouter implements EventSalienceScorer {
 readonly policyKey:string;
 constructor(private readonly options:{jev?:EventSalienceScorer;gpt?:EventSalienceScorer}){this.policyKey=`${SEMANTIC_SALIENCE_POLICY}:jev=${options.jev?.model??'UNCONFIGURED'}:gpt=${options.gpt?.model??'UNCONFIGURED'}`}
 async score(raw:SalienceInput):Promise<RoutedSalienceResult>{
  const input=salienceInputSchema.parse(raw),start=performance.now(),attempts:SalienceAttempt[]=[];
  const finish=(result:SalienceResult,route:RoutedSalienceResult['route']):RoutedSalienceResult=>{
   const usage:ExperimentUsage={calls:attempts.reduce((n,a)=>n+a.usage.calls,0),costUsd:attempts.reduce((n,a)=>n+a.usage.costUsd,0),reported:attempts.every(a=>a.usage.reported)};
   if(attempts.every(a=>a.usage.tokensIn!==undefined))usage.tokensIn=attempts.reduce((n,a)=>n+a.usage.tokensIn!,0);
   if(attempts.every(a=>a.usage.tokensOut!==undefined))usage.tokensOut=attempts.reduce((n,a)=>n+a.usage.tokensOut!,0);
   return {...result,usage,route,attempts,latencyMs:performance.now()-start,componentOrigin:{overallScore:result.provenance.scorer,otherComponents:'DETERMINISTIC'}};
  };
  const paths=input.targetType==='EVENT'?[['JEV',this.options.jev],['GPT',this.options.gpt]] as const:[['GPT',this.options.gpt]] as const;
  for(const [kind,scorer] of paths){
   if(!scorer){attempts.push({scorer:kind,model:'UNCONFIGURED',reason:'PROVIDER_UNAVAILABLE',latencyMs:0,usage:{calls:0,costUsd:0,reported:true}});continue}
   const begun=performance.now();
   // Adapters must contain transport failures and retain their charged/reserved usage.
   let result:SalienceResult;
   try{result=salienceResultSchema.parse(await scorer.score(input))}catch{
    result={...new DeterministicSalienceScorer().score(input),fallback:'ADAPTER_OUTCOME_UNKNOWN',usage:{calls:1,costUsd:.02,reported:false}};
   }
   attempts.push({scorer:kind,model:scorer.model??result.provenance.model,reason:result.fallback,confidence:result.confidence,judgment:result.judgment,latencyMs:performance.now()-begun,usage:result.usage});
   if(!result.fallback && result.provenance.scorer===kind)return finish(result,input.targetType==='STORYLINE'?'NATIVE_GPT_STORYLINE':kind==='JEV'?'NATIVE_JEV':'GPT_FALLBACK');
  }
  return finish({...new DeterministicSalienceScorer().score(input),fallback:'SEMANTIC_JUDGMENT_UNAVAILABLE'},'DETERMINISTIC_FALLBACK');
 }
}
