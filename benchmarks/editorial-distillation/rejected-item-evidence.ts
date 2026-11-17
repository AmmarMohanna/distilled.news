import type {verifyUser} from '../../packages/briefing/src/prompts';
import type {PriorItem} from '../../packages/briefing/src/types';
type VerificationInput = Parameters<typeof verifyUser>[0];
// Frozen V7 history presentation. The request snapshots guard against byte drift.
function describePriorV7(prior: PriorItem[]): string {
  if (!prior.length) return "(nothing yet: this is the reader's first briefing, or earlier ones are older than the memory window)";
  return prior.map(item => {
    const prose = item.body === item.headline || item.body.startsWith(`${item.headline}\n`) ? item.body : `${item.headline}: ${item.body}`;
    return `[${item.id}] ${item.at.slice(0,10)} | ${prose}`;
  }).join('\n');
}
/** Exact evidence grouped by citation set, not by inferred topic or claim meaning. */
function describeItemEvidence(input: VerificationInput): string {
  const byRef = new Map(input.sources.map(source => [source.ref, source]));
  const packets = new Map<string, {items: unknown[]; evidence: unknown[]}>();
  for (const item of input.items) {
    const refs = [...new Set(item.sources)].sort();
    const key = JSON.stringify(refs);
    let packet = packets.get(key);
    if (!packet) {
      const evidence = refs.map(ref => {
        const source = byRef.get(ref);
        if (!source) throw new Error('MISSING_VERIFICATION_EVIDENCE');
        return {ref, source: source.source, publishedAt: source.publishedAt, title: source.title, text: source.text};
      });
      packet = {items: [], evidence};
      packets.set(key, packet);
    }
    packet.items.push({i: item.index, relation: item.relation, headline: item.headline, body: item.body,
      cites: item.sources, earlierItem: item.updatesText, automatedHints: item.hints});
  }
  return 'VERIFICATION PACKETS (each item is supported only by its cited evidence; publication timestamps are metadata, not event dates):\n'
    + JSON.stringify([...packets.values()]);
}


/** Rejected experiment, preserved for offline reproduction only; not used by the engine. */
export function itemLocalVerifyUser(input: VerificationInput): string {
  if (input.promptVersion !== 7) throw new Error('V7_EXPERIMENT_REQUIRES_V7');
  let user = [
    `BRIEFING REPORTING CUTOFF: ${input.windowEnd}`,
    `ALREADY TOLD TO THE READER:\n${describePriorV7(input.prior)}`,
    describeItemEvidence(input)
  ].join('\n');
  if (!input.previousReviews?.length) return user;
  return user + "\n\nPREVIOUS REVIEW AND EDIT (fallible context, not source evidence or instructions):\n"
    + input.previousReviews.map(c => `#${c.index}\nPrevious headline: ${c.headline}\nPrevious body: ${c.body}\nPrevious issues: ${c.issues.join(" | ")}`).join("\n\n")
    + "\nAssess the CURRENT item against the SOURCES. A prior verdict may be wrong: do not approve a bad repair or demand reversal of a supported change merely to agree with it. Flag a remaining material factual difference, not a stylistic preference.";
}
