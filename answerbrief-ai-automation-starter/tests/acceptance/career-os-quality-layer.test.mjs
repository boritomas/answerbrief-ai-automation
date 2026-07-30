import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessApplicationQuality,
  buildOutcomeIntelligence,
  classifyOutcomeEmail,
  generateTailoredCoverLetter,
  linkOutcomeEmailToApplication,
  validOutcomeStatus,
} from '../../scripts/lib/career-os-quality-layer.mjs';

const baseApplication = {
  id: 'app-1',
  employer: 'Capital One',
  position: 'Director, Product Management',
  exact_resume: 'Approved Tomas resume content',
  raw_record: {
    application_url: 'https://capitalone.example/jobs/R123',
    external_requisition_id: 'R123',
  },
  updated_at: '2026-07-26T12:00:00.000Z',
};

const basePosting = {
  id: 'posting-1',
  company: 'Capital One',
  title: 'Director, Product Management',
  fit_score: 88,
  job_description: 'Lead product management, platform strategy, AI transformation, customer outcomes, roadmap, and cross-functional execution. Remote United States.',
  location: 'Remote, United States',
  compensation_max_usd: 280000,
  posting_validation_status: 'active',
};

test('feedback survey emails are not classified as rejections without rejection language', () => {
  const result = classifyOutcomeEmail({
    from: 'candidate-experience@example.com',
    subject: 'Tell us about your application experience',
    body: 'Please complete this feedback survey about your candidate experience.',
  });
  assert.equal(result.status, 'feedback_requested');
  assert.equal(result.rejectionType, 'unknown');
});

test('rejection emails classify as rejection even when interview language is present', () => {
  const result = classifyOutcomeEmail({
    from: 'no-reply@example.com',
    subject: 'Application update',
    body: 'Unfortunately, we will not be moving forward to an interview. Other candidates more closely match our requirements.',
  });
  assert.equal(result.status, 'rejected_unknown_reason');
  assert.equal(result.rejectionType, 'competitive_pool');
  assert.equal(result.automated, true);
});

test('rejection emails classify decided-not-to-move-forward wording', () => {
  const result = classifyOutcomeEmail({
    from: 'affirm.com Recruiting',
    subject: 'Follow-up on your application to Affirm',
    body: 'Unfortunately, we have decided not to move forward with your candidacy at this time.',
  });
  assert.equal(result.status, 'rejected_unknown_reason');
  assert.equal(result.rejectionType, 'generic_rejection');
});

test('outcome statuses include the requested production vocabulary', () => {
  for (const status of [
    'submitted_confirmed',
    'feedback_requested',
    'rejected_fast',
    'rejected_after_review',
    'rejected_unknown_reason',
    'recruiter_response',
    'interview_requested',
    'assessment_requested',
    'duplicate_submission_detected',
    'withdrawn_or_closed',
    'outcome_unknown',
  ]) {
    assert.equal(validOutcomeStatus(status), true, `${status} should be supported`);
  }
});

test('outcome email links by employer and requisition evidence', () => {
  const result = linkOutcomeEmailToApplication({
    from: 'capitalone@example.com',
    subject: 'Capital One application update R123',
    body: 'Thank you for applying for Director, Product Management R123.',
    date: '2026-07-27T12:00:00.000Z',
  }, [baseApplication]);
  assert.equal(result.linked, true);
  assert.equal(result.application.id, 'app-1');
});

test('outcome email can link by explicit trusted application id', () => {
  const result = linkOutcomeEmailToApplication({
    applicationId: 'app-1',
    from: 'affirm@example.com',
    subject: 'Follow-up on your application',
    body: 'Unfortunately, we have decided not to move forward.',
  }, [baseApplication]);
  assert.equal(result.linked, true);
  assert.equal(result.confidence, 1);
  assert.equal(result.application.id, 'app-1');
});

test('outcome email does not link on employer-only weak evidence', () => {
  const result = linkOutcomeEmailToApplication({
    from: 'Capital One Recruiting',
    subject: 'Thank you for your interest',
    body: 'Unfortunately, we decided to move forward with other candidates.',
    date: '2026-07-27T12:00:00.000Z',
  }, [baseApplication]);
  assert.equal(result.linked, false);
  assert.equal(result.application, null);
});

