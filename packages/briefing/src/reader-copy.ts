/** Copy editing only: never run on source evidence or use to decide factual support.
 * Match complete, trailing reporting-commentary templates, not general uncertainty.
 * The existing verifier must see the resulting reader text before publication.
 */
const date = String.raw`(?:[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2})`;
const publication = String.raw`(?:\s+as of (?:the )?(?:source(?:'s|s'?)?|report(?:'s|s'?)?|its) publication(?: on ${date})?)?`;
const subjects = String.raw`(?:casualties|injuries|damage|confrontations)(?:(?:,\s*|\s+(?:or|and)\s+)(?:casualties|injuries|damage|confrontations))*`;
const english = new RegExp(String.raw`(?:^|(?<=[.!?])\s+)(?:No (?:further |additional )?(?:details|information)(?: (?:on|about) ${subjects})? (?:were|was) (?:provided|available|given)|The reports? (?:gave|provided) no (?:further |additional )?details|The (?:report|source) did not mention ${subjects})${publication}[.!?]?$`, 'iu');
const topicComment = new RegExp(String.raw`(?:^|(?<=[.!?])\s+)No direct mention of [^.!?\n]{1,120} as of (?:the )?source(?:'s|s'?)? publication(?: on ${date})?[.!?]?$`, 'iu');
const sourceDate = new RegExp(String.raw`(,\s*(?:according to|as stated in) (?:a|the) (?:report|source|statement)) published (?:on )?${date}[.!?]?$`, 'iu');

const arabicSubjects = String.raw`(?:حجم )?(?:الأضرار|الإصابات|الضحايا|الخسائر)(?:\s*(?:أو|و)\s*(?:حجم )?(?:الأضرار|الإصابات|الضحايا|الخسائر))*`;
const arabicDate = String.raw`[0-9٠-٩]{1,2}\s+(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)(?:\s+[0-9٠-٩]{4})?`;
const arabicTime = String.raw`(?:\s+حتى وقت (?:نشر (?:الخبر|المصدر)|النشر)(?:\s+في\s+${arabicDate})?)?`;
const arabic = new RegExp(String.raw`(?:^|(?<=[.!؟])\s+)(?:لم (?:ترد|تتوفر|تُذكر) (?:أي )?تفاصيل(?: إضافية)?(?: (?:عن|حول) ${arabicSubjects})?)${arabicTime}[.!؟]?$`, 'u');
const arabicClause = new RegExp(String.raw`[،,]\s*(?:دون (?:ذكر )?تفاصيل(?: إضافية)?(?: (?:عن|حول) ${arabicSubjects})?|ولم (?:ترد|تتوفر|تُذكر) تفاصيل(?: إضافية)?(?: (?:عن|حول) ${arabicSubjects})?)${arabicTime}[.!؟]?$`, 'u');
const arabicSourceDate = new RegExp(String.raw`([،,]\s*(?:وذلك )?(?:بحسب|حسب) (?:بيان|تقرير|منشور|مصدر)) (?:نشر|نُشر|صدر) (?:في|بتاريخ) ${arabicDate}[.!؟]?$`, 'u');

/** Only suffix deletion. Unrecognized prose, quotations and substantive unknowns survive. */
export function cleanReaderCopy(body: string): string {
  let copy = body;
  for (;;) {
    const before = copy;
    for (const pattern of [english, topicComment, sourceDate, arabic, arabicClause, arabicSourceDate]) {
      const match = pattern.exec(copy);
      if (!match || match.index === 0) continue; // Never erase an entire item.
      const prefix = copy.slice(0, match.index).trimEnd();
      if (!prefix) continue;
      // The generic report may be the statement's only attribution. Remove its
      // publication date, not the attribution, even when it is less terse.
      const retained = pattern === sourceDate || pattern === arabicSourceDate ? `${prefix}${match[1]}` : prefix;
      copy = /[.!?؟]$/u.test(retained) ? retained : `${retained}.`;
      break;
    }
    if (copy === before) return copy;
  }
}
