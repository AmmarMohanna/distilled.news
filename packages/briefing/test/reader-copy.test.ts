import type {ModelRequest} from "../src/model";
import {expect,it} from 'vitest';
import {cleanReaderCopy} from '../src/reader-copy';
import retained from './fixtures/reporting-commentary-recurrence.json';
import {generateBriefing} from '../src/engine';
import {article,FEED,MODELS,scripted,WINDOW} from './helpers';

for(const c of retained.cases)it(`removes only retained trailing commentary: ${c.headline}`,()=>{
 expect(cleanReaderCopy(c.originalBody)).toBe(c.correctedBody);
});
it.each([
 ['An airstrike was reported in the valley. The reports gave no further details.','An airstrike was reported in the valley.'],
 ['An airstrike was reported. No details on casualties or damage were provided.','An airstrike was reported.'],
 ['Brent crude rose to $116 per barrel, according to a report published October 24.','Brent crude rose to $116 per barrel, according to a report.'],
 ['The operator caused the outage, according to a report published October 24.','The operator caused the outage, according to a report.'],
 ['An Israeli force was reported building a road. The report did not mention casualties or confrontations as of its publication on October 24.','An Israeli force was reported building a road.'],
 ['Reported launches coincided with military exercises. No direct mention of the reader topic or regional consequences as of the source\'s publication on October 24.','Reported launches coincided with military exercises.']
])('removes narrow reporting commentary: %s',(input,expected)=>expect(cleanReaderCopy(input)).toBe(expected));
it.each([
 'Officials say the evacuation remains mandatory because road safety is unknown.',
 'The cause of the outage remains unknown.',
 'The channel attributed the explosion to an Israeli operation; responsibility has not been independently confirmed.',
 'The hospital says it cannot yet determine how many patients were affected.',
 'The authority corrected the opening date: October 22, not October 24.',
 'No casualties were reported.',
 'Officials said no details about the evacuation route could be provided for security reasons.',
 'The report did not mention whether the evacuation order remains in force.',
 'The report did not mention casualties, so the death toll remains unknown.',
 'The witness said: "No further details were available."',
 'The authority said, according to a report published October 24, that the bridge opened October 22.',
 'No further details were available.',
 '',
 'The company may launch the product, subject to approval.'
])('preserves substantive meaning or ambiguous prose: %s',text=>expect(cleanReaderCopy(text)).toBe(text));
it('is idempotent and never modifies caller-owned source text',()=>{
 const source={text:retained.cases[0].originalBody};
 const before=JSON.stringify(source),clean=cleanReaderCopy(source.text);
 expect(cleanReaderCopy(clean)).toBe(clean);
 expect(JSON.stringify(source)).toBe(before);
});
it.each([
 ['وردت تقارير عن غارة استهدفت البلدة. لم ترد تفاصيل عن الأضرار أو الإصابات حتى وقت نشر الخبر.','وردت تقارير عن غارة استهدفت البلدة.'],
 ['وردت تقارير عن غارة استهدفت البلدة، دون تفاصيل إضافية عن الأضرار أو الإصابات.','وردت تقارير عن غارة استهدفت البلدة.'],
 ['وردت تقارير عن غارة استهدفت البلدة، ولم ترد تفاصيل عن الأضرار أو الإصابات حتى وقت نشر المصدر في 24 أكتوبر 2026.','وردت تقارير عن غارة استهدفت البلدة.'],
 ['حذرت السفارة مواطنيها من السفر، وذلك بحسب بيان نشر في 24 أكتوبر 2026.','حذرت السفارة مواطنيها من السفر، وذلك بحسب بيان.'],
 ['قال مسؤولون إن أمر الإخلاء مستمر وإن سلامة الطريق لم تتحدد بعد.','قال مسؤولون إن أمر الإخلاء مستمر وإن سلامة الطريق لم تتحدد بعد.'],
 ['حصيلة الضحايا غير معروفة، والبحث عن مفقودين مستمر.','حصيلة الضحايا غير معروفة، والبحث عن مفقودين مستمر.'],
 ['نفى المشغل مسؤوليته عن الانقطاع؛ ولم يحدد المحققون السبب بعد.','نفى المشغل مسؤوليته عن الانقطاع؛ ولم يحدد المحققون السبب بعد.']
 ,['وردت تقارير عن غارة. لم ترد تفاصيل حتى وقت نشر الخبر في 24 أكتوبر 2026 والبحث مستمر.','وردت تقارير عن غارة. لم ترد تفاصيل حتى وقت نشر الخبر في 24 أكتوبر 2026 والبحث مستمر.']
])('handles Arabic copy without removing substantive uncertainty: %s',(input,expected)=>expect(cleanReaderCopy(input)).toBe(expected));

it('verifies the final clean body with the normal two calls and exact source ownership',async()=>{
 const body='An airstrike was reported in the valley. The reports gave no further details.';
 const mock=scripted({edit:[{items:[{headline:'Reported airstrike',body,sources:['S1'],relation:'new',importance:1}]}],verify:[(request:ModelRequest)=>{
  expect(request.user).toContain('body: An airstrike was reported in the valley.');
  expect(request.user).not.toContain('The reports gave no further details.');
  return {results:[{i:0,verdict:'ok',issues:[]}]};
 }]});
 const source=article('valley','A report said an airstrike targeted the valley.');
 const before=JSON.stringify(source);
 const result=await generateBriefing({feed:FEED,...WINDOW,articles:[source]},mock.port,MODELS);
 expect(result.items[0]).toMatchObject({body:'An airstrike was reported in the valley.',sourceIds:['valley']});
 expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify']);
 expect(JSON.stringify(source)).toBe(before);
});
it('preserves legacy frozen-window reader text and verification requests',async()=>{
 const body='An airstrike was reported in the valley. The reports gave no further details.';
 const mock=scripted({edit:[{items:[{headline:'Reported airstrike',body,sources:['S1'],relation:'new',importance:1}]}],verify:[(request:ModelRequest)=>{
  expect(request.user).toContain(body);
  return {results:[{i:0,verdict:'ok',issues:[]}]};
 }]});
 const result=await generateBriefing({feed:FEED,...WINDOW,articles:[article('valley','A report said an airstrike targeted the valley.')]},mock.port,MODELS,{promptVersion:2});
 expect(result.items[0].body).toBe(body);
});
it('cleans a targeted repair before re-verification without losing attributed responsibility',async()=>{
 const supported='The channel attributed the explosion to an Israeli operation.';
 const mock=scripted({edit:[{items:[{headline:'Reported explosion',body:'Israel caused the explosion.',sources:['S1'],relation:'new',importance:1}]}],verify:[{results:[{i:0,verdict:'fix',issues:['Responsibility is attributed, not established.']}]},(request:ModelRequest)=>{
  expect(request.user).toContain(`body: ${supported}`);
  const current=request.user.split('ITEMS TO CHECK:')[1].split('PREVIOUS REVIEW AND EDIT')[0];
  expect(current).not.toContain('No details on casualties or damage were provided.');
  return {results:[{i:0,verdict:'ok',issues:[]}]};
 }],repair:[{items:[{i:0,headline:'Reported explosion',body:supported+' No details on casualties or damage were provided.',drop:false}]}]});
 const result=await generateBriefing({feed:FEED,...WINDOW,articles:[article('source',supported)]},mock.port,MODELS);
 expect(result.items[0].body).toBe(supported);
 expect(mock.calls.map(c=>c.stage)).toEqual(['edit','verify','repair','verify']);
});
