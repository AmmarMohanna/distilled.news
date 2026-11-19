import type {PublicationProgress} from './types';
import React from 'react';
import { TriangleAlert } from 'lucide-react';
type Language='en'|'ar'|'fr';
const text={
 en:{partial:'No new developments in the sources we could check. One article could not be retrieved.',unavailable:'feed unavailable',correction:'Correction pending',delayed:'Briefing delayed',pending:'A correction to an earlier briefing is pending.',available:'Published briefings remain available.',failed:'The latest briefing could not be completed.'},
 ar:{partial:'لا مستجدات في المصادر التي تمكّنا من التحقق منها. تعذّر جلب مقال واحد.',unavailable:'الخلاصة غير متاحة',correction:'تصحيح قيد الانتظار',delayed:'تأخر نشر الموجز',pending:'هناك تصحيح لموجز سابق قيد الانتظار.',available:'لا تزال الموجزات المنشورة متاحة.',failed:'تعذّر إكمال الموجز الأخير.'},
 fr:{partial:'Aucun fait nouveau dans les sources consultées. Un article n’a pas pu être récupéré.',unavailable:'Fil indisponible',correction:'Correction en attente',delayed:'Publication du brief retardée',pending:'Une correction d’un brief précédent est en attente.',available:'Les briefs publiés restent disponibles.',failed:'Le dernier brief n’a pas pu être terminé.'}
};
export function FeedNotice(props:{message:string;language:Language;heading?:string;severity?:'error'|'warning'}){
 const warning=props.severity==='warning';
 return <section className="section notice" role={warning?'status':'alert'} data-severity={warning?'warning':'error'}>
  <span className="feed-notice-icon" aria-hidden="true"><TriangleAlert size={28}/></span><div><h2>{props.heading??text[props.language].unavailable}</h2><p>{props.message}</p></div>
 </section>;
}
export function FeedPublicationNotice(props:{publicationState?:string;hasPublishedEditions:boolean;language:Language}){
 // Operational publication and source failures belong in diagnostics, not the reader.
 if(props.publicationState!=='correction_pending')return null;
 const labels=text[props.language];
 const message=labels.pending+(props.hasPublishedEditions?' '+labels.available:'');
 return <FeedNotice heading={labels.correction} message={message} language={props.language} severity="warning"/>;
}

const progressText={
 en:{collecting:'Collecting sources…',processing:'Reviewing collected items…',publishing:'Preparing the briefing…',acquired:'Items collected',reviewed:'Items reviewed',failed:'Items that could not be processed',pending:'Items still processing'},
 ar:{collecting:'جارٍ جلب المحتوى…',processing:'جارٍ مراجعة المحتوى…',publishing:'جارٍ إعداد الموجز…',acquired:'المواد التي تم جلبها',reviewed:'المواد التي تمت مراجعتها',failed:'المواد التي تعذّرت معالجتها',pending:'المواد قيد المعالجة'},
 fr:{collecting:'Récupération du contenu…',processing:'Analyse des contenus récupérés…',publishing:'Préparation du brief…',acquired:'Contenus récupérés',reviewed:'Contenus analysés',failed:'Contenus non traités',pending:'Contenus en cours de traitement'}
};
export function FeedProcessingProgress({progress,language}:{progress?:PublicationProgress;language:Language}){
 const labels=progressText[language],stage=progress?.stage??'COLLECTING';
 const failed=(progress?.acquisition.failed??0)+(progress?.review.failed??0);
 return <div className="muted feed-status-message" role="status" aria-live="polite">
  <p>{stage==='COLLECTING'?labels.collecting:stage==='PROCESSING'?labels.processing:labels.publishing}</p>
  {progress&&stage==='PROCESSING'?<>
   <p>{labels.acquired}: {progress.acquisition.completed} / {progress.acquisition.total}. {labels.reviewed}: {progress.review.completed} / {progress.review.total}.</p>
   <p>{labels.pending}: {progress.pending}.{failed>0?` ${labels.failed}: ${failed}.`:''}</p>
  </>:null}
 </div>;
}
