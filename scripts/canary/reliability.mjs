export const MAXIMUM_RECOVERED_MODEL_FALLBACK_RATE = 0.05;
export const MAXIMUM_RECOVERED_SOURCE_FAILURES = 25;
export const MAXIMUM_RECOVERED_SOURCE_FAILURE_RATE = 0.001;

export const SOURCE_RECOVERY_SLA_MINUTES = Object.freeze({
  fixture: 15,
  telegram: 15,
  rss: 25,
  x: 30,
  googleNews: 90
});

export function buildCanarySourceRunHealthQuery(input) {
  const windowStartedAt = sql(input.windowStartedAt);
  const observedAt = sql(input.observedAt);
  const sla = input.slaMinutes ?? SOURCE_RECOVERY_SLA_MINUTES;
  return `
    WITH canary_runs AS (
      SELECT
        run.*,
        COALESCE(source.canonical_key, source.id) AS canonical_identity,
        CASE
          WHEN source.id LIKE 'launch_canary_fixture_%' THEN ${sla.fixture}
          WHEN source.kind IN ('x_profile', 'x_search') THEN ${sla.x}
          WHEN source.kind = 'google_news' THEN ${sla.googleNews}
          WHEN source.provider = 'telegram' THEN ${sla.telegram}
          ELSE ${sla.rss}
        END AS recovery_sla_minutes,
        COALESCE(run.completed_at, run.updated_at) AS terminal_at
      FROM source_runs run
      JOIN sources source ON source.id = run.source_id
      WHERE run.briefing_id LIKE 'launch_canary_briefing_%'
        AND run.created_at >= ${windowStartedAt}
        AND run.created_at <= ${observedAt}
        AND (
          run.state IN ('queued', 'running')
          OR COALESCE(run.completed_at, run.updated_at) <= ${observedAt}
        )
    ),
    failed_runs AS (
      SELECT
        failed.id,
        failed.terminal_at AS failed_at,
        failed.recovery_sla_minutes,
        MIN(COALESCE(success.completed_at, success.updated_at)) AS next_success_at
      FROM canary_runs failed
      LEFT JOIN canary_runs success
        ON success.canonical_identity = failed.canonical_identity
        AND success.state = 'succeeded'
        AND julianday(COALESCE(success.completed_at, success.updated_at)) >
          julianday(failed.terminal_at)
      WHERE failed.state = 'failed'
      GROUP BY failed.id, failed.terminal_at, failed.recovery_sla_minutes
    ),
    classified_failures AS (
      SELECT
        *,
        CASE
          WHEN next_success_at IS NOT NULL
            AND julianday(next_success_at) <=
              julianday(failed_at, '+' || recovery_sla_minutes || ' minutes')
            THEN 'recovered'
          WHEN next_success_at IS NULL
            AND julianday(${observedAt}) <=
              julianday(failed_at, '+' || recovery_sla_minutes || ' minutes')
            THEN 'pending'
          ELSE 'exhausted'
        END AS recovery_state
      FROM failed_runs
    )
    SELECT
      (SELECT COUNT(*) FROM canary_runs) AS attempts,
      (SELECT COUNT(*) FROM canary_runs WHERE state = 'succeeded') AS succeeded,
      (SELECT COUNT(*) FROM canary_runs WHERE state = 'failed') AS failed,
      (SELECT COUNT(*) FROM classified_failures WHERE recovery_state = 'recovered') AS recovered_failures,
      (SELECT COUNT(*) FROM classified_failures WHERE recovery_state = 'pending') AS pending_failures,
      (SELECT COUNT(*) FROM classified_failures WHERE recovery_state = 'exhausted') AS exhausted_failures,
      (SELECT COUNT(*) FROM classified_failures
        WHERE recovery_state = 'exhausted' AND next_success_at IS NOT NULL) AS late_recoveries,
      (SELECT COUNT(*) FROM canary_runs WHERE state IN ('queued', 'running')) AS in_flight,
      (SELECT COUNT(*) FROM canary_runs
        WHERE state IN ('queued', 'running')
          AND julianday(updated_at) < julianday(${observedAt}, '-15 minutes')) AS stale_in_flight,
      (SELECT ROUND(COALESCE(SUM(estimated_cost_usd), 0), 6) FROM canary_runs) AS estimated_spend_usd,
      (SELECT ROUND(COALESCE(SUM(actual_cost_usd), 0), 6) FROM canary_runs) AS actual_spend_usd;
  `;
}

export function sourceRunHealthPass(input) {
  const recoveredFailures = Number(input.sourceRuns.recovered_failures ?? 0);
  const recoveredFailureRate =
    recoveredFailures / Math.max(1, Number(input.sourceRuns.attempts ?? 0));
  return input.sourceRuns.exhausted_failures === 0 &&
    input.sourceRuns.stale_in_flight === 0 &&
    recoveredFailures <= MAXIMUM_RECOVERED_SOURCE_FAILURES &&
    input.sources.fatal_current_errors === 0 &&
    input.sources.expired_current_errors === 0 &&
    (
      input.elapsedHours < 24 ||
      (
        input.sourceRuns.pending_failures === 0 &&
        recoveredFailureRate <= MAXIMUM_RECOVERED_SOURCE_FAILURE_RATE &&
        input.sources.with_error === 0 &&
        input.sources.enabled === 500
      )
    );
}

export function modelOperationHealthPass(input) {
  return input.modelOperations.exhausted === 0 &&
    input.modelOperations.unexpected_outcomes === 0 &&
    input.modelValidation.failed === 0;
}

export function recoveredModelFallbackRate(modelOperations) {
  const successful = modelOperations.primary_succeeded + modelOperations.fallback_succeeded;
  return modelOperations.fallback_succeeded / Math.max(1, successful);
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
