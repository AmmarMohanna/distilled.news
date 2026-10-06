import {it,expect} from 'vitest';
import {createStrongSemanticModel} from './semantic-model';
import type {Env} from '../types';
it('retains unknown-charge reservation and the exact timeout reason instead of masking planner timeout as provider failure',async()=>{
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini'} as Env,async()=>{throw new DOMException('Aborted','AbortError')})!;
 await expect(model.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{facts:[]},{})).rejects.toThrow('SEMANTIC_MODEL_TIMEOUT');
 expect(model.usage()).toEqual({calls:1,tokensIn:0,tokensOut:0,costUsd:.02,reported:false});
});
