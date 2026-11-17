import {verifyProtection} from '../k6/verify-staging-approval.mjs';
const repo=process.env.GITHUB_REPOSITORY;
if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo??''))throw Error('REPOSITORY_REQUIRED');
const r=await fetch('https://api.github.com/repos/'+repo+'/environments/agentops-multiuser-staging-approval',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('ENVIRONMENT_APPROVAL_NOT_VERIFIABLE');verifyProtection(await r.json());
