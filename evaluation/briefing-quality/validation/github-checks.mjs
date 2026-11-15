/** Read-only CI inspection; credentials stay in process memory. */
import{spawnSync}from'node:child_process';
const branch='research/evaluator-reliability',repo='AmmarMohanna/distilled.news';
const c=spawnSync('git',['-c','safe.directory=*','credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},windowsHide:true,timeout:30000});
const password=c.stdout?.match(/^password=(.+)$/m)?.[1]?.trim();const headers={'accept':'application/vnd.github+json','user-agent':'distilled-evaluation-research',...(password?{authorization:'Bearer '+password}:{})};
const r=await fetch(`https://api.github.com/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=30`,{headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('GITHUB_CHECKS_'+r.status);const j=await r.json();console.log(JSON.stringify({branch,runs:j.workflow_runs.map(v=>({id:v.id,name:v.name,sha:v.head_sha,status:v.status,conclusion:v.conclusion,url:v.html_url,createdAt:v.created_at}))}));
