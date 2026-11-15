import {expect,it} from 'vitest';
import {reviewWording} from '../src/wording-review';
import {UsageMeter} from '../src/model';
import {scripted} from './helpers';
import type {PreparedArticle} from '../src/prepare';
const sources=[{ref:'S1',text:'The field could be one of the most varied in history.'},{ref:'S2',text:'A different event set an unprecedented record.'}] as PreparedArticle[];
const items=[{headline:'An unprecedented field',body:'',refs:['S1']}];
const result=(sourceQuotes:string[],wording='unprecedented')=>({results:[{i:0,issues:[{kind:'comparison',wording,sourceQuotes,reason:'The source supports a qualified possibility, not an absolute record.'}]}]});
it('requires grounded offending wording and exact evidence from the cited source',async()=>{
 const x=scripted({wording:[result(['could be one of the most varied'])]});
 const review=await reviewWording(x.port,new UsageMeter(),'mini',items,sources);
 expect(review.get(0)).toEqual([expect.stringContaining('qualified possibility')]);
});
it.each([
 [['set an unprecedented record'],'unprecedented'],
 [['could be the most varied'],'unprecedented'],
 [['could be one of the most varied'],'never happened before']
])('fails closed for uncited, fabricated or noncurrent quote evidence',async(quotes,wording)=>{
 const invalid=result(quotes as string[],wording as string),x=scripted({wording:[invalid,invalid]});
 await expect(reviewWording(x.port,new UsageMeter(),'mini',items,sources)).rejects.toThrow();
});
it('requires every local item to receive a review',async()=>{
 const x=scripted({wording:[{results:[]},{results:[]}]});
 await expect(reviewWording(x.port,new UsageMeter(),'mini',items,sources)).rejects.toThrow();
});
