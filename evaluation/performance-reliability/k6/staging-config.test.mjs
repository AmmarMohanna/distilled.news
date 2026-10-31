import {test} from 'node:test';import assert from 'node:assert/strict';
import {stagingConfiguration,campaignReports} from './staging-config.js';
import {verifyProtection} from './verify-staging-approval.mjs';
const approved={STAGING_ORIGIN:'https://distilled-news-staging.distillednews-platform.workers.dev',STAGING_AUTHORIZATION:'APPROVED_READ_ONLY',USAGE_PREFLIGHT:'VERIFIED',APPROVAL_ID:'approval',RUN_ID:'pilot-1',COMMIT_SHA:'a'.repeat(40),FEED_USER:'fixture',FEED_SLUG:'news',EDITION_ID:'edition-1'};
test('live profile requires explicit staging, usage evidence, budget and reproducible identities',()=>{
 assert.throws(()=>stagingConfiguration({}),/APPROVAL/);
 for(const patch of [{STAGING_ORIGIN:'https://distilled.news'},{USAGE_PREFLIGHT:'UNKNOWN'},{REQUEST_BUDGET:21},{STAGING_PROFILE:'stress'},{RUN_ID:'../x'}])assert.throws(()=>stagingConfiguration({...approved,...patch}));
 const c=stagingConfiguration(approved);assert.equal(c.options.scenarios.staging.vus,1);assert.equal(c.budget.maximumRequests,10);assert.equal(c.budget.mutationRequests,0);
});
test('authenticated reads require disposable account identity and never place credentials in reports',()=>{
 assert.throws(()=>stagingConfiguration({...approved,STAGING_PROFILE:'authenticated-read'}),/ACCOUNT/);
 const c=stagingConfiguration({...approved,STAGING_PROFILE:'authenticated-read',ISOLATED_ACCOUNT_ID:'private-owner',STAGING_SESSION_COOKIE:'secret-canary'});
 const reports=campaignReports(c,{metrics:{http_req_duration:{values:{'p(99)':12}}}});
 const json=reports['staging-performance.json'];assert.ok(!json.includes('secret-canary'));assert.ok(!json.includes('private-owner'));assert.ok(reports['staging-performance.html'].includes('not agent'));
});
test('a named GitHub environment without required reviewers is not approval',()=>{
 for(const value of [{},{protection_rules:[]},{protection_rules:[{type:'required_reviewers',reviewers:[]}]}])assert.throws(()=>verifyProtection(value),/REVIEWERS/);
 assert.doesNotThrow(()=>verifyProtection({protection_rules:[{type:'required_reviewers',reviewers:[{type:'User'}]}]}));
});
