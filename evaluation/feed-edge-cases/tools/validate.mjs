// Checks every scenario for broken references, bad times and uncovered cases.
// Usage: node evaluation/feed-edge-cases/tools/validate.mjs
import {loadCases,loadScenarios,loadWorld,materialize,SOURCE_TYPES} from './lib.mjs';

export const CHECK_TYPES=new Set(['edition','editionCount','fingerprintSkip','duplicateOf','notDuplicate','sameStory','separateStories',
  'notRetold','correction','noStory','inWindow','freshness','dateNotTrusted','windowNotHeld','timeFramed','deferred','supersededInto',
  'deferredCoverage','seenOnce','excerptOnly','attributed','corroboration','hedged','deleted']);
const DURATIONS=new Set([30,60,120,360,720,1440]);

export function validate(){
  const errors=[],world=loadWorld(),cases=loadCases(),caseIds=new Set(cases.map(c=>c.id)),scenarios=loadScenarios();
  const covered=new Map([...caseIds].map(id=>[id,{scenario:false,check:false}]));
  const seenIds=new Set();
  for(const scenario of scenarios){
    const fail=message=>errors.push(`${scenario.file}: ${message}`);
    if(`${scenario.id}.json`!==scenario.file)fail(`id ${scenario.id} does not match the file name`);
    if(seenIds.has(scenario.id))fail('duplicate scenario id');seenIds.add(scenario.id);
    if(!world.feeds[scenario.feed])fail(`unknown feed ${scenario.feed}`);
    if(!DURATIONS.has(scenario.schedule?.durationMinutes))fail(`unsupported durationMinutes ${scenario.schedule?.durationMinutes}`);
    if(!Number.isInteger(scenario.windows)||scenario.windows<1)fail('windows must be a positive integer');
    for(const id of scenario.cases??[]){if(!caseIds.has(id))fail(`unknown case ${id}`);else covered.get(id).scenario=true}
    const sourceKeys=new Set();
    for(const source of scenario.sources??[]){
      if(sourceKeys.has(source.key))fail(`duplicate source ${source.key}`);sourceKeys.add(source.key);
      if(!SOURCE_TYPES.includes(source.type))fail(`source ${source.key}: unknown type ${source.type}`);
      if(!world.publishers[source.publisher])fail(`source ${source.key}: unknown publisher ${source.publisher}`);
    }
    let items;
    try {items=materialize(scenario)} catch(error){fail(error.message);continue}
    const byId=new Map(),end=scenario.windows*scenario.schedule.durationMinutes*60_000,keys=new Map();
    for(const item of items){
      const where=`item ${item.id}`;
      if(byId.has(item.id))fail(`${where}: duplicate id`);byId.set(item.id,item);
      if(!sourceKeys.has(item.source))fail(`${where}: unknown source ${item.source}`);
      if(item.publisher&&!world.publishers[item.publisher])fail(`${where}: unknown publisher ${item.publisher}`);
      if(item.appearsAtMs<0||item.appearsAtMs>=end)fail(`${where}: appearsAt ${item.appearsAt} is outside the ${scenario.windows} window(s)`);
      if(item.op!=='delete'&&!item.body?.trim())fail(`${where}: empty body`);
      if(!['upsert','delete'].includes(item.op))fail(`${where}: op must be upsert or delete`);
      if(item.editOf){
        const base=byId.get(item.editOf);
        if(!base)fail(`${where}: editOf ${item.editOf} must come earlier`);
        else {
          if(base.source!==item.source)fail(`${where}: editOf must be on the same source`);
          if(base.appearsAtMs>=item.appearsAtMs)fail(`${where}: an edit must appear after what it edits`);
        }
      }
      if((item.variantOf||item.editOf||item.op==='delete')&&!item.change)fail(`${where}: say what changed in "change"`);
      // Same key on one source is only allowed for edits of that item.
      const key=`${item.source}|${item.guid??item.url}`;
      if(!item.editOf&&keys.has(key))fail(`${where}: same guid/link as ${keys.get(key)} without editOf`);
      if(!item.editOf)keys.set(key,item.id);
    }
    const itemExists=ref=>ref.endsWith('*')?items.some(i=>i.id.startsWith(ref.slice(0,-1))):byId.has(ref);
    for(const [n,check] of (scenario.checks??[]).entries()){
      const where=`check ${n+1} (${check.type})`;
      if(!CHECK_TYPES.has(check.type))fail(`${where}: unknown check type`);
      if(!check.cases?.length)fail(`${where}: list the cases it tests`);
      for(const id of check.cases??[]){
        if(!(scenario.cases??[]).includes(id))fail(`${where}: case ${id} is not in the scenario's cases`);
        else covered.get(id).check=true;
      }
      for(const ref of [check.item,check.of,...(check.items??[]),...(check.by??[])].filter(Boolean))if(!itemExists(ref))fail(`${where}: unknown item ${ref}`);
      for(const w of [check.window,check.into,check.carriedTo,...(check.windows??[])].filter(w=>w!==undefined))
        if(!Number.isInteger(w)||w<1||w>scenario.windows)fail(`${where}: window ${w} is outside 1..${scenario.windows}`);
      if(check.type==='edition'&&check.outcome&&!['PUBLISHED','QUIET'].includes(check.outcome))fail(`${where}: outcome must be PUBLISHED or QUIET`);
    }
  }
  for(const [id,state] of covered){
    if(!state.scenario)errors.push(`case ${id} is not covered by any scenario`);
    else if(!state.check)errors.push(`case ${id} has no check`);
  }
  return {errors,scenarios,cases};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const {errors,scenarios,cases}=validate();
  if(errors.length){console.error(errors.map(e=>`✗ ${e}`).join('\n'));process.exit(1)}
  const items=scenarios.reduce((sum,s)=>sum+materialize(s).length,0);
  console.log(`✓ ${scenarios.length} scenarios, ${items} items, all ${cases.length} cases covered by at least one check`);
}
