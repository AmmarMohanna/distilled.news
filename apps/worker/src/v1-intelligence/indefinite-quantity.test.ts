import {it,expect} from 'vitest';
import {checkReaderFidelity} from './fidelity';
import retained from './fixtures/staging-partitive-quantity.json';
const fact=(text:string)=>({id:'fact',text,evidenceRevisionIds:['r']});
const source=retained.partitiveFact;
const drafts=[retained.originalDraft,retained.repairDraft];
it.each(drafts)('permits the retained October 15 indefinite partitive paraphrase',draft=>{
 const approved=fact(source),funding={...fact(retained.fundingFact),id:'funding'};
 expect(checkReaderFidelity([draft],[approved,funding],[approved,funding],true,{pending:true}).failures).toEqual([]);
});
it.each([
 ['One of the main benefits is lower latency.','A main benefit is lower latency.'],
 ['One of their policies concerns transparency.','A policy concerns transparency.'],
 ['A core promise concerns assistance.','One of the core promises concerns assistance.']
])('recognizes matching singular noun phrases without adding numeric claims: %s', (source,draft)=>{
 const approved=fact(source);expect(checkReaderFidelity([draft],[approved],[approved],true).passed).toBe(true);
});
it.each([
 ['Only one of the patients died.','A patient died.'],
 ['Exactly one of the patients died.','A patient died.'],
 ['One of the 12 patients died.','A patient died.'],
 ['One of the promises guarantees one payment.','A promise guarantees payment.'],
 ['One of the core promises concerns assistance.','A different promise concerns assistance.'],
 ['The treatment costs one dollar.','The treatment costs a dollar.'],
 ['Two of the patients died.','A patient died.']
])('retains quantitative and unmatched partitive floors: %s', (source,draft)=>{
 const approved=fact(source);expect(checkReaderFidelity([draft],[approved],[approved],true,{checks:[{factId:'fact',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Permissive attestation cannot remove numeric floors.'}]}).passed).toBe(false);
});
