import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateIntegrationTarget, missingIntegrationSecrets } from './integration-deploy-target.mjs';
const source = readFileSync(new URL('../apps/worker/wrangler.integration.jsonc', import.meta.url), 'utf8');
const original = JSON.parse(source.slice(source.indexOf('{')));
const change = patch => ({ ...structuredClone(original), ...patch });

test('only the integration Worker in its expected account can be targeted', () => {
  assert.doesNotThrow(() => validateIntegrationTarget(original));
  assert.throws(() => validateIntegrationTarget(change({ name: 'distilled-news-staging' })), /TARGET_MISMATCH/);
  assert.throws(() => validateIntegrationTarget(change({ account_id: 'other-account' })), /TARGET_MISMATCH/);
  assert.throws(() => validateIntegrationTarget(change({ env: { staging: { name: 'distilled-news-staging' } } })), /ENVIRONMENTS_FORBIDDEN/);
});

test('shared background processing and route takeover fail closed', () => {
  for (const patch of [{ routes: ['example.com/*'] }, { triggers: { crons: ['* * * * *'] } }, { queues: { ...original.queues, consumers: [{ queue: 'distilled-news-staging-processing' }] } }]) {
    assert.throws(() => validateIntegrationTarget(change(patch)), /BACKGROUND_OR_ROUTE_CONFLICT/);
  }
});

test('integration links cannot point back to staging', () => {
  assert.throws(() => validateIntegrationTarget(change({ vars: { ...original.vars, PUBLIC_WEB_BASE_URL: 'https://distilled-news-staging.distillednews-platform.workers.dev' } })), /ORIGIN_MISMATCH/);
});

test('secret preflight reports missing names without substituting values', () => {
  assert.deepEqual(missingIntegrationSecrets(['KEY_A', 'KEY_B', 'KEY_C'], ['KEY_A'], { KEY_B: 'test-only-value' }), ['KEY_C']);
  assert.deepEqual(missingIntegrationSecrets(['KEY_A', 'KEY_B'], ['KEY_A'], { KEY_B: 'test-only-value' }), []);
  assert.throws(() => missingIntegrationSecrets(['KEY_A'], [], { KEY_A: '' }), /EMPTY_INTEGRATION_SECRET/);
  assert.throws(() => missingIntegrationSecrets(['KEY_A'], [], { UNRELATED_KEY: 'test-only-value' }), /UNEXPECTED_INTEGRATION_SECRET_NAME/);
});
