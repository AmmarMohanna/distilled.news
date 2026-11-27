export const v5WorkbenchHtml = '<!doctype html>'+String.raw`
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>V5 editorial review</title>
<style>
body{font:1rem system-ui,sans-serif;max-width:78rem;margin:2rem auto;padding:0 1rem;color:#18221f;background:#fafbf8}
header,section{margin:1rem 0} h1,h2,h3{line-height:1.2} fieldset,details{margin:.6rem 0;padding:.65rem;border:1px solid #9fa9a3} label{display:block;margin:.35rem 0} input,select,textarea,button{font:inherit} textarea{width:100%;box-sizing:border-box} pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto} button{margin:.25rem 0;padding:.35rem .6rem} #layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:1.2rem} @media(max-width:750px){#layout{display:block}} a{color:#065d48}
</style><script src="/api/admin/v5-editor/workbench.js" defer></script></head>
<body><header><h1>V5 editorial review</h1><label>Feed ID <input id="feed" maxlength="300"></label>
<button id="find" type="button">Find windows</button><label>Review window <select id="windows"></select></label>
<button id="load" type="button">Open window</button><p id="status" role="status" aria-live="polite"></p></header>
<main id="review" hidden><p id="summary"></p><div id="layout">
<section><h2>Compose edition</h2><div id="stories"></div><button id="add" type="button">Add story</button>
<p id="words" aria-live="polite"></p><button id="save" type="button">Save exact copy</button>
<h3>Saved reader copy</h3><div id="preview"></div>
<label><input id="attest" type="checkbox"> I reviewed the exact saved text, checked every claim against the cited passages, and checked prior coverage.</label>
<button id="approve" type="button">Approve saved copy</button>
<button id="publish" type="button">Publish approved copy</button>
<label>Rejection reason <input id="reject-note" maxlength="1000"></label><button id="reject" type="button">Reject</button></section>
<section><h2>Model candidates</h2><div id="candidates"></div><h2>Original sources</h2><div id="sources"></div>
<h2>Reader history</h2><div id="history"></div><h2>Audit</h2><div id="audit"></div></section></div></main></body></html>`;

