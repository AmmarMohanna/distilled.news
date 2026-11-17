import {readFileSync,statSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {utcMillis} from '../evaluation/performance-reliability/metrics.mjs';
import {projectSnapshots,prometheus} from './agentops-snapshot.mjs';
/** Local textfile bridge only: no API access, public listener, provider or credential. */
export function exportTextfile(files,output,now=Date.now()){
 const target=resolve(output),normalize=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
 if(!target.endsWith('.prom')||files.some(f=>normalize(f)===normalize(target)))throw Error('SAFE_PROM_OUTPUT_REQUIRED');
 const temporary=target+'.'+randomUUID()+'.tmp';
 const replace=text=>{writeFileSync(temporary,text,{encoding:'utf8',mode:0o600,flag:'wx'});renameSync(temporary,target);};
 try{
  if(!files.length||files.length>1000)throw Error('BOUNDED_INPUT_REQUIRED');
  let bytes=0;for(const f of files){const size=statSync(f).size;bytes+=size;if(size>20000000||bytes>50000000)throw Error('INPUT_TOO_LARGE');}
  const pages=files.map(f=>JSON.parse(readFileSync(f,'utf8')));
  const times=pages.map(p=>utcMillis(p.observedAt));
  if(!Number.isFinite(now)||times.some(t=>t>now||now-t>300000))throw Error('STALE_OR_FUTURE_SNAPSHOT');
  const snapshot=projectSnapshots(pages);
  snapshot.values.observer_up=1;snapshot.values.snapshot_observed_timestamp_seconds=Math.min(...times)/1000;snapshot.values.projection_timestamp_seconds=now/1000;
  replace(prometheus(snapshot));return snapshot;
 }catch(error){
  try{unlinkSync(temporary);}catch{}
  // Replacement removes old application gauges, so observer failure cannot leave a healthy snapshot.
  replace('# TYPE distilled_observer_up gauge\ndistilled_observer_up 0\n');throw error;
 }finally{try{unlinkSync(temporary);}catch{}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [output,...files]=process.argv.slice(2);if(!output)throw Error('OUTPUT_REQUIRED');exportTextfile(files,output);}
 catch{process.stderr.write('AgentOps export failed; inspect private input/freshness locally.\n');process.exitCode=1;}
}
