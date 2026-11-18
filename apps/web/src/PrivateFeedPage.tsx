import React from 'react';
import {LockKeyhole} from 'lucide-react';

const copy={
 en:['You can’t access this','private feed.'],
 fr:['Vous ne pouvez pas accéder','à ce fil privé.'],
 ar:['لا يمكنك الوصول','إلى هذه الخلاصة الخاصة.']
};

/** Missing and inaccessible feeds share this view. It reveals no feed metadata
 * and does not distinguish a private URL from a nonexistent one. */
export function PrivateFeedPage({language}:{language:'en'|'fr'|'ar'}){
 return <main className="private-feed-page" lang={language} dir={language==='ar'?'rtl':'ltr'}>
  <div className="private-feed-message">
   <LockKeyhole size={56} strokeWidth={1.9} aria-hidden="true"/>
   <h1><span>{copy[language][0]}</span>{' '}<span>{copy[language][1]}</span></h1>
  </div>
 </main>;
}
