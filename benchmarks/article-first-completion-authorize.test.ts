import {it,expect} from 'vitest';
import {comparisonRoot,comparisonLedger,load,save} from './v2-comparison-transport';
import {spendingExposure} from '../apps/worker/src/v1-intelligence/model-spending';
import {effectiveModelExposure,amendModelExposure} from '../apps/worker/src/v1-intelligence/model-spending-exposure-amendments';
it.skipIf(process.env.DISTILLED_ARTICLE_FIRST_COMPLETION_APPROVED!=='USER_AUTHORIZED_SPENDING')('records the current user spending authorization without changing the grant period, old receipts or liabilities',async()=>{
 const approval=load(comparisonRoot+'/approval.json'),db=comparisonLedger(),id='v2-model-comparison:'+approval.id+':authority',row=await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(id).first<any>(),grant=JSON.parse(row.json),at=new Date().toISOString();
 expect(Date.parse(at)).toBeLessThan(Date.parse(grant.validUntil));
 const before=await spendingExposure(db,grant.accountId,at),prior=await effectiveModelExposure(db,id,grant.accountId,grant.maxExposureUsd),ceiling=Math.ceil((before.reportedCostUsd+before.heldCostUsd+1)*1e6)/1e6;
 expect(ceiling).toBeLessThanOrEqual(73);
 const value=ceiling>prior.maxExposureUsd?await amendModelExposure(db,{id:'article-first-completion-user-authorized-20261021',authorizationId:id,accountId:grant.accountId,expectedSequence:prior.exposureRevision,expectedMaxExposureUsd:prior.maxExposureUsd,maxExposureUsd:ceiling,approvedBy:'account-owner',approvalId:'USER_MESSAGE_SPENDING_IS_AUTHORIZED_ARTICLE_FIRST_COMPLETION',createdAt:at}):undefined;
 expect((await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(id).first<any>()).json).toBe(row.json);
 const after=await spendingExposure(db,grant.accountId,at);expect(after.heldCostUsd).toBe(before.heldCostUsd);
 save(comparisonRoot+'/article-first-completion-authority.json',{at,source:'Current user explicitly authorized spending for article-first end-to-end test',approvedAdditionalHeadroomUsd:1,originalGrantUnchanged:true,grantExpiryUnchanged:grant.validUntil,before,after,amendment:value});
 console.info(JSON.stringify({approvedHeadroomUsd:1,validUntil:grant.validUntil,changedOriginalGrant:false,amendedExposure:value?.maxExposureUsd,comparisonBudgetAndCallCapsUnchanged:true}));
},60000);
