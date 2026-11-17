import {expect,it,vi} from 'vitest';
import {wikipediaArticlePassages} from '@distilled/connectors';
import {assessSource} from './source-assessment';
import type {Env} from './types';
const url='https://en.wikipedia.org/wiki/Georges_Khabbaz';
const prose='Georges Khabbaz is a Lebanese actor, writer and director. He has performed in theater productions and appeared in Lebanese films and television series throughout his career.';
const notice='This biography of Georges Khabbaz needs additional citations for verification. Please help improve this article by adding citations to reliable sources.';
const html=`<html><head><title>Georges Khabbaz</title></head><body><main><h1>Georges Khabbaz</h1><div class="mw-parser-output"><table class="ambox"><tr><td><p>${notice}</p></td></tr></table><div class="hatnote"><p>${notice}</p></div><p>${prose}</p></div></main></body></html>`;
it('samples biography prose without editorial notices or navigation',()=>{
 expect(wikipediaArticlePassages(html,url)).toEqual([prose]);
 expect(wikipediaArticlePassages(html.replace(`<p>${prose}</p>`,''),url)).toEqual([]);
 expect(wikipediaArticlePassages(html,'https://en.wikipedia.org.evil.example/wiki/Georges_Khabbaz')).toEqual([]);
});
it('sends substantive Wikipedia paragraphs to both relevance checks',async()=>{
 const dispatch=vi.fn<typeof fetch>(async(input,init)=>{
  if(!String(input).includes('openrouter.ai'))return new Response(html,{headers:{'content-type':'text/html'}});
  const request=JSON.parse(init!.body as string),state=JSON.parse(request.messages[1].content);
  const evidence=state.passage??state.source.evidence;
  expect(evidence).toContain('Lebanese actor');expect(evidence).not.toContain('needs additional citations');
  return Response.json({choices:[{message:{content:JSON.stringify(state.passage?{exactTopic:'YES',reason:'The biography describes his film and theater work.'}:{realWorldInterest:'YES',exactTopic:'YES',historicalInterest:'NO',concern:'NO',reason:'Substantive film and theater coverage.',evidenceId:'E1'})}}]});
 });
 const env={SOURCE_CONNECTORS_ENABLED:'true',SOURCE_NATIVE_EXECUTION_ENABLED:'true',SOURCE_EXECUTION_URL:'https://runtime.example',SOURCE_EXECUTION_TOKEN:'test',OPENROUTER_API_KEY:'test',SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'} as Env;
 expect(await assessSource(env,{title:'Georges Khabbaz',description:'Films, theater and television'},url,dispatch)).toMatchObject({status:'accepted',evidenceQuote:expect.stringContaining('Lebanese actor')});
});
