import type {PublicationProgress} from './types';
import React from 'react';
type Language='en'|'ar'|'fr';
const text={
 en:{unavailable:'feed unavailable',correction:'Correction pending',delayed:'Briefing delayed',pending:'A correction to an earlier briefing is pending.',available:'Published briefings remain available.',failed:'The latest briefing could not be completed.'},
 ar:{unavailable:'الموجز غير متاح',correction:'تصحيح قيد الانتظار',delayed:'الموجز متأخر',pending:'هناك تصحيح لموجز سابق قيد الانتظار.',available:'لا تزال الموجزات المنشورة متاحة.',failed:'تعذّر إكمال الموجز الأخير.'},
 fr:{unavailable:'fil indisponible',correction:'Correction en attente',delayed:'Brief en retard',pending:'Une correction à un brief précédent est en attente.',available:'Les briefs publiés restent disponibles.',failed:'Le dernier brief n’a pas pu être terminé.'}
};
export function FeedNotice(props:{message:string;language:Language;heading?:string;severity?:'error'|'warning'}){
 const warning=props.severity==='warning';
 return <section className="section notice" role={warning?'status':'alert'} data-severity={warning?'warning':'error'}>
  <h2>{props.heading??text[props.language].unavailable}</h2><p>{props.message}</p>
 </section>;
}
export function FeedPublicationNotice(props:{publicationState?:string;hasPublishedEditions:boolean;language:Language}){
 const labels=text[props.language];
 if(props.publicationState==='service_blocked'){const messages={en:['Briefing paused','The service operator needs to resolve an AI service configuration issue. Your collected articles are saved.'],fr:['Brief en pause',"Le responsable du service doit r?soudre un probl?me de configuration du service IA. Vos articles collect?s sont conserv?s."],ar:['?????? ????? ??????','????? ????? ?????? ??? ?? ????? ?? ????? ???? ?????? ?????????. ???????? ???????? ??????.']};const [heading,message]=messages[props.language];return <FeedNotice heading={heading} message={message+(props.hasPublishedEditions?' '+labels.available:'')} language={props.language} severity="warning"/>;}
 if(props.publicationState!=='correction_pending'&&props.publicationState!=='failed')return null;
 const correction=props.publicationState==='correction_pending';
 // Pending correction is not proof of withdrawal. Availability refers only to
 // editions actually returned by the publication read API.
 const message=(correction?labels.pending:labels.failed)+(props.hasPublishedEditions?' '+labels.available:'');
 return <FeedNotice heading={correction?labels.correction:labels.delayed} message={message} language={props.language} severity="warning"/>;
}

const progressText={
 en:{collecting:'Collecting sources…',processing:'Reviewing collected items…',publishing:'Preparing the briefing…',acquired:'Items collected',reviewed:'Items reviewed',failed:'Items that could not be processed',pending:'Items still processing'},
 ar:{collecting:'جارٍ جمع المصادر…',processing:'جارٍ مراجعة العناصر المجمعة…',publishing:'جارٍ إعداد الموجز…',acquired:'العناصر المجمعة',reviewed:'العناصر التي تمت مراجعتها',failed:'العناصر التي تعذرت معالجتها',pending:'العناصر قيد المعالجة'},
 fr:{collecting:'Collecte des sources…',processing:'Analyse des éléments collectés…',publishing:'Préparation du brief…',acquired:'Éléments collectés',reviewed:'Éléments analysés',failed:'Éléments non traités',pending:'Éléments en cours de traitement'}
};
const collectionText={en:'Waiting for source collection',ar:'بانتظار جمع المصادر',fr:'En attente de la collecte des sources'};
export function FeedProcessingProgress({progress,language}:{progress?:PublicationProgress;language:Language}){
 const labels=progressText[language],stage=progress?.stage??'COLLECTING';
 const failed=(progress?.acquisition.failed??0)+(progress?.review.failed??0);
 return <div className="muted feed-status-message" role="status" aria-live="polite">
  <p>{stage==='COLLECTING'?labels.collecting:stage==='PROCESSING'?labels.processing:labels.publishing}</p>
  {progress?.collection?.pending?<p>{collectionText[language]} ({progress.collection.pending}): {progress.collection.sources.join(', ')}.</p>:null}
  {progress&&(stage==='PROCESSING'||stage==='COLLECTING'&&progress.acquisition.total>0)?<>
   <p>{labels.acquired}: {progress.acquisition.completed} / {progress.acquisition.total}. {labels.reviewed}: {progress.review.completed} / {progress.review.total}.</p>
   <p>{labels.pending}: {progress.pending}.{failed>0?` ${labels.failed}: ${failed}.`:''}</p>
  </>:null}
 </div>;
}
