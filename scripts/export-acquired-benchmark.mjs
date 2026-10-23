import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const hash = value => createHash('sha256').update(value).digest('hex');
const accepted = new Set(['PROMOTED_NEW_REVISION', 'REPLAY_CURRENT_CONTENT']);
export function articleFromRecord(row) {
  const a=row.acquired, o=row.input?.observation;
  if(typeof a.body!=='string')throw Error('ACQUIRED_BODY_MISSING:'+a.id);
  return {
    id:a.id, sourceId:a.sourceId??o?.sourceId??null, sourceType:row.sourceType??null,
    title:a.title??null, url:a.canonicalUrl??o?.canonicalUrl??null,
    publishedAt:a.publishedAt??null, acquiredAt:a.acquiredAt??null,
    availableAt:accepted.has(row.receipt?.decision)?row.receipt.decidedAt??null:null,
    text:a.body, contentCompleteness:a.contentCompleteness??null,
    provenance:{feedSourceId:row.feedSourceId,sourceObservationId:a.sourceObservationId,
      evidenceRevisionId:row.receipt?.resultingRevisionId??null,
      observation:o??null,acceptanceReceipt:row.receipt??null,
      acquisitionMethod:a.acquisitionMethod??null,acquisitionProvider:a.acquisitionProvider??null,
      quality:a.quality??null,extraction:a.provenance??null,
      representation:a.representation??null,textSha256:hash(a.body),
      availableAtBasis:accepted.has(row.receipt?.decision)?'evidence_acceptance_receipt.decidedAt':null}
  };
}

export function buildCase(snapshot, spec) {
  const start=Date.parse(spec.windowStart),end=Date.parse(spec.windowEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||![30,60,120].includes((end-start)/60000))throw Error('INVALID_WINDOW');
  if(end>Date.parse(snapshot.frozenAt))throw Error('WINDOW_NOT_CLOSED_AT_FREEZE');
  const versions=snapshot.versions.filter(v=>v.feed_id===spec.feedId)
    .sort((a,b)=>Date.parse(a.value.updatedAt)-Date.parse(b.value.updatedAt)||a.revision-b.revision);
  const version=versions.filter(v=>Date.parse(v.value.updatedAt)<=start).at(-1);
  if(!version)throw Error('NO_HISTORICAL_FEED_PROFILE:'+spec.feedId);
  const feed=version.value;
  if(!['en','ar','fr'].includes(feed.outputLanguage))throw Error('UNSUPPORTED_FEED_LANGUAGE');
  const profile=feed.interests.join('\n');
  if(versions.some(v=>Date.parse(v.value.updatedAt)>start&&Date.parse(v.value.updatedAt)<end&&
    (v.value.interests.join('\n')!==profile||v.value.outputLanguage!==feed.outputLanguage)))throw Error('FEED_PROFILE_CHANGED_WITHIN_WINDOW');
  const articles=snapshot.records.filter(r=>r.acquired.feedId===spec.feedId).map(articleFromRecord)
    .filter(a=>a.availableAt!==null&&Date.parse(a.availableAt)>=start&&Date.parse(a.availableAt)<end)
    .sort((a,b)=>a.availableAt.localeCompare(b.availableAt)||a.id.localeCompare(b.id));
  if(new Set(articles.map(a=>a.id)).size!==articles.length)throw Error('DUPLICATE_ACQUIRED_ID');
  const fetchRuns=snapshot.runs.filter(r=>r.feed_id===spec.feedId&&Date.parse(r.started_at)>=start&&Date.parse(r.started_at)<end);
  return {feedId:spec.feedId,interestProfile:profile,language:feed.outputLanguage,
    windowStart:spec.windowStart,windowEnd:spec.windowEnd,intervalMinutes:(end-start)/60000,articles,
    provenance:{feedRevision:version.revision,feedTitle:feed.title,freezeAt:snapshot.frozenAt,
      windowBasis:'availability_replay_grid_not_historical_scheduler_windows',
      intervalConvention:'[windowStart,windowEnd)',fetchRunsStartedInWindow:fetchRuns.length,
      emptyMeaning:articles.length===0?'No retained accepted acquisitions became available; does not prove healthy collection or no real-world news.':null,
      trackId:spec.trackId,sequenceIndex:spec.sequenceIndex}};
}

