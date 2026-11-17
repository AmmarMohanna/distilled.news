/** GitHub environment protection is account configuration, not guaranteed by YAML. */
export function verifyProtection(document){
  if(!document?.protection_rules?.some(r=>r.type==='required_reviewers'&&r.reviewers?.length>0))throw Error('REQUIRED_ENVIRONMENT_REVIEWERS_MISSING');
}
if(process.argv[1]?.endsWith('verify-staging-approval.mjs')){
  try{
    const repo=process.env.GITHUB_REPOSITORY;
    if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo??''))throw Error('REPOSITORY_REQUIRED');
    const r=await fetch('https://api.github.com/repos/'+repo+'/environments/agentops-staging-readonly-approval',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('CANNOT_VERIFY_ENVIRONMENT_PROTECTION');verifyProtection(await r.json());
  }catch{process.stderr.write('Staging campaign blocked: environment approval could not be verified.\n');process.exitCode=1;}
}
