import assert from 'node:assert/strict';
import test from 'node:test';
import { browserRetryDecision } from '../../scripts/lib/career-os-browser-retry-policy.mjs';

test('retries selector failures with a fallback-selector action', () => {
  const decision = browserRetryDecision({ browserException: 'selector not found for resume upload', retryCount: 0 });
  assert.equal(decision.retry, true);
  assert.equal(decision.category, 'selector');
  assert.equal(decision.action, 'refresh_dom_and_try_fallback_selector');
  assert.equal(decision.nextRetryCount, 1);
});

test('uses exponential backoff for retryable failures', () => {
  const first = browserRetryDecision({ browserException: 'navigation timeout', retryCount: 0, baseDelayMs: 1_000 });
  const third = browserRetryDecision({ browserException: 'navigation timeout', retryCount: 2, baseDelayMs: 1_000 });
  assert.equal(first.delayMs, 1_000);
  assert.equal(third.delayMs, 4_000);
});

test('does not retry human-only gates', () => {
  const decision = browserRetryDecision({ evidenceText: 'MFA code is required', retryCount: 0 });
  assert.equal(decision.retry, false);
  assert.equal(decision.category, 'human_or_terminal_gate');
});

test('stops after the retry limit', () => {
  const decision = browserRetryDecision({ browserException: 'page crashed', retryCount: 3, maxRetries: 3 });
  assert.equal(decision.retry, false);
  assert.equal(decision.category, 'retry_limit_reached');
});

test('does not retry unknown failures without evidence', () => {
  const decision = browserRetryDecision({ browserException: 'unexpected condition', retryCount: 0 });
  assert.equal(decision.retry, false);
  assert.equal(decision.category, 'unclassified');
});
