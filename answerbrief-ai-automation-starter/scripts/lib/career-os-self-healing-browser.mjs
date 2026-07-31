import { browserRetryDecision } from './career-os-browser-retry-policy.mjs';

const DEFAULT_CONFIDENCE_THRESHOLD = 70;

const RECOVERY_PLANS = {
  selector: [
    'requery_accessibility_tree',
    'try_label_and_role_selectors',
    'try_text_and_testid_selectors',
    'try_css_and_xpath_fallbacks',
    'refresh_dom_and_resume_checkpoint',
  ],
  stale_element: [
    'discard_stale_handle',
    'requery_dom',
    'retry_current_step',
    'resume_checkpoint',
  ],
  timeout: [
    'wait_for_network_idle',
    'reload_current_page',
    'restore_checkpoint_url',
    'resume_checkpoint',
  ],
  modal: [
    'press_escape',
    'close_known_dialog',
    'remove_nonessential_overlay',
    'retry_current_step',
  ],
  upload: [
    'verify_file_exists',
    'requery_file_input',
    'set_input_files_directly',
    'retry_upload_from_checkpoint',
    'verify_uploaded_filename',
  ],
  browser: [
    'restart_browser_context',
    'restore_authenticated_storage',
    'restore_checkpoint_url',
    'resume_checkpoint',
  ],
  http_5xx: [
    'wait_with_backoff',
    'reload_current_page',
    'resume_checkpoint',
  ],
};

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCompletedFields(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((field) => typeof field === 'string' && field.trim()).map((field) => field.trim());
}

export function buildSelfHealingPlan(input = {}) {
  const retry = browserRetryDecision(input);
  const checkpoint = input.checkpoint && typeof input.checkpoint === 'object' ? input.checkpoint : {};
  const currentStep = String(checkpoint.current_step || input.step || '').trim();
  const resumeUrl = String(checkpoint.resume_url || input.currentUrl || '').trim();
  const attemptedStrategies = Array.isArray(input.attemptedStrategies) ? input.attemptedStrategies : [];
  const plan = retry.retry ? (RECOVERY_PLANS[retry.category] || [retry.action]) : [];
  const remainingStrategies = plan.filter((strategy) => !attemptedStrategies.includes(strategy));

  return {
    recoverable: retry.retry && remainingStrategies.length > 0,
    category: retry.category,
    retryCount: retry.retryCount,
    nextRetryCount: retry.nextRetryCount,
    maxRetries: retry.maxRetries,
    delayMs: retry.delayMs,
    checkpoint: {
      currentStep,
      resumeUrl,
      completedSections: normalizeCompletedFields(checkpoint.completed_sections),
    },
    attemptedStrategies,
    remainingStrategies,
    nextStrategy: remainingStrategies[0] || null,
    requiresHuman: !retry.retry || remainingStrategies.length === 0,
  };
}

export function preSubmissionDecision(input = {}) {
  const threshold = numberOr(input.threshold, DEFAULT_CONFIDENCE_THRESHOLD);
  const confidence = Math.max(0, Math.min(100, numberOr(input.confidence, 0)));
  const requiredFieldsComplete = input.requiredFieldsComplete === true;
  const integrityPassed = input.integrityPassed !== false;
  const evidenceAligned = input.evidenceAligned === true;
  const blockingReasons = [];

  if (!requiredFieldsComplete) blockingReasons.push('required_fields_incomplete');
  if (!integrityPassed) blockingReasons.push('application_integrity_failed');
  if (!evidenceAligned) blockingReasons.push('resume_job_evidence_not_aligned');
  if (confidence < threshold) blockingReasons.push('confidence_below_threshold');

  return {
    decision: blockingReasons.length ? 'tailor_first' : 'submit',
    confidence,
    threshold,
    blockingReasons,
  };
}
