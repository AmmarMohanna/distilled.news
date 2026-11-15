import{digest}from'./offline';import type{Case}from'../worker/src/protocol';
export function diagnosticPackets(base:Case):Case[]{
 const specs=[
 {language:'en',source:'The mayor said, “Nous resterons ouverts”, and confirmed the library will stay open on Monday.',headline:'Library stays open',body:'The mayor confirmed the library will stay open on Monday, saying “Nous resterons ouverts”.'},
 {language:'ar',source:'قال رئيس البلدية إن المكتبة ستبقى مفتوحة يوم الاثنين، وأضاف بالإنجليزية: We remain open.',headline:'المكتبة تبقى مفتوحة',body:'أكد رئيس البلدية أن المكتبة ستبقى مفتوحة يوم الاثنين، وقال بالإنجليزية: “We remain open”.'},
 {language:'fr',source:'Le maire a confirmé que la bibliothèque restera ouverte lundi. Il a ajouté en anglais : We remain open.',headline:'La bibliothèque reste ouverte',body:'Le maire a confirmé que la bibliothèque restera ouverte lundi, ajoutant en anglais : « We remain open ».'},
 {language:'en',source:'Emmanuel Macron',headline:'Emmanuel Macron',body:''},
 {language:'fr',source:'Le pont est fermé.',headline:'Pont fermé',body:''},
 {language:'en',source:null,headline:'Cabinet decision',body:'The cabinet approved the transport project.'}
 ] as const;
 if(!specs[1].source.includes('قال رئيس البلدية')||!specs[4].source.includes('fermé')||JSON.stringify(specs).includes('???'))throw Error('DIAGNOSTIC_UTF8_INTEGRITY');
 return specs.map((v,i)=>({...base,id:digest('diagnostics-r2|'+JSON.stringify(v)).slice(0,24),language:v.language,interest:'Assess only the stated library, bridge, official or cabinet development; do not infer inaccessible evidence.',evidenceComplete:v.source!==null,articles:[{id:'diagnostic-r2-source-'+i,feedId:base.feedId,text:v.source,completeness:v.source===null?'missing':'complete'}],items:[{headline:v.headline,body:v.body,sourceIds:['diagnostic-r2-source-'+i]}],limitations:[],sourceLabel:'blind-source-grounded-development-diagnostic-r2'}));
}
