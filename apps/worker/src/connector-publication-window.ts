/** A new feed cannot have a completed scheduled window before it existed.
 * A first partial window is allowed; its exact cutoff remains the runtime's
 * responsibility. This admission never changes or reopens retained requests. */
export function feedExistedInWindow(createdAt:string,windowEnd:string):boolean{
 const created=Date.parse(createdAt),end=Date.parse(windowEnd);
 return Number.isFinite(created)&&Number.isFinite(end)&&created<end;
}
