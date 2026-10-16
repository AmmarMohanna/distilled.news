import {useState} from 'react';
import {Newspaper} from 'lucide-react';
import type {BriefingEdition} from '@distilled/core';

export function articleThumbnail(edition:BriefingEdition):string|undefined {
 for(const section of edition.sections??[])for(const evidence of section.evidence??[])for(const media of evidence.media??[]){
  if(media.type!=='photo'||!media.url)continue;
  try{const url=new URL(media.url);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)return url.href;}catch{/* Keep the neutral fallback for unusable media. */}
 }
}
export function ArticleThumbnail({edition}:{edition:BriefingEdition}) {
 const url=articleThumbnail(edition);const [failed,setFailed]=useState<string>();
 return <span className="article-thumbnail" aria-hidden="true">{url&&url!==failed?<img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(url)}/>:<Newspaper size={30} strokeWidth={1.25}/>}</span>;
}
