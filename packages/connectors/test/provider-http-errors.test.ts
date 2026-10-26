import {expect,it} from 'vitest';
import {requireProviderSuccess} from '../src/source-runtime/provider-http';

it('distinguishes the provider monthly usage limit from authentication and app budgets',()=>{
 const result={status:403,headers:{},bytes:new Uint8Array(),json:{error:{type:'platform-feature-disabled',message:'Monthly usage hard limit exceeded'}}};
 expect(()=>requireProviderSuccess(result)).toThrowError(expect.objectContaining({code:'BUDGET_EXCEEDED',diagnostic:{detail:'PROVIDER_MONTHLY_USAGE_LIMIT',httpStatus:403}}));
 expect(()=>requireProviderSuccess({...result,json:{error:{type:'platform-feature-disabled',message:'Feature unavailable on this plan'}}})).toThrowError(expect.objectContaining({code:'AUTH_REQUIRED'}));
 expect(()=>requireProviderSuccess({...result,status:401})).toThrowError(expect.objectContaining({code:'AUTH_REQUIRED'}));
 expect(()=>requireProviderSuccess({...result,status:200,json:{items:[]}})).not.toThrow();
});