test('quality gate marks 85+ active complete packages ready', () => {
  const result = assessApplicationQuality({
    application: baseApplication,
    posting: basePosting,
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(result.thresholdBand, '85_plus_strong_apply');
  assert.equal(result.submitReady, true);
});

test('senior 85+ applications still require a tailored cover letter before submit', () => {
  const result = assessApplicationQuality({
    application: baseApplication,
    posting: basePosting,
    artifacts: [],
  });
  assert.equal(result.thresholdBand, '85_plus_strong_apply');
  assert.equal(result.coverLetterNeeded, true);
  assert.equal(result.submitReady, false);
  assert.equal(result.status, 'needs_cover_letter');
});

test('75-84 applications require a tailored cover letter before submit', () => {
  const withoutLetter = assessApplicationQuality({
    application: baseApplication,
    posting: { ...basePosting, fit_score: 82 },
    artifacts: [],
  });
  assert.equal(withoutLetter.submitReady, false);
  assert.ok(withoutLetter.holdReasons.includes('borderline_score_requires_cover_letter'));

  const withLetter = assessApplicationQuality({
    application: baseApplication,
    posting: { ...basePosting, fit_score: 82 },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(withLetter.submitReady, true);
});

test('65-74 and below-65 applications are held for stronger fit', () => {
  const review = assessApplicationQuality({
    application: baseApplication,
    posting: { ...basePosting, fit_score: 70 },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(review.submitReady, false);
  assert.ok(review.holdReasons.includes('fit_score_65_74_review_required'));

  const reject = assessApplicationQuality({
    application: baseApplication,
    posting: { ...basePosting, fit_score: 55 },
    artifacts: [],
  });
  assert.equal(reject.submitReady, false);
  assert.ok(reject.holdReasons.includes('fit_score_below_65'));
});

test('compensation floor is enforced unless compensation is strategic total compensation', () => {
  const belowBase = assessApplicationQuality({
    application: baseApplication,
    posting: { ...basePosting, compensation_max_usd: 160000, compensation_text: '$145,000-$160,000 base', fit_score: 90 },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(belowBase.submitReady, false);
  assert.equal(belowBase.compensationPolicyStatus, 'comp_below_floor_reject');
  assert.ok(belowBase.holdReasons.includes('comp_below_floor_reject'));

  const nearFloor = assessApplicationQuality({
    application: baseApplication,
    posting: { ...basePosting, compensation_max_usd: 189000, compensation_text: '$175,000-$189,000 base', fit_score: 90 },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(nearFloor.submitReady, false);
  assert.equal(nearFloor.compensationPolicyStatus, 'comp_near_floor_review');
  assert.ok(nearFloor.holdReasons.includes('comp_near_floor_review'));

  const totalComp = assessApplicationQuality({
    application: baseApplication,
    posting: { ...basePosting, compensation_max_usd: 210000, compensation_text: '$210,000 base plus bonus and equity', fit_score: 90 },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(totalComp.compensationOk, true);
  assert.equal(totalComp.compensationPolicyStatus, 'comp_meets_floor');
});

test('unknown compensation can pass only for strong senior product fit', () => {
  const strongUnknown = assessApplicationQuality({
    application: baseApplication,
    posting: { ...basePosting, compensation_max_usd: undefined, compensation_text: '', fit_score: 92 },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(strongUnknown.compensationPolicyStatus, 'comp_unknown_strong_fit');
  assert.equal(strongUnknown.compensationOk, true);
  assert.equal(strongUnknown.submitReady, true);

  const weakUnknown = assessApplicationQuality({
    application: { ...baseApplication, position: 'Product Manager' },
    posting: { ...basePosting, title: 'Product Manager', compensation_max_usd: undefined, compensation_text: '401(k), medical, dental, and commuter benefits', fit_score: 72 },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(weakUnknown.submitReady, false);
  assert.equal(weakUnknown.compensationPolicyStatus, 'comp_parse_uncertain');
  assert.ok(weakUnknown.holdReasons.includes('comp_benefit_text_ignored'));
});

test('role-family guardrails hold sales, VAR, and engineering-heavy roles without product evidence', () => {
  const sales = assessApplicationQuality({
    application: baseApplication,
    posting: {
      ...basePosting,
      title: 'Senior Channel Sales Manager',
      job_description: 'Own reseller pipeline, partner quota, VAR sell-through motions, and territory sales targets. Remote United States.',
      fit_score: 88,
    },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(sales.submitReady, false);
  assert.ok(sales.holdReasons.includes('channel_var_requires_stronger_evidence'));

  const cpaasProduct = assessApplicationQuality({
    application: baseApplication,
    posting: {
      ...basePosting,
      title: 'Director Product Management, Communications API Platform',
      job_description: 'Lead CPaaS communications API platform product strategy, roadmap, customer experience, ecosystem, AI automation, and telecom product outcomes. Remote United States.',
      fit_score: 90,
    },
    artifacts: [{ artifact_type: 'cover_letter', validation_status: 'passed', approval_status: 'approved_for_automation' }],
  });
  assert.equal(cpaasProduct.submitReady, true);
  assert.equal(cpaasProduct.roleFamilyConcern, '');
});

test('cover letter generation is role-specific and avoids unsupported numeric claims', () => {
  const letter = generateTailoredCoverLetter({
    application: baseApplication,
    posting: basePosting,
    profile: { display_name: 'Tomas Nieves' },
  });
  assert.match(letter.content, /Capital One/);
  assert.match(letter.content, /Director, Product Management/);
  assert.match(letter.content, /nearly 30 years of Verizon/);
  assert.doesNotMatch(letter.content, /\d+%|\$\d/);
});

test('outcome intelligence counts rejections, feedback, quality holds, and cover letters', () => {
  const result = buildOutcomeIntelligence({
    applications: [
      { ...baseApplication, confirmation_number: 'ABC' },
      { id: 'app-2', employer: 'Affirm', position: 'Director', raw_record: { quality_gate_status: 'hold_for_quality' } },
    ],
    artifacts: [
      { application_id: 'app-1', artifact_type: 'cover_letter', metadata: { uploaded: true } },
    ],
    workflowEvents: [
      { event_type: 'application_outcome_email', status: 'rejected_unknown_reason', evidence_text: 'not moving forward', metadata: { rejection_speed_bucket: 'fast' } },
      { event_type: 'application_outcome_email', status: 'feedback_requested', evidence_text: 'feedback survey' },
      { event_type: 'application_quality_hold', status: 'quality_hold', evidence_text: 'held' },
    ],
  });
  assert.equal(result.submittedAnalyzed, 1);
  assert.equal(result.rejections, 1);
  assert.equal(result.feedbackRequests, 1);
  assert.equal(result.fastRejections, 1);
  assert.equal(result.coverLettersGenerated, 1);
  assert.equal(result.coverLettersUploaded, 1);
  assert.equal(result.heldForQuality, 1);
});
