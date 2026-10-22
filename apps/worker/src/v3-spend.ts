import {
  BriefingBudgetError,
  BriefingModelError,
  type ModelPort,
  type ModelRequest,
  type ModelResponse,
  type PriceTable
} from "@distilled/briefing";

const DAY_MS = 86_400_000;

// A held or settled row counts against the cap; a released row does not.
const COUNTED = `CASE state WHEN 'settled' THEN settled_usd WHEN 'held' THEN reserved_usd ELSE 0 END`;

export interface SpendLimits {
  /** Rolling 24 hours across every feed in the deployment. */
  dailyUsd: number;
  /** Ceiling for one scheduled run (one feed window), including repairs and retries. */
  runUsd: number;
}

/**
 * Durable, atomic spend admission for V3. Reservation is a single conditional INSERT, so two
 * concurrent workers cannot both slip under the cap.
 */
export class V3SpendGuard {
  constructor(
    private readonly db: D1Database,
    readonly limits: SpendLimits,
    private readonly clock: () => number = Date.now
  ) {}

  async reserve(input: { runId: string; feedId: string; model: string; estimateUsd: number }): Promise<string | null> {
    const id = crypto.randomUUID();
    const now = this.clock();
    const result = await this.db
      .prepare(
        `INSERT INTO v3_model_spend (id, run_id, feed_id, model, reserved_usd, state, created_at)
         SELECT ?1, ?2, ?3, ?4, ?5, 'held', ?6
         WHERE (SELECT COALESCE(SUM(${COUNTED}), 0) FROM v3_model_spend WHERE created_at >= ?7) + ?5 <= ?8
           AND (SELECT COALESCE(SUM(${COUNTED}), 0) FROM v3_model_spend WHERE run_id = ?2) + ?5 <= ?9`
      )
      .bind(id, input.runId, input.feedId, input.model, input.estimateUsd, now, now - DAY_MS, this.limits.dailyUsd, this.limits.runUsd)
      .run();
    return result.meta.changes === 1 ? id : null;
  }

  async settle(id: string, actualUsd: number): Promise<void> {
    await this.db.prepare(`UPDATE v3_model_spend SET state = 'settled', settled_usd = ?2, outcome = 'success' WHERE id = ?1`).bind(id, actualUsd).run();
  }

  /** Only for a definite refusal before processing. A hold marked uncertain can never be released. */
  async release(id: string, outcome: string): Promise<void> {
    await this.db.prepare(`UPDATE v3_model_spend SET state = 'released', outcome = ?2 WHERE id = ?1 AND state = 'held' AND COALESCE(outcome, '') != 'uncertain'`).bind(id, outcome).run();
  }

  async markUncertain(id: string): Promise<void> {
    await this.db.prepare(`UPDATE v3_model_spend SET outcome = 'uncertain' WHERE id = ?1 AND state = 'held'`).bind(id).run();
  }

  async spentLast24h(): Promise<number> {
    const row = await this.db
      .prepare(`SELECT COALESCE(SUM(${COUNTED}), 0) AS spent FROM v3_model_spend WHERE created_at >= ?1`)
      .bind(this.clock() - DAY_MS)
      .first<{ spent: number }>();
    return row?.spent ?? 0;
  }
}

export function estimateCallUsd(request: ModelRequest, prices: PriceTable): number {
  const price = prices[request.model];
  if (!price) throw new BriefingBudgetError(`no price configured for model ${request.model}; add it to BRIEFING_PRICES_JSON`);
  // Deliberately pessimistic: 3 characters per token in, the full output allowance out.
  const inputTokens = (request.system.length + request.user.length) / 3;
  return (inputTokens * price.input + request.maxTokens * price.output) / 1_000_000;
}

/**
 * Wraps a provider so every attempt is admitted, reserved and settled against the ledger.
 * Retries happen here, not in the transport: a refusal (429/503) releases its reservation and may
 * be retried under a fresh one; an unknown outcome keeps its worst-case hold and is never retried.
 */
export function guardedModelPort(
  inner: ModelPort,
  options: {
    guard: V3SpendGuard;
    feedId: string;
    runId: string;
    prices: PriceTable;
    maxAttempts?: number;
    /** Hard cap on provider attempts for the run, independent of cost. */
    maxCalls?: number;
    sleep?: (ms: number) => Promise<void>;
  }
): ModelPort {
  const maxAttempts = options.maxAttempts ?? 3;
  const maxCalls = options.maxCalls ?? 20;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let attempts = 0;
  return {
    async complete(request): Promise<ModelResponse> {
      const estimate = estimateCallUsd(request, options.prices);
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (attempts >= maxCalls) throw new BriefingBudgetError(`call limit of ${maxCalls} reached for this run`);
        const hold = await options.guard.reserve({ runId: options.runId, feedId: options.feedId, model: request.model, estimateUsd: estimate });
        if (!hold) throw new BriefingBudgetError("model spending budget exhausted; nothing was sent");
        attempts += 1;
        try {
          const response = await inner.complete(request);
          const price = options.prices[request.model];
          const actual = response.costUsd ?? (response.inputTokens * price.input + response.outputTokens * price.output) / 1_000_000;
          try {
            await options.guard.settle(hold, actual);
          } catch (error) {
            console.error("V3 spend settlement failed; the worst-case hold stays counted", hold, error);
          }
          return response;
        } catch (error) {
          if (error instanceof BriefingModelError && !error.uncertain) {
            await options.guard.release(hold, `refused: ${error.message.slice(0, 80)}`);
            if (error.retryable && attempt < maxAttempts - 1) {
              await sleep(600 * 2 ** attempt);
              continue;
            }
            throw error;
          }
          await options.guard.markUncertain(hold).catch(() => undefined);
          throw error;
        }
      }
      throw new BriefingBudgetError("unreachable");
    }
  };
}
