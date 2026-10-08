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
 if(props.publicationState!=='correction_pending'&&props.publicationState!=='failed')return null;
 const correction=props.publicationState==='correction_pending';
 // Pending correction is not proof of withdrawal. Availability refers only to
 // editions actually returned by the publication read API.
 const message=(correction?labels.pending:labels.failed)+(props.hasPublishedEditions?' '+labels.available:'');
 return <FeedNotice heading={correction?labels.correction:labels.delayed} message={message} language={props.language} severity="warning"/>;
}
