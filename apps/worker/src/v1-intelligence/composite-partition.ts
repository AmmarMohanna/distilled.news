import {tokens} from './policies';
import type {ClaimMention} from './claims';
/** A publisher boundary the source itself states between two items ("Separately, ...", "Meanwhile, ..."). */
const TOPIC_SHIFT=/^(?:separately|meanwhile|in (?:other|unrelated|separate) news|elsewhere|in a (?:separate|second|different) (?:announcement|development|move|story)|on a (?:separate|different) (?:note|front)|also (?:today|this week))\b/i;
const GENERIC=new Set('said says say now can will would also its their this that these those has have had been being are was were not but while after before about over under into than then when where which who what with from for and the'.split(' '));
const content=(text:string)=>new Set(tokens(text).filter(t=>t.length>2&&!GENERIC.has(t)));
export interface ProvisionalPartition {groups:string[][];backgroundMentionIds:string[]}
/** Conservative split of ONE source's news mentions into separate provisional developments, used only when no semantic construction exists.
 * It requires an explicit publisher topic-shift boundary AND near-disjoint content, so a coherent development is never split by wording alone.
 * A title that bridges two segments is kept as background (its content is carried by the segment sentences). It never asserts identity:
 * every group stays DEFER/provisional and semantic reassessment may regroup it. */
export function partitionProvisionalMentions(newsMentions:Pick<ClaimMention,'id'|'sourceText'|'span'>[]):ProvisionalPartition|undefined {
 const body=newsMentions.filter(m=>m.span.field==='body').sort((a,b)=>a.span.start-b.span.start),titles=newsMentions.filter(m=>m.span.field==='title');
 const segments:typeof body[]=[];
 for(const m of body){if(!segments.length||TOPIC_SHIFT.test(m.sourceText.trim()))segments.push([m]);else segments[segments.length-1].push(m)}
 if(segments.length<2)return undefined;
 const bags=segments.map(s=>content(s.map(m=>m.sourceText.replace(TOPIC_SHIFT,'')).join(' ')));
 // Near-disjoint: any two segments may share at most one content word (typically the publisher's or company's name).
 for(let i=0;i<bags.length;i++)for(let j=i+1;j<bags.length;j++)if([...bags[i]].filter(t=>bags[j].has(t)).length>1)return undefined;
 const groups=segments.map(s=>s.map(m=>m.id)),background:string[]=[];
 for(const title of titles){
  const bag=content(title.sourceText),shared=new Set(bags.flatMap((b,i)=>bags.slice(i+1).flatMap(o=>[...b].filter(t=>o.has(t))))),hits=bags.map(b=>[...bag].filter(t=>b.has(t)&&!shared.has(t)).length);
  const matched=hits.flatMap((n,i)=>n>0?[i]:[]);
  if(matched.length>1)background.push(title.id);else groups[matched[0]??0].unshift(title.id);
 }
 return {groups,backgroundMentionIds:background};
}