export const v5WorkbenchScript = String.raw`
'use strict';
const byId = id => document.getElementById(id);
const node = (tag, text) => { const element = document.createElement(tag); if(text!==undefined)element.textContent=text; return element; };
let feed, windowId, view, cards=[], dirty=false, busy=false;
const report = text => {byId('status').textContent=text;};
const path = () => '/api/admin/v5-editorial/'+encodeURIComponent(feed)+(windowId?'/'+encodeURIComponent(windowId):'');
async function api(url, payload) {
  const response=await fetch(url,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{});
  const value=await response.json();
  if(!response.ok)throw Error(value.error||'Request failed');
  return value;
}
function buttons(){
  const status=view?.state.status;
  byId('approve').disabled=busy||dirty||!view?.revision||status!=='editing'||!byId('attest').checked;
  byId('publish').disabled=busy||dirty||!view?.publicationEnabled||status!=='approved';
  byId('save').disabled=busy||!view||status==='published';
  byId('reject').disabled=busy||!view||status==='published'||!byId('reject-note').value.trim();
  byId('add').disabled=busy||status==='published';
}
async function run(work) {
  if(busy)return;
  busy=true;buttons();
  try{await work();}catch(error){report(error.message);}
  finally{busy=false;buttons();}
}
function details(label, text) {
  const element=node('details');
  element.append(node('summary',label),node('pre',text));
  return element;
}
function option(value,label) {const o=node('option',label);o.value=value;return o;}
function label(text,input){const l=node('label',text+' ');l.append(input);return l;}
function field(tag,value) {const element=node(tag);element.value=value??'';return element;}
function button(text,fn){const element=node('button',text);element.type='button';element.onclick=fn;return element;}
function edited(){
  dirty=true;byId('attest').checked=false;
  count();buttons();
}
function readStories(){
  return cards.map(card=>({
    headline:card.headline.value,body:card.body.value,relation:card.relation.value,
    ...(card.relation.value==='new'?{}:{updatesId:card.history.value}),
    support:card.bindings.map(binding=>({evidenceRevisionId:binding.source.value,quote:binding.quote.value})),
  }));
}
function count(){
  const segmenter=new Intl.Segmenter(view.language,{granularity:'word'});
  const words=readStories().reduce((sum,story)=>sum+[...segmenter.segment(story.headline)].filter(x=>x.isWordLike).length,0);
  byId('words').textContent=words+' headline words (target '+view.ceiling+')';
}
function addStory(story={}){
  const box=node('fieldset'),title=field('input',story.headline),body=field('textarea',story.body);
  title.maxLength=500;body.rows=4;
  title.dir='auto';body.dir='auto';
  const relation=node('select'),history=node('select'),bindings=node('div');
  relation.append(option('new','New'),option('update','Update'),option('correction','Correction'));
  relation.value=story.relation??'new';
  history.append(option('','Choose prior story'),...view.currentHistory.map(row=>option(row.id,row.headline)));
  history.value=story.updatesId??'';
  const hLabel=label('Prior story',history);
  hLabel.hidden=relation.value==='new';
  relation.onchange=()=>{hLabel.hidden=relation.value==='new';edited();};
  const card={box,headline:title,body,relation,history,bindings:[]};
  function addBinding(ref={}){
    const line=node('div'),source=node('select'),quote=field('textarea',ref.quote);
    quote.rows=3;quote.dir='auto';
    source.append(option('','Select source'),...view.sources.map(s=>option(s.id,s.title||s.id)));
    source.value=ref.evidenceRevisionId??'';
    const binding={source,quote};card.bindings.push(binding);
    line.append(label('Citation',source),label('Exact quoted passage',quote),button('Remove citation',()=>{
      card.bindings=card.bindings.filter(b=>b!==binding);line.remove();edited();
    }));
    bindings.append(line);
  }
  box.addEventListener('input',edited);
  box.append(label('Headline',title),label('Body',body),label('Relation',relation),hLabel,bindings,
    button('Add citation',()=>{addBinding();edited();}),button('Remove story',()=>{cards=cards.filter(c=>c!==card);box.remove();edited();}));
  for(const ref of story.support??[{}])addBinding(ref);
  cards.push(card);byId('stories').append(box);
}
function render(){
  const s=view.state;
  byId('review').hidden=false;dirty=false;cards=[];
  byId('attest').checked=false;byId('reject-note').value='';
  byId('summary').textContent=s.status+' · '+view.language+' · '+view.interests+
    (view.review.failure?' · '+view.review.failure:'')+(view.newerEdition&&s.status!=='published'?' · A newer edition is already published':'');
  for(const name of ['stories','preview','candidates','sources','history','audit'])byId(name).replaceChildren();
  for(const story of view.revision?.stories??[]) {
    addStory(story);
    const copy=node('article');
    copy.dir='auto';
    copy.append(node('h4',story.headline),node('p',story.body),
      ...story.support.map(s=>details((view.sources.find(x=>x.id===s.evidenceRevisionId)?.title||s.evidenceRevisionId),s.quote)));
    byId('preview').append(copy);
  }
  for(const event of view.candidates){
    if(event.failure)byId('candidates').append(node('p',event.stage+' · '+event.failure));
    for(const item of event.candidates??[]){
      const card=details(event.stage+' · '+item.headline,item.body);
      card.append(button('Edit this story',()=>{addStory({...item,support:item.sourceIds.map(evidenceRevisionId=>({evidenceRevisionId}))});edited();}));
      byId('candidates').append(card);
    }
    for(const reason of event.reasons??[])byId('candidates').append(details(reason.headline,reason.reason));
  }
  if(view.result){
    for(const dropped of [...view.result.dropped,...view.result.omitted]) {
      byId('candidates').append(details(dropped.headline||'Editorial exclusion',dropped.reason));
    }
  }
  for(const source of view.sources){
    const card=details(source.title||source.id,source.text);
    card.append(node('p',source.id+' · '+source.publishedAt));
    if(source.url)try{const url=new URL(source.url);if(['http:','https:'].includes(url.protocol)){
      const link=node('a','Original article');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';card.append(link);
    }}catch{}
    byId('sources').append(card);
  }
  for(const prior of view.currentHistory)byId('history').append(details(prior.headline,prior.body));
  byId('audit').append(details('Decisions, revisions, and provider usage',JSON.stringify({
    decisions:view.decisions,revisions:view.revisions,usage:view.usage,publishedDigest:s.publishedDigest,
  },null,2)));
  for(const op of view.operations)if(op.originalWriterReply)byId('audit').append(details('Original writer reply',op.originalWriterReply));
  if(s.status==='published'){
    for(const field of byId('review').querySelectorAll('#stories input,#stories textarea,#stories select,#stories button,#candidates button'))field.disabled=true;
  }
  count();buttons();
}
async function refresh(){
  view=await api(path());render();
  report('Review window loaded');
}
async function act(action,fields){
  const result=await api(path(),{action,version:view.state.version,...fields});
  await refresh();report('Edition '+result.status);
}
byId('find').onclick=()=>run(async()=>{
  if(dirty&&!confirm('Discard unsaved changes?'))return;
  feed=byId('feed').value.trim();windowId=undefined;view=null;dirty=false;byId('review').hidden=true;
  const rows=await api(path());
  byId('windows').replaceChildren(...rows.map(row=>option(row.id,row.openedAt+' · '+row.status)));
  report(rows.length?rows.length+' windows':'No review windows');
});
byId('load').onclick=()=>run(async()=>{
  if(dirty&&!confirm('Discard unsaved changes?'))return;
  windowId=byId('windows').value;
  if(windowId)await refresh();
});
byId('add').onclick=()=>{addStory();edited();};
byId('save').onclick=()=>run(()=>act('save',{stories:readStories(),historyDigest:view.historyDigest}));
byId('attest').onchange=buttons;byId('reject-note').oninput=buttons;
byId('approve').onclick=()=>run(()=>act('approve',{digest:view.revision.digest,attested:byId('attest').checked}));
byId('publish').onclick=()=>run(async()=>{
  if(confirm('Publish this exact approved edition and queue delivery?'))await act('publish',{digest:view.revision.digest});
});
byId('reject').onclick=()=>run(()=>act('reject',{note:byId('reject-note').value}));
buttons();
`;
