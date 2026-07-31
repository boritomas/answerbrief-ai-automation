const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 30_000;
const DEFAULT_MAX_DELAY_MS = 15 * 60_000;

const NON_RETRYABLE_PATTERNS = [
  /captcha/i,
  /multi[- ]?factor|\bmfa\b/i,
  /identity verification/i,
  /email verification/i,
  /legal acknowledgement/i,
  /position (?:is )?(?:closed|filled|no longer available)/i,
  /application already submitted/i,
];

const RETRY_RULES = [
  { category: 'selector', pattern: /selector|locator|element not found|strict mode violation/i, action: 'refresh_dom_and_try_fallback_selector' },
  { category: 'timeout', pattern: /timeout|timed out|navigation.*failed/i, action: 'refresh_page_and_resume_checkpoint' },
  { category: 'stale_element', pattern: /stale element|detached from dom|execution context was destroyed/i, action: 'requery_dom_and_retry_step' },
  { category: 'upload', pattern: /upload|file picker|input\[type=['"]?file/i, action: 'retry_upload_with_fallback_input' },
  { category: 'modal', pattern: /modal|dialog|overlay|intercepted/i, action: 'dismiss_overlay_and_retry_step' },
  { category: 'http_5xx', pattern: /\b5\d\d\b|service unavailable|bad gateway|gateway timeout/i, action: 'backoff_and_retry' },
  { category: 'browser', pattern: /browser (?:closed|crashed)|page crashed|target closed/i, action: 'restart_browser_and_resume_checkpoint' },
];

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function browserRetryDecision(input = {}) {
  const evidence = [
    clean(input.evidenceText),
    clean(input.browserException),
    clean(input.summary),
    clean(input.step),
    clean(input.attemptedAction),
  ].filter(Boolean).join(' | ');

  const retryCount = Number.isFinite(Number(input.retryCount)) ? Math.max(0, Number(input.retryCount)) : 0;
  const maxRetries = Number.isFinite(Number(input.maxRetries)) ? Math.max(0, Number(input.maxRetries)) : DEFAULT_MAX_RETRIES;

  if (input.retryable === false) {
    return { retry: false, category: 'explicit_non_retryable', action: 'stop', retryCount, maxRetries, delayMs: 0 };
  }

  if (NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(evidence))) {
    return { retry: false, category: 'human_or_terminal_gate', action: 'stop', retryCount, maxRetries, delayMs: 0 };
  }

  if (retryCount >= maxRetries) {
    return { retry: false, category: 'retry_limit_reached', action: 'stop', retryCount, maxRetries, delayMs: 0 };
  }

  const rule = RETRY_RULES.find(({ pattern }) => pattern.test(evidence));
  if (!rule) {
    return { retry: false, category: 'unclassified', action: 'inspect', retryCount, maxRetries, delayMs: 0 };
  }

  const baseDelayMs = Number.isFinite(Number(input.baseDelayMs)) ? Math.max(1_000, Number(input.baseDelayMs)) : DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = Number.isFinite(Number(input.maxDelayMs)) ? Math.max(baseDelayMs, Number(input.maxDelayMs)) : DEFAULT_MAX_DELAY_MS;
  const delayMs = Math.min(maxDelayMs, baseDelayMs * (2 ** retryCount));

  return {
    retry: true,
    category: rule.category,
    action: rule.action,
    retryCount,
    nextRetryCount: retryCount + 1,
    maxRetries,
    delayMs,
  };
}
