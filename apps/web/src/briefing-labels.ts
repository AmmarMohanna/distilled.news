import type {BriefingConfig} from '@distilled/core';

type Language='en'|'ar'|'fr';

export function cadenceMetaLabel(cadence:BriefingConfig['briefingCadence'],language:Language):string {
 if(language==='ar')return {hourly:'تحديثات',daily:'يومي',weekly:'أسبوعي',monthly:'شهري'}[cadence];
 if(language==='fr')return {hourly:'mises à jour',daily:'quotidien',weekly:'hebdomadaire',monthly:'mensuel'}[cadence];
 return cadence==='hourly'?'updates':cadence;
}

function arabicDuration(count:number,unit:'minute'|'hour'|'day'):string {
 const forms={minute:['دقيقة','دقيقتين','دقائق'],hour:['ساعة','ساعتين','ساعات'],day:['يوم','يومين','أيام']}[unit];
 if(count===1)return forms[0];
 if(count===2)return forms[1];
 return `${count} ${new Intl.PluralRules('ar').select(count)==='few'?forms[2]:forms[0]}`;
}

/** Reader-facing wording only. Keep the existing rounding and thresholds;
 * intended delivery and actual publication are separate backend values. */
export function formatCountdown(isoDate:string,nowMs:number,language:Language='en'):string {
 const diffMs=new Date(isoDate).getTime()-nowMs;
 if(!Number.isFinite(diffMs))return '';
 if(diffMs<=0)return language==='ar'?'حان الموعد':language==='fr'?'maintenant':'is due';
 const minutes=Math.ceil(diffMs/60_000);
 if(minutes<60){
  if(language==='ar')return `بعد ${arabicDuration(minutes,'minute')}`;
  return language==='fr'?`dans ${minutes} min`:`in ${minutes} min`;
 }
 const hours=Math.floor(minutes/60),remainder=minutes%60;
 if(hours<24){
  if(language==='ar')return `بعد ${arabicDuration(hours,'hour')}${remainder?` و${arabicDuration(remainder,'minute')}`:''}`;
  if(language==='fr')return remainder===0?`dans ${hours} h`:`dans ${hours} h ${remainder} min`;
  return remainder===0?`in ${hours}h`:`in ${hours}h ${remainder}m`;
 }
 const days=Math.floor(hours/24);
 if(language==='ar')return `بعد ${arabicDuration(days,'day')}`;
 return language==='fr'?`dans ${days} j`:`in ${days}d`;
}

export function nextBriefingText(cadence:BriefingConfig['briefingCadence'],countdown:string,language:Language):string {
 if(language==='ar')return cadence==='hourly'?`التحقق التالي ${countdown}`:`الموجز التالي ${countdown}`;
 if(language==='fr')return cadence==='hourly'?`prochaine vérif. ${countdown}`:`prochain brief ${cadenceMetaLabel(cadence,language)} ${countdown}`;
 return cadence==='hourly'?`Next check ${countdown}`:`Next ${cadence} brief ${countdown}`;
}
