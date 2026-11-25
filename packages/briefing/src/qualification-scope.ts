import type { PreparedArticle } from './prepare';

const normalize = (text:string) => text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[â€™â€˜]/g,"'").replace(/[^\S\n]+/g,' ');
const sentences = (text:string) => normalize(text).split(/\n+|(?<=[.!?;])\s+/u);
const vote = /\bparlement(?: europeen)?\b|vote du parlement/u;
const approvalAction = /\b(?:approuv\w*|adopt\w*|vot\w*|aval|approbation)\b/u;
const forecast = /\b(?:devrait|devraient|prevu\w*|attendu\w*|envisage\w*|pourrait|pourraient|susceptible)\b/u;
const month = '(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)';
const schedule = new RegExp('\\b(?:en\\s+|(?:le\\s+)?\\d{1,2}\\s+)('+month+')\\b','u')
const sourceSchedule = new RegExp('\\b('+month+')\\b','u');;
const penalty = /\b(?:amendes?|sanctions?|penalites?)\b/u;
const importBase = /\bimportations?\b/u;
const previousYear = /\b(?:annee|exercice) precedent[e]?\b/u;
const percentage = /(?<![\d,.])\d+(?:[,.]\d+)?\s*%/gu;
const reservation = /\b(?:plafonds?|reserves?|marges?|disponibles?)\b/u;
const amount = /(?<![\d,.])\d+(?:[,.]\d+)?\s+(?:millions?|milliards?)\b/gu;
const numericValues = (sentence:string, pattern:RegExp) =>
  Array.from(sentence.matchAll(pattern), ([value])=>value.replace(/\s+/g,'').replace('.',','));

/**
 * Narrow admission checks for the adjudicated French failure classes. Each
 * needs an original cited sentence with the governing qualification and the
 * relevant actor/action or numeric measure. This supplies a repair/hold reason,
 * never an approval. The independent final-text verifier stays mandatory.
 */
export function frenchQualificationIssues(
  draft:{headline:string;body:string},
  sources:ReadonlyArray<Pick<PreparedArticle,'ref'|'publishedAt'|'text'>>,
):string[] {
  const claims = sentences(draft.headline+'\n'+draft.body);
  const issues = new Set<string>();
  for (const source of sources) for (const evidence of sentences(source.text)) {
    const evidenceSchedule = sourceSchedule.exec(evidence);
    if (evidenceSchedule && vote.test(evidence) && approvalAction.test(evidence) && forecast.test(evidence)) {
      if (claims.some(claim=>vote.test(claim) && approvalAction.test(claim) &&
          schedule.exec(claim)?.[1]===evidenceSchedule[1] && !forecast.test(claim))) {
        issues.add('V5_VOTE_TIMING: '+source.ref+' describes Parliamentâ€™s approval or vote timing as expected. Preserve that uncertainty in the timing clause.');
      }
    }
    if (penalty.test(evidence) && importBase.test(evidence) && previousYear.test(evidence)) {
      const values = numericValues(evidence,percentage);
      if (claims.some(claim=>penalty.test(claim) &&
          numericValues(claim,percentage).some(value=>values.includes(value)) &&
          !(importBase.test(claim)&&previousYear.test(claim)))) {
        issues.add('V5_PENALTY_BASE: '+source.ref+' ties the penalty percentage to the value of imports in the preceding year. Keep that calculation base with the figure.');
      }
    }
    const year=/^(\d{4})-\d\d-\d\d/u.exec(source.publishedAt)?.[1];
    if (!year || !/\bcette annee\b/u.test(evidence) || !reservation.test(evidence)) continue;
    const values = numericValues(evidence,amount);
    const scope = new RegExp('\\b(?:en|pour|de|sur|exercice) '+year+'\\b','u');
    if (claims.some(claim=>reservation.test(claim) &&
        numericValues(claim,amount).some(value=>values.includes(value)) && !scope.test(claim))) {
      issues.add('V5_RESERVE_YEAR: '+source.ref+' places this amount within the '+year+' reserve. State the applicable year next to the amount.');
    }
  }
  return [...issues];
}
