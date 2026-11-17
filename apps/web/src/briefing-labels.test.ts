import {expect,it} from 'vitest';
import {cadenceMetaLabel,formatCountdown,nextBriefingText} from './briefing-labels';

const now=Date.parse('2026-11-17T08:00:00Z');
const after=(minutes:number)=>new Date(now+minutes*60_000).toISOString();

it('uses the short French hourly label and preserves other cadence wording',()=>{
 expect(nextBriefingText('hourly','dans 5 min','fr')).toBe('prochaine vérif. dans 5 min');
 for(const [cadence,label] of [['daily','quotidien'],['weekly','hebdomadaire'],['monthly','mensuel']] as const){
  expect(nextBriefingText(cadence,'dans 2 h','fr')).toBe(`prochain brief ${label} dans 2 h`);
 }
 expect(cadenceMetaLabel('hourly','fr')).toBe('mises à jour');
});

it.each([
 [1,'بعد دقيقة'],[2,'بعد دقيقتين'],[3,'بعد 3 دقائق'],[11,'بعد 11 دقيقة'],
 [60,'بعد ساعة'],[120,'بعد ساعتين'],[180,'بعد 3 ساعات'],[61,'بعد ساعة ودقيقة'],
 [125,'بعد ساعتين و5 دقائق'],[1440,'بعد يوم'],[2880,'بعد يومين'],[4320,'بعد 3 أيام']
])('uses natural Arabic duration wording after %i minutes',(minutes,expected)=>{
 expect(formatCountdown(after(minutes),now,'ar')).toBe(expected);
});

it('uses consistent French time units without changing countdown thresholds',()=>{
 expect(formatCountdown(after(1),now,'fr')).toBe('dans 1 min');
 expect(formatCountdown(after(59),now,'fr')).toBe('dans 59 min');
 expect(formatCountdown(after(60),now,'fr')).toBe('dans 1 h');
 expect(formatCountdown(after(125),now,'fr')).toBe('dans 2 h 5 min');
 expect(formatCountdown(after(1440),now,'fr')).toBe('dans 1 j');
});

it('keeps compact Arabic time units short while retaining full natural wording',()=>{
 expect(formatCountdown(after(418),now,'ar',true)).toBe('بعد 6 س 58 د');
 expect(formatCountdown(after(418),now,'ar')).toBe('بعد 6 ساعات و58 دقيقة');
 expect(formatCountdown(after(2),now,'ar',true)).toBe('بعد 2 د');
 expect(formatCountdown(after(2),now,'ar')).toBe('بعد دقيقتين');
});

it('preserves English countdown rounding and due/invalid handling',()=>{
 expect(formatCountdown(after(59.5),now,'en')).toBe('in 1h');
 expect(formatCountdown(after(125),now,'en')).toBe('in 2h 5m');
 expect(formatCountdown(after(2880),now,'en')).toBe('in 2d');
 expect(formatCountdown(after(0),now,'en')).toBe('is due');
 expect(formatCountdown('invalid',now,'fr')).toBe('');
 expect(nextBriefingText('hourly','in 5 min','en')).toBe('Next check in 5 min');
});
