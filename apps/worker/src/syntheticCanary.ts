import type { NormalizedMessage } from "@distilled/core";
import type { ProcessingJobMessage, Repository, SourceRecord } from "./types";

const CANARY_PREPARATION_START_MINUTE = 54;
const CANARY_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;

type SyntheticCanary = {
  briefingId: string;
  sourceId: string;
  title: string;
  sourceUrl: string;
  text: string;
};

const SYNTHETIC_CANARIES: SyntheticCanary[] = [
  {
    briefingId: "briefing_canary_en_02_technology",
    sourceId: "source_canary_fixture_en",
    title: "Synthetic canary fixture",
    sourceUrl: "https://example.invalid/canary/en",
    text: "Synthetic canary validation: the English technology pipeline received a labelled test bulletin to verify hourly collection, filtering, citations, and publication. This is not real news."
  },
  {
    briefingId: "briefing_canary_ar_01_middle_east",
    sourceId: "source_canary_fixture_ar",
    title: "اختبار اصطناعي",
    sourceUrl: "https://example.invalid/canary/ar",
    text: "اختبار مراقبة اصطناعي: استقبل مسار الأمن والدبلوماسية والاقتصاد في الشرق الأوسط نشرة اختبار واضحة للتحقق من الجمع والتصفية والاستشهاد والنشر كل ساعة. هذه ليست أخباراً حقيقية."
  },
  {
    briefingId: "briefing_canary_fr_02_technology",
    sourceId: "source_canary_fixture_fr",
    title: "Canari synthétique",
    sourceUrl: "https://example.invalid/canary/fr",
    text: "Validation synthétique : le flux français d’intelligence artificielle et de cybersécurité a reçu un bulletin de test clairement signalé afin de vérifier la collecte, le filtrage, les citations et la publication horaire. Ce n’est pas une actualité réelle."
  }
];

export async function enqueueScheduledSyntheticCanaryFixtures(input: {
  repo: Repository;
  queue: { send(message: ProcessingJobMessage): Promise<unknown> };
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  const minute = now.getUTCMinutes();
  if (minute !== CANARY_PREPARATION_START_MINUTE) return 0;

  const windowEnd = nextHourBoundary(now);
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + CANARY_RETENTION_MS).toISOString();
  let enqueued = 0;

  for (const canary of SYNTHETIC_CANARIES) {
    const source = await ensureSyntheticCanarySource(input.repo, canary, now);
    const suffix = windowEnd.replace(/[-:.TZ]/g, "");
    const rawMessageId = `${canary.briefingId}::synthetic_hourly_${suffix}`;
    if (await input.repo.getRawMessage(rawMessageId)) continue;
    const jobId = await input.repo.saveRawMessageAndCreateProcessingJob(canary.briefingId, {
      id: rawMessageId,
      source: {
        id: source.id,
        title: source.title,
        type: source.type,
        provider: source.provider,
        kind: source.kind
      },
      messageId: `synthetic_hourly_${suffix}`,
      text: canary.text,
      links: [canary.sourceUrl],
      media: [],
      postedAt: nowIso,
      receivedAt: nowIso,
      sourceUrl: canary.sourceUrl,
      expiresAt
    } satisfies NormalizedMessage, now);
    await input.queue.send({ type: "process_raw_message", jobId, briefingId: canary.briefingId, rawMessageId });
    await input.repo.markProcessingJobEnqueued(jobId, now);
    enqueued += 1;
  }

  return enqueued;
}

async function ensureSyntheticCanarySource(
  repo: Repository,
  canary: SyntheticCanary,
  now: Date
): Promise<SourceRecord> {
  const existing = await repo.getSource(canary.sourceId);
  if (existing) {
    if (!existing.enabled) await repo.setSourceEnabled(existing.id, true, now);
    return { ...existing, enabled: true };
  }

  return repo.upsertConfiguredSource({
    briefingId: canary.briefingId,
    title: canary.title,
    provider: "rss",
    kind: "rss_feed",
    input: "synthetic:canary-fixture",
    sourceUrl: canary.sourceUrl,
    enabled: true
  }, now);
}

function nextHourBoundary(now: Date): string {
  const boundary = new Date(now);
  boundary.setUTCMinutes(0, 0, 0);
  boundary.setUTCHours(boundary.getUTCHours() + 1);
  return boundary.toISOString();
}
