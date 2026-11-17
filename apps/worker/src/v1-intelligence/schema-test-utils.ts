export function expandedSchema<T>(schema:T):T {
 const root=schema as any;
 const walk=(v:any):any=>Array.isArray(v)?v.map(walk):v&&typeof v==='object'?v.$ref?walk(v.$ref.slice(2).split('/').reduce((n:any,k:string)=>n[k],root)):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):v;
 return walk(root);
}