// Preserve nulls in the dataset; adapt only at the existing BriefingInput boundary.
export function toBriefingInput(value, prior=[]) {
  return {feed:{interest:value.interestProfile,language:value.language,windowMinutes:value.intervalMinutes},
    articles:value.articles.map(a=>({id:a.id,source:a.sourceId??a.provenance.feedSourceId,
      title:a.title??undefined,url:a.url??undefined,publishedAt:a.publishedAt??'',text:a.text})),
    prior,windowStart:value.windowStart,windowEnd:value.windowEnd};
}

async function main() {
  const [snapshotFile,planFile,outArg]=process.argv.slice(2);
  if(!snapshotFile||!planFile||!outArg)throw Error('Usage: node scripts/export-acquired-benchmark.mjs SNAPSHOT PLAN PRIVATE_OUTPUT');
  const out=path.resolve(outArg);
  execFileSync('git',['check-ignore','--quiet',path.join(out,'content.json')]);
  const snapshotBytes=await fs.readFile(snapshotFile),snapshot=JSON.parse(snapshotBytes);
  const plan=JSON.parse(await fs.readFile(planFile,'utf8'));
  await fs.mkdir(out,{recursive:false});
  const manifest={schemaVersion:1,frozenAt:snapshot.frozenAt,snapshotSha256:hash(snapshotBytes),
    assignment:'Accepted acquisition receipt time, half-open UTC windows; no relevance filtering or story deduplication.',
    tracks:[],files:[],limitations:plan.limitations??[]};
  for(const track of plan.tracks) {
    const windows=track.windows.map(w=>({...w,feedId:track.feedId,trackId:track.id}))
      .sort((a,b)=>a.windowStart.localeCompare(b.windowStart));
    if(windows.some((w,i)=>i>0&&w.windowStart!==windows[i-1].windowEnd))throw Error('NONCONSECUTIVE_TRACK:'+track.id);
    const seed=snapshot.history.filter(h=>h.feed_id===track.feedId&&h.kind==='v3_window_inputs'&&
      h.value.input.windowStart<=windows[0].windowStart)
      .sort((a,b)=>a.value.input.windowStart.localeCompare(b.value.input.windowStart)).at(-1);
    const prior=(seed?.value.input.prior??[]).filter(p=>Date.parse(p.at)<Date.parse(windows[0].windowStart));
    manifest.tracks.push({id:track.id,feedId:track.feedId,initialHistory:seed?prior:null,
      initialHistoryBasis:seed?'retained_product_v3_input_prior':'no_retained_published_history',
      replay:'Start each track independently; pass actual generated published reader text into subsequent windows.'});
    for(const [sequenceIndex,spec] of windows.entries()) {
      const value=buildCase(snapshot,{...spec,sequenceIndex});
      const filename=track.id+'_'+spec.windowStart.replace(/[:.]/g,'-')+'.json';
      const bytes=JSON.stringify(value,null,2)+'\n';
      await fs.writeFile(path.join(out,filename),bytes,{flag:'wx'});
      manifest.files.push({file:filename,sha256:hash(bytes),feedId:value.feedId,trackId:track.id,
        sequenceIndex,windowStart:value.windowStart,windowEnd:value.windowEnd,intervalMinutes:value.intervalMinutes,
        articles:value.articles.length,characters:value.articles.reduce((n,a)=>n+a.text.length,0)});
    }
  }
  const unavailable=snapshot.records.filter(r=>articleFromRecord(r).availableAt===null);
  const unassignedBytes=JSON.stringify(unavailable,null,2);
  await fs.writeFile(path.join(out,'unassigned-acquisitions.json'),unassignedBytes);
  manifest.unassigned={file:'unassigned-acquisitions.json',records:unavailable.length,sha256:hash(unassignedBytes),
    reason:'No established intelligence-availability time; preserved without guessing or dropping text.'};
  manifest.files.sort((a,b)=>a.windowStart.localeCompare(b.windowStart)||a.trackId.localeCompare(b.trackId));
  await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({out,windows:manifest.files.length,articleOccurrences:manifest.files.reduce((n,f)=>n+f.articles,0),unassigned:unavailable.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
