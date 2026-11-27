import { headlineWordCount } from './prompts';
import type { FeedSpec } from './types';

interface BudgetStory {
  headline: string;
  body: string;
  importance: 1 | 2 | 3;
}

/** Input is already in editorial priority order. Individual reader text is immutable. */
export function selectWithinReaderBudget<T extends BudgetStory>(
  language: FeedSpec['language'], drafts: readonly T[], ceiling: number,
): {fits:true;retained:T[];excluded:T[]} | {fits:false;requiredWords:number} {
  const measured = drafts.map(draft=>({ draft, words:headlineWordCount(language,[draft]) }));
  const requiredWords = measured.reduce((sum,{draft,words})=>sum+(draft.importance===1?words:0),0);
  if (requiredWords>ceiling) return {fits:false,requiredWords};

  let remaining = ceiling-requiredWords;
  const retained:T[] = [];
  const excluded:T[] = [];
  for (const {draft,words} of measured) {
    if (draft.importance===1) {
      retained.push(draft);
    } else if (words<=remaining) {
      retained.push(draft);
      remaining-=words;
    } else {
      excluded.push(draft);
    }
  }
  if (!retained.length && measured.length) return {fits:false,requiredWords:Math.min(...measured.map(item=>item.words))};
  return {fits:true,retained,excluded};
}
