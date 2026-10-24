import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {utcMillis} from './metrics.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const add=(object,key)=>{object[key]=(object[key]??0)+1;};

/** Read-only mechanical audit. It does not assign a split, infer developments,
 * create human labels, publish article text or execute any pipeline/provider. */
export async function auditDataset(manifestPath) {
  const bytes=await fs.readFile(manifestPath),manifest=JSON.parse(bytes),root=path.dirname(path.resolve(manifestPath));
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.files)||!Array.isArray(manifest.tracks))throw Error('UNSUPPORTED_DATASET_MANIFEST');
  const frozenAt=utcMillis(manifest.frozenAt);
  const ids=new Map(),urls=new Map(),texts=new Map(),feeds=new Set(),files=new Set();
  const languages={},durations={},sourceTypes={},completeness={};
  let occurrences=0,empty=0;
  const tracks=new Map();
  for(const entry of manifest.files) {
    if(typeof entry.file!=='string'||files.has(entry.file))throw Error('INVALID_OR_DUPLICATE_CASE_FILE');
    files.add(entry.file);
    const filename=path.resolve(root,entry.file),relative=path.relative(root,filename);
    if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('CASE_OUTSIDE_DATASET');
    const raw=await fs.readFile(filename);
    if(sha(raw)!==entry.sha256)throw Error('CASE_HASH_MISMATCH');
    const c=JSON.parse(raw),start=utcMillis(c.windowStart),end=utcMillis(c.windowEnd);
    if(!Array.isArray(c.articles)||![30,60,120].includes(c.intervalMinutes)||(end-start)!==c.intervalMinutes*60000)throw Error('INVALID_CASE');
    if(end>frozenAt||c.provenance?.freezeAt!==manifest.frozenAt)throw Error('CASE_FREEZE_MISMATCH');
    if(c.articles.length!==entry.articles||c.feedId!==entry.feedId||c.windowStart!==entry.windowStart||c.windowEnd!==entry.windowEnd||c.intervalMinutes!==entry.intervalMinutes)throw Error('MANIFEST_CASE_MISMATCH');
    if(!['en','ar','fr'].includes(c.language))throw Error('INVALID_CASE_LANGUAGE');
    if(c.provenance.trackId!==entry.trackId||c.provenance.sequenceIndex!==entry.sequenceIndex)throw Error('MANIFEST_TRACK_MISMATCH');
    const sequence=tracks.get(entry.trackId)??[];sequence.push(c);tracks.set(entry.trackId,sequence);
    feeds.add(c.feedId);add(languages,c.language);add(durations,String(c.intervalMinutes));
    if(!c.articles.length)empty++;
    const inCase=new Set();
    for(const a of c.articles) {
      if(typeof a.id!=='string'||!a.id||inCase.has(a.id)||typeof a.text!=='string')throw Error('INVALID_OR_DUPLICATE_ARTICLE');
      inCase.add(a.id);
      const available=utcMillis(a.availableAt);
      if(available<start||available>=end)throw Error('ARTICLE_OUTSIDE_WINDOW');
      const textHash=sha(a.text);
      if(textHash!==a.provenance?.textSha256)throw Error('ARTICLE_TEXT_HASH_MISMATCH');
      const fingerprint=sha(JSON.stringify([a.sourceId,a.sourceType,a.url,a.publishedAt,a.acquiredAt,a.availableAt,textHash]));
      if(ids.has(a.id)&&ids.get(a.id)!==fingerprint)throw Error('UNSTABLE_ACQUIRED_ID');
      ids.set(a.id,fingerprint);occurrences++;add(sourceTypes,a.sourceType??'null');add(completeness,a.contentCompleteness??'null');
      for(const [map,key] of [[urls,a.url],[texts,textHash]])if(key){const seen=map.get(key)??new Set();seen.add(c.feedId);map.set(key,seen);}
    }
  }
  const trackIds=new Set();
  for(const track of manifest.tracks) {
    if(trackIds.has(track.id)||!tracks.has(track.id))throw Error('INVALID_TRACK_MANIFEST');
    trackIds.add(track.id);
    const sequence=tracks.get(track.id).sort((a,b)=>a.provenance.sequenceIndex-b.provenance.sequenceIndex);
    sequence.forEach((c,i)=>{
      if(c.feedId!==track.feedId||c.provenance.sequenceIndex!==i||(i>0&&sequence[i-1].windowEnd!==c.windowStart))throw Error('BROKEN_CHRONOLOGICAL_TRACK');
    });
  }
  if(trackIds.size!==tracks.size)throw Error('UNDECLARED_TRACK');
  const summary={manifestSha256:sha(bytes),windows:manifest.files.length,tracks:tracks.size,feeds:feeds.size,
    distinctAcquiredIds:ids.size,articleOccurrences:occurrences,emptyWindows:empty,languages,durations,
    sourceTypeOccurrences:sourceTypes,completenessOccurrences:completeness,
    exactUrlsSharedAcrossFeeds:[...urls.values()].filter(s=>s.size>1).length,
    exactTextHashesSharedAcrossFeeds:[...texts.values()].filter(s=>s.size>1).length,
    missingInitialHistoryTracks:manifest.tracks.filter(t=>t.initialHistory===null).length,
    semanticLeakageAssessment:'not established by exact URL/hash checks',
    validation:'case hashes, text hashes, acquired-ID consistency, interval membership and chronological tracks checked',
    splitQualification:'not established by mechanical matching; human review and semantic independence not assessed'};
  return {summary,ids};
}

async function main(){
  const [pilotPath,extendedPath]=process.argv.slice(2);
  if(!pilotPath||!extendedPath)throw Error('Usage: node evaluation/performance-reliability/audit-corpus.mjs PILOT_MANIFEST EXTENDED_MANIFEST');
  const pilot=await auditDataset(pilotPath),extended=await auditDataset(extendedPath);
  let overlap=0;
  for(const [id,fingerprint] of pilot.ids)if(extended.ids.has(id)){
    if(extended.ids.get(id)!==fingerprint)throw Error('CONFLICTING_SHARED_ACQUIRED_RECORD');
    overlap++;
  }
  console.log(JSON.stringify({pilot:pilot.summary,extended:extended.summary,
    overlap:{distinctAcquiredIds:overlap,pilotFraction:pilot.ids.size?overlap/pilot.ids.size:null,
      mechanicallyDisjoint:overlap===0,independentHeldOut:overlap?false:null,
      reason:overlap?'Overlapping acquisitions cannot constitute independent held-out sets.':'No exact-ID overlap found; semantic independence and human review remain unassessed.'}},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
