import {generateBriefing,type EngineOptions}from'../../../packages/briefing/src/engine';
import type{BriefingInput,BriefingModels,PriorItem}from'../../../packages/briefing/src/types';
import type{ModelPort}from'../../../packages/briefing/src/model';
export interface FrozenEngineInput {id:string;feedId:string;input:BriefingInput;models:BriefingModels;promptVersion?:EngineOptions['promptVersion'];editorSourcePolicy?:EngineOptions['editorSourcePolicy'];editorAccountingPolicy?:EngineOptions['editorAccountingPolicy'];editorFailurePolicy?:EngineOptions['editorFailurePolicy'];citationCoverage?:boolean;noveltyGuard?:boolean;noveltyPolicy?:EngineOptions['noveltyPolicy'];architecture?:EngineOptions['architecture']}
/** Mirror v3-window.ts's actual frozen invocation, rather than core defaults. */
export function currentEngineOptions(f:FrozenEngineInput):Partial<EngineOptions>{
 if(!f.id||!f.feedId||!f.input?.articles||!f.models?.editor||!f.models?.verifier)throw Error('FROZEN_ENGINE_INPUT_REQUIRED');
 if(f.input.articles.some(a=>typeof a.source!=='string'||!a.source||typeof a.text!=='string'))throw Error('ORIGINAL_SOURCE_METADATA_REQUIRED');
 return {editorSourcePolicy:f.editorSourcePolicy,editorAccountingPolicy:f.editorAccountingPolicy,editorFailurePolicy:f.editorFailurePolicy,citationCoverage:f.citationCoverage,noveltyGuard:f.noveltyGuard,noveltyPolicy:f.noveltyPolicy,...(f.architecture?{architecture:f.architecture}:{}),promptVersion:f.promptVersion??1,now:()=>new Date(f.input.windowEnd),prepare:{maxArticleChars:Number.MAX_SAFE_INTEGER,minChars:1,nearDuplicate:1.01}};
}
export function runCurrentEngine(f:FrozenEngineInput,port:ModelPort,prior:PriorItem[]){const options=currentEngineOptions(f);return generateBriefing({...f.input,prior},port,f.models,options)}
