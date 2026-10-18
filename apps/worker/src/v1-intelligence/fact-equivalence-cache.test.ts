import {afterEach,expect,it,vi} from 'vitest';
import {equivalentFact,createFactEquivalence} from './editorial';

// Frozen pre-optimization semantics. This is a differential oracle, not another
// production implementation or a relaxed lexical/semantic quality policy.
function retainedEquivalent(a:string,b:string):boolean {
 const aliases:Record<string,string>={ads:'advertisement',advertisements:'advertisement',laws:'law'};
 const modal:Record<string,string>={may:'possible',might:'possible',could:'possible',possibly:'possible',reportedly:'reported',allegedly:'alleged',alleged:'alleged'};
 const drop=new Set(['the','a','an']),normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 if(normalized(a)===normalized(b))return true;
 const quantities=(s:string)=>JSON.stringify(normalized(s).match(/\b\d+(?:[.,]\d+)*%?\b/g)??[]);
 const qualifiers=(s:string)=>JSON.stringify([...new Set((normalized(s).match(/\b(?:not|no|never|without|may|might|could|possibly|expected|alleged|allegedly|reportedly|unconfirmed|unresolved|estimated|more than|less than|at least|up to)\b/g)??[]).map(q=>modal[q]??q))].sort());
 if(quantities(a)!==quantities(b)||qualifiers(a)!==qualifiers(b))return false;
 const words=(s:string)=>(normalized(s).match(/[\p{L}\p{N}]+|[^\s]/gu)??[]).map(w=>modal[w]?'<'+modal[w]+'>':aliases[w]??w).filter(w=>!drop.has(w));
 return JSON.stringify(words(a).filter(x=>!/^[.!?]$/.test(x)))===JSON.stringify(words(b).filter(x=>!/^[.!?]$/.test(x)));
}
afterEach(()=>vi.restoreAllMocks());
const inputs=['','  ','A passed the law.','A passes the law.','The law passed A.','The law may pass.','The law might pass.','The law will pass.','The law did not pass.','The law did pass.','Officials confirmed 100 cases.','Officials confirmed 101 cases.','Officials confirmed at least 100 cases.','Officials confirmed up to 100 cases.','Officials estimated 100 cases.','Officials confirmed 1.2 cases.','Officials confirmed 12 cases.','Officials confirmed -10 cases.','Officials confirmed +10 cases.','A paid B $100; B paid A $200.','A paid B $200; B paid A $100.','Publisher A said: "Officials approved it."','Publisher B said: "Officials approved it."','Officials approved it (reportedly).','Officials approved it.','ALLEGED officials approved it.','allegedly officials approved it.','The company sold ads.','A company sold advertisements.','The company approved laws.','The company approved law.','Café officials approved it.','Cafe\u0301 officials approved it.','Ｆｕｌｌｗｉｄｔｈ １００ cases.','Fullwidth 100 cases.','مصدر أعلن 100 حالة.','مصدر نفى 100 حالة.','📰 Official approved it.','⚠ Official approved it.','A reported unresolved issues.','A reported resolved issues.'];
it('preserves every frozen decision across numbers, qualifiers, tense, attribution, order and Unicode',()=>{
 const cached=createFactEquivalence();for(const a of inputs)for(const b of inputs){const expected=retainedEquivalent(a,b);expect(equivalentFact(a,b)).toBe(expected);expect(cached(a,b)).toBe(expected)}
});
it('normalizes each immutable input once within an operation rather than on every pair',()=>{
 const normalize=vi.spyOn(String.prototype,'normalize'),cached=createFactEquivalence();
 const facts=Array.from({length:30},(_,i)=>'Official'+String.fromCharCode(65+i)+' reported the same kind of development affecting 100 people.');
 for(const a of facts)for(const b of facts)cached(a,b);
 expect(normalize).toHaveBeenCalledTimes(facts.length);
});
it('fresh operations and changed text never inherit an earlier comparison result',()=>{
 const a='Officials approved a reform.',b='Officials approved the reform.',changed='Officials rejected the reform.';
 const first=createFactEquivalence();expect(first(a,b)).toBe(true);expect(first(a,changed)).toBe(false);
 const normalize=vi.spyOn(String.prototype,'normalize');expect(createFactEquivalence()(a,b)).toBe(true);expect(normalize).toHaveBeenCalledTimes(2);
});
it('cache pressure and oversized text only recompute exact semantics',()=>{
 const cached=createFactEquivalence(),a='Officials may approve the law.',b='Officials might approve a law.';
 expect(cached(a,b)).toBe(true);
 for(let i=0;i<3000;i++)cached('Independent observation '+i+' '+('Retained source context. '.repeat(20)),'Another independent observation '+i);
 expect(cached(a,b)).toBe(retainedEquivalent(a,b));
 const long='Retained source context. '.repeat(20000);expect(cached(long,long+'!')).toBe(retainedEquivalent(long,long+'!'));
});
it('benchmarks identical long-fact pair comparisons without model/provider timing',()=>{
 const facts=Array.from({length:70},(_,i)=>'Officeholder'+String.fromCharCode(65+i)+' reported '+('a supported development affecting 100 people with unchanged certainty and attribution. '.repeat(8)));
 const times={baseline:[] as number[],cached:[] as number[]};let reference:number|undefined;
 for(let sample=0;sample<5;sample++)for(const mode of (sample%2?['cached','baseline']:['baseline','cached']) as ('baseline'|'cached')[]){
  const compare=mode==='baseline'?retainedEquivalent:createFactEquivalence(),started=performance.now();let matches=0;
  for(const a of facts)for(const b of facts)if(compare(a,b))matches++;
  times[mode].push(performance.now()-started);reference??=matches;expect(matches).toBe(reference);
 }
 for(const [mode,values] of Object.entries(times)){values.sort((a,b)=>a-b);console.info(JSON.stringify({type:'V1_FACT_EQUIVALENCE_BENCHMARK',mode,facts:facts.length,pairs:facts.length**2,samples:5,p50Ms:values[2],p95Ms:values[4],providerCalls:0}))}
},30000);
