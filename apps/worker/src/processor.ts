import { processMessages, type ProcessingResult, type SummaryAdapter } from "@lownoise/core";
import type { ProcessingJobMessage, Repository } from "./types";

export async function processQueueMessage(
  repo: Repository,
  message: ProcessingJobMessage,
  now = new Date(),
  summaryAdapter?: SummaryAdapter | null
): Promise<ProcessingResult | undefined> {
  try {
    const briefing = await repo.getBriefingById(message.briefingId);
    const rawMessage = await repo.getRawMessage(message.rawMessageId);
    if (!briefing || !rawMessage) {
      await repo.failProcessingJob(message.jobId, "Briefing or raw message not found", now);
      return undefined;
    }

    if (briefing.paused) {
      await repo.completeProcessingJob(message.jobId, now);
      return undefined;
    }

    const source = await repo.getSource(rawMessage.source.id);
    if (!source?.enabled) {
      await repo.completeProcessingJob(message.jobId, now);
      return undefined;
    }

    const existingItems = await repo.getExistingItems(briefing.id, now);
    const result = processMessages({
      briefing,
      messages: [rawMessage],
      existingItems,
      now
    });

    if (summaryAdapter) {
      for (const item of result.publishedItems) {
        if (item.evidence.some((evidence) => evidence.messageId === rawMessage.id)) {
          item.summary = await summaryAdapter.summarize({ briefing, evidence: item.evidence });
        }
      }
    }

    await repo.saveBriefingItems(briefing.id, result.publishedItems, now);
    await repo.completeProcessingJob(message.jobId, now);
    return result;
  } catch (error) {
    await repo.failProcessingJob(
      message.jobId,
      error instanceof Error ? error.message : "Unknown processing error",
      now
    );
    throw error;
  }
}
