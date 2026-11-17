/** Unstarted waits are diagnostics, not executable intents. The operation ID
 * still hashes the complete input; retries reconstruct it from canonical state. */
export function semanticWaitRecord<T extends { input: { state: unknown } }>(result: T) {
  const { state: _state, ...input } = result.input;
  return { ...result, input: { ...input, stateOmitted: true } };
}
