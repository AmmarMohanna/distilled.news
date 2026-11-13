const publishers=[
 {name:'Al Jadeed',aliases:['aljadded','aljadeed','الجديد']},
 ...['BBC News','Reuters','Associated Press','CNN','Al Jazeera','Al Arabiya','L’Orient Today','The Guardian','The New York Times','TechCrunch','The Verge','Wired'].map(name=>({name,aliases:[]})),
];
const key=(value:string)=>value.normalize('NFKD').toLocaleLowerCase().replace(/\p{M}/gu,'').trim();
/** Query completions only: these are never offered as verified sources. */
export function sourceSearchSuggestions(query:string,topic:string,recent:string[]=[],description=''){
 const term=key(query);if(term.length<2)return [];
 const matches=(value:string)=>key(value).startsWith(term)||key(value).includes(' '+term);
 const words=description.split(/\s+/).filter(Boolean);
 const phrases=words.map((_word,index)=>words.slice(index,index+7).join(' ').replace(/[.,;:]+$/,''));
 const choices=[topic,...recent,...phrases].filter(value=>value&&matches(value));
 choices.push(...publishers.filter(row=>matches(row.name)||row.aliases.some(alias=>key(alias).startsWith(term))).map(row=>row.name));
 return [...new Set(choices)].slice(0,6);
}
