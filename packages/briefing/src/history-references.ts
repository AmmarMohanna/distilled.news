import type { PriorItem } from './types';

/** Request-local aliases. Durable update links always use the original history ID. */
export function historyReferences(prior: PriorItem[], aliased: boolean) {
  const originals = new Map<string, string>();
  const aliases = new Map<string, string>();
  const items = aliased ? prior.map(item => {
    const id = aliases.get(item.id) ?? 'H' + (aliases.size + 1);
    originals.set(id,item.id);
    aliases.set(item.id,id);
    return { ...item,id };
  }) : prior;
  return {
    aliased,
    items,
    originalId: (id: string | undefined) => id === undefined || !aliased ? id : originals.get(id),
    wireId: (id: string | undefined) => id === undefined || !aliased ? id : aliases.get(id),
    linkInstruction: '\nHISTORY LINKS: Copy only an exact H label present in this request for an update or correction. Use null for a new occurrence. An H label cannot cite or establish a current fact. A shared topic alone does not make a development an update.',
  };
}
