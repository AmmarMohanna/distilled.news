import React from 'react';

const copy={
 en:['You can’t access this','private feed.'],
 fr:['Vous ne pouvez pas accéder','à ce fil privé.'],
 ar:['لا يمكنك الوصول','إلى هذه الخلاصة الخاصة.']
};

/** Missing and inaccessible feeds share this view. It reveals no feed metadata
 * and does not distinguish a private URL from a nonexistent one. */
export function PrivateFeedPage({language,header}:{language:'en'|'fr'|'ar';header:React.ReactNode}){
 return <main className="private-feed-page" lang={language} dir={language==='ar'?'rtl':'ltr'}>
  {header}
  <section className="private-feed-content">
  <div className="private-feed-message">
   <svg width="56" height="56" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="private-feed-lock">
    <path d="M9 14V9a7 7 0 0 1 14 0v5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"/>
    <rect x="5" y="14" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="2.3"/>
    <path d="M18.5 21a2.5 2.5 0 1 0-3.7 2.2L14.4 26h3.2l-.4-2.8a2.5 2.5 0 0 0 1.3-2.2Z" fill="currentColor"/>
   </svg>
   <h1><span>{copy[language][0]}</span>{' '}<span>{copy[language][1]}</span></h1>
  </div>
  </section>
 </main>;
}
