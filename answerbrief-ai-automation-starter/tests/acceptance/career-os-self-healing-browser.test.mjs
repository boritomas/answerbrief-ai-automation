import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSelfHealingPlan, preSubmissionDecision } from '../../scripts/lib/career-os-self-healing-browser.mjs';

test('builds an ordered selector recovery plan and resumes from checkpoint', () => {
  const plan = buildSelfHealingPlan({
    browserException: 'selector not found for Continue button',
    retryCount: 0,
    checkpoint: {
      current_step: 'experience',
      resume_url: 'https://example.com/apply/experience',
      completed_sections: ['profile'],
    },
  });

  assert.equal(plan.recoverable, true);
  assert.equal(plan.category, 'selector');
  assert.equal(plan.nextStrategy, 'requery_accessibility_tree');
  assert.equal(plan.checkpoint.currentStep, 'experience');
  assert.equal(plan.checkpoint.resumeUrl, 'https://example.com/apply/experience');
  assert.deepEqual(plan.checkpoint.completedSections, ['profile']);
});

test('skips recovery strategies already attempted', () => {
  const plan = buildSelfHealingPlan({
    browserException: 'upload failed for resume',
    retryCount: 1,
    attemptedStrategies: ['verify_file_exists', 'requery_file_input'],
  });

  assert.equal(plan.nextStrategy, 'set_input_files_directly');
  assert.equal(plan.requiresHuman, false);
});

test('does not self-heal human-only gates', () => {
  const plan = buildSelfHealingPlan({ evidenceText: 'MFA code required', retryCount: 0 });
  assert.equal(plan.recoverable, false);
  assert.equal(plan.requiresHuman, true);
  assert.equal(plan.category, 'human_or_terminal_gate');
});

test('routes low-confidence applications to tailor first', () => {
  const decision = preSubmissionDecision({
    confidence: 62,
    requiredFieldsComplete: true,
    integrityPassed: true,
    evidenceAligned: true,
  });

  assert.equal(decision.decision, 'tailor_first');
  assert.deepEqual(decision.blockingReasons, ['confidence_below_threshold']);
});

test('allows submission only when quality gates pass', () => {
  const decision = preSubmissionDecision({
    confidence: 86,
    threshold: 75,
    requiredFieldsComplete: true,
    integrityPassed: true,
    evidenceAligned: true,
  });

  assert.equal(decision.decision, 'submit');
  assert.deepEqual(decision.blockingReasons, []);
});
