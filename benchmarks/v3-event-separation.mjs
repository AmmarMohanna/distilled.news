import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const EVENT_SEPARATION = 'One briefing item must describe one distinct real-world development. Multiple sources reporting the SAME occurrence, decision or announcement belong together. Different occurrences, decisions or announcements remain separate, even if they concern the same country, company, conflict or topic. In particular, an event that already happened and a separate announcement about possible future events are not one development. Never combine different developments merely to shorten the briefing; prioritize or omit them independently.';
const EDITOR_RULE = '- Several articles about the same event become ONE item that cites all of them. Different events stay separate items even when the same company or person is involved. Use the "similar wording" hints only as a hint; judge by what actually happened.';
const CONSOLIDATE_RULE = '- Merge drafts only when they describe the very same event. Related announcements, follow-ups from the same company, or items that merely reference each other are DIFFERENT events: keep them as separate items (even if one of them is then cut). Never fold one event into another to save space. Write the merged body only from the drafts\' own text; add no fact that is not in them. Keep every distinct, material fact, attribution and hedge.';
export function candidate(system, stage) {
 const rule=stage==='editor'?EDITOR_RULE:stage==='consolidate'?CONSOLIDATE_RULE:null;
 if(!rule||system.split(rule).length!==2)throw Error('BASELINE_RULE_DRIFT');
 const replacement='- '+EVENT_SEPARATION+(stage==='consolidate'?" Write the merged body only from the drafts' own text; add no fact that is not in them. Keep every distinct, material fact, attribution and hedge.":' Use the "similar wording" hints only as a hint; judge by what actually happened.');
 return system.replace(rule,replacement);
}
/** Review aid for narrowly labelled single-development posts, never a semantic verdict. */
export function referenceReviewFlags(items, groups) {
 return items.flatMap((item,index)=>{
  const refs=item.sources??(item.from??[]).map(String);
  const known=[...new Set(refs.map(ref=>groups[ref]).filter(Boolean))];
  return known.length>1?[{index,refs,groups:known,requiresSourceReview:true}]:[];
 });
}
export function replay() {
 const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
 const old=read('benchmarks/results/v3-reader-notification/summary.json');
 const run=name=>old.results.find(r=>r.name===name);
 const output=name=>JSON.parse(run(name).response.text);
 const groups={S7:'qantara-explosion',S8:'qantara-explosion',S10:'baraachit-reported-strike',S13:'prospective-strike-announcement',S14:'edl-nonpayment-decision'};
 const merged=output('editor-reader-focused-ar'),separate=output('editor-baseline-en');
 const verifier=run('verify-baseline-ar');
 const itemsSection=verifier.request.messages[1].content.split('ITEMS TO CHECK:')[1];
 const exactMergedBody=merged.items.find(i=>i.sources.includes('S10')&&i.sources.includes('S13')).body;
 const consolidation=read('benchmarks/results/v3-prompt-tuning/results.json');
 const result={paidCalls:0,stage:'offline-recorded-replay',labels:'AI-assisted engineering labels checked against original retained posts; not independent human gold.',groupingIsNotFactuality:true,observedArabicGroupingFlags:referenceReviewFlags(merged.items,groups),baselineEnglishGroupingFlags:referenceReviewFlags(separate.items,groups),sameOccurrenceControl:referenceReviewFlags([{sources:['S7','S8']}],groups),verifierTrace:{file:'benchmarks/results/v3-reader-notification/summary.json',run:verifier.name,checkedItemNumbers:[...itemsSection.matchAll(/^#(\d+) /gm)].map(m=>Number(m[1])),mergedBodyPresentInCheckedItems:itemsSection.includes(exactMergedBody),conclusion:'The retained verifier checked four separate baseline items. This artifact does not establish verifier approval of the merged Arabic candidate.'},consolidationGroupingFlags:referenceReviewFlags(consolidation.results.find(r=>r.name==='consolidation-global-ranking').output.items,{'0':'efs-announcement','3':'barclays-adoption'}),baselineRequestHashes:old.results.map(r=>({name:r.name,requestSha256:r.requestSha256})),sourceHashes:old.sourceHashes};
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir='benchmarks/results/v3-event-separation';fs.mkdirSync(dir,{recursive:true});
 const baseline=JSON.parse(fs.readFileSync('benchmarks/prompts/v3-v1.json','utf8'));
 const systems={editor:candidate(baseline.systems.editor,'editor'),consolidate:candidate(baseline.systems.consolidate,'consolidate')};
 fs.writeFileSync(dir+'/offline-replay.json',JSON.stringify(replay(),null,2)+'\n');
 fs.writeFileSync(dir+'/candidate.json',JSON.stringify({status:'NOT_ACTIVE_NOT_MODEL_QUALIFIED',baseline:'v3-prompts-v1',variable:'Only replace event-grouping instruction; editor and consolidation tested separately.',instruction:EVENT_SEPARATION,systems,unchanged:['verifier','repair','reading budgets','compression','model routing','date semantics','history presentation','lead protection','JSON examples'],sha256:createHash('sha256').update(JSON.stringify(systems)).digest('hex')},null,2)+'\n');
 console.log(JSON.stringify(replay()));
}
