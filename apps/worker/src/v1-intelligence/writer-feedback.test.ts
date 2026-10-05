import {it,expect} from 'vitest';
import {invalidDirectQuotes,inspectWriterDraft} from './writer-feedback';
import type {SynthesisInput} from './publication';
it.each(['"The launch succeeded."','“The launch succeeded.”','‘The launch succeeded.’','«The launch succeeded.»','「The launch succeeded.」'])('rejects reconstructed direct quotation %s',text=>{
 expect(invalidDirectQuotes(text,['Officials reported that the launch succeeded.'])).toEqual([text]);
});
it('accepts an exact approved URL and rejects a different destination or URL prefix',()=>{
 const input={feed:{outputLanguage:'en'},stories:[{candidate:{id:'c'},evidence:[{id:'r',language:'en'}]}]} as unknown as SynthesisInput;
 const spans=[{evidenceRevisionId:'r',quote:'Coverage at https://example.invalid/483'}];
 const check=(url:string)=>inspectWriterDraft(input,{language:'en',stories:[{candidateId:'c',claims:[{text:'Coverage at '+url,support:spans}]}]},()=>spans);
 expect(check('https://example.invalid/483')).toEqual([]);
 expect(check('https://example.invalid')).toMatchObject([{code:'UNAPPROVED_URL'}]);
 expect(check('https://example.invalid/999')).toMatchObject([{code:'UNAPPROVED_URL'}]);
});
it('allows plain paraphrase and only exact supported quotations',()=>{
 expect(invalidDirectQuotes('Officials reported a successful launch.',['Officials reported that the launch succeeded.'])).toEqual([]);
 expect(invalidDirectQuotes('Officials said “The launch succeeded.”',['Officials said “The launch succeeded.”'])).toEqual([]);
 expect(invalidDirectQuotes('NASA’s crew launched.',[])).toEqual([]);
 expect(invalidDirectQuotes('The launch succeeded.”',[])).not.toEqual([]);
 expect(invalidDirectQuotes('“The launch succeeded.',[])).not.toEqual([]);
 expect(invalidDirectQuotes('Officials said "The launch succeeded."',['Officials said “The launch succeeded.”'])).not.toEqual([]);
});
