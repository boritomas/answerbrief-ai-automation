import crypto from 'node:crypto';

import {
  COMPENSATION_FLOOR_USD,
  classifyCompensationPolicy,
} from './career-os-compensation-policy.mjs';

const OUTCOME_STATUSES = new Set([
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
]);

export function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalized(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export function classifyOutcomeEmail(input = {}) {
  const subject = clean(input.subject);
  const body = clean(input.body || input.text || input.snippet);
  const sender = clean(input.sender || input.from);
  const text = `${subject} ${body}`.toLowerCase();
  const rejectionSignal = /unfortunately|not moving forward|will not be moving forward|decided not to move forward|not to move forward|not move forward|not selected|not be proceeding|not proceed|other candidates|after careful consideration|regret to inform/i.test(text);

  let status = 'outcome_unknown';
  let rejectionType = 'unknown';
  let confidence = 0.42;
  let automated = /no[- ]?reply|noreply|do not reply|donotreply|automated|notification/i.test(sender);
  const reasons = [];

  if (rejectionSignal) {
    status = 'rejected_unknown_reason';
    rejectionType = /minimum qualifications|basic qualifications|required qualification/i.test(text)
      ? 'minimum_qualification'
      : /other candidates|candidate pool|more closely match|stronger alignment/i.test(text)
        ? 'competitive_pool'
        : 'generic_rejection';
    confidence = rejectionType === 'generic_rejection' ? 0.76 : 0.84;
    automated = automated || /thank you for your interest|application update/i.test(text);
    reasons.push(`${rejectionType} rejection language detected`);
  } else if (/interview|schedule a time|meet with|speak with|chat with (?:the|our)|recruiter/i.test(text)) {
    status = 'interview_requested';
    confidence = 0.86;
    reasons.push('interview language detected');
  } else if (/assessment|take[- ]home|coding challenge|skills test|complete .* exercise/i.test(text)) {
    status = 'assessment_requested';
    confidence = 0.82;
    reasons.push('assessment language detected');
  } else if (/survey|feedback survey|candidate experience|tell us about your experience/i.test(text)
    && !/not moving forward|will not be moving forward|decided not to move forward|not to move forward|not move forward|unfortunately|not selected|other candidates/i.test(text)) {
    status = 'feedback_requested';
    confidence = 0.78;
    reasons.push('feedback survey without rejection language');
  } else if (/duplicate application|already applied|previously submitted|duplicate submission/i.test(text)) {
    status = 'duplicate_submission_detected';
    confidence = 0.82;
    reasons.push('duplicate submission language detected');
  } else if (/position (?:has been )?(?:filled|closed)|role (?:has been )?(?:filled|closed)|job (?:is|has been) no longer available|withdrawn/i.test(text)) {
    status = 'withdrawn_or_closed';
    confidence = 0.78;
    reasons.push('role closed or filled language detected');
  } else if (/thank you for applying|received your application|application received|we have received|thank you for your application|your application (?:to|for).{0,120}(?:was|has been)?\s*(?:received|submitted)/i.test(text)) {
    status = 'submitted_confirmed';
    confidence = 0.72;
    reasons.push('application received confirmation language detected');
  } else if (/recruiter|talent acquisition|sourcer|hiring team/i.test(`${sender} ${text}`) && /application|opportunity|role|position|resume|candidate/i.test(text)) {
    status = 'recruiter_response';
    confidence = 0.68;
    reasons.push('non-terminal recruiter response language detected');
  } else if (/application update|follow-up on your application|status update/i.test(text)) {
    status = 'outcome_unknown';
    confidence = 0.56;
    reasons.push('generic application update without terminal language');
  }

  return {
    automated,
    confidence,
    invitesFutureApplications: /future opportunities|apply again|keep an eye|join our talent community/i.test(text),
    mentionsQualifications: /qualification|experience|requirements|skills/i.test(text),
    reasons,
    rejectionType,
    sender,
    status,
    subject,
  };
}

export function linkOutcomeEmailToApplication(email = {}, applications = []) {
  const explicitApplicationId = clean(email.applicationId || email.application_id || email.appId);
  if (explicitApplicationId) {
    const exact = applications.find((application) => clean(application.id) === explicitApplicationId);
    if (exact) {
      return {
        application: exact,
        confidence: 1,
        linked: true,
        reason: 'Explicit application id supplied by trusted outcome import.',
      };
    }
    return {
      application: null,
      confidence: 0,
      linked: false,
      reason: `Explicit application id ${explicitApplicationId} was not found.`,
    };
  }

  const employerHint = normalized(email.employer || email.company || email.sender || email.from || email.subject);
  const roleHint = normalized(email.role || email.title || email.subject || email.body || email.snippet);
  const reqHint = normalized(email.requisitionId || email.requisition || email.jobId || email.subject || email.body || email.snippet);
  const receivedAt = Date.parse(clean(email.receivedAt || email.date || email.timestamp));

  const scored = applications.map((application) => {
    const raw = asRecord(application.raw_record);
    const employer = normalized(application.employer);
    const role = normalized(application.position);
    const requisition = normalized(raw.external_requisition_id || raw.requisition_id || raw.job_id || raw.ats_job_id || application.opportunity_id);
    let score = 0;
    let identityScore = 0;
    if (employer && employerHint.includes(employer)) score += 45;
    if (employer && employerHint.includes(employer)) identityScore += 45;
    if (role && roleHint.includes(role.split(' ').slice(0, 5).join(' '))) {
      score += 25;
      identityScore += 25;
    }
    if (requisition && reqHint.includes(requisition)) {
      score += 55;
      identityScore += 55;
    }
    if (receivedAt && application.updated_at) {
      const submittedAt = Date.parse(String(application.updated_at));
      if (Number.isFinite(submittedAt) && receivedAt >= submittedAt) score += 10;
    }
    return { application, identityScore, score };
  }).sort((left, right) => right.identityScore - left.identityScore || right.score - left.score);

  const best = scored[0];
  if (!best || best.identityScore < 55) {
    return { application: null, confidence: 0, linked: false, reason: 'No application matched employer, role, requisition, or timing strongly enough.' };
  }
  return {
    application: best.application,
    confidence: Math.min(best.score / 100, 0.96),
    linked: true,
    reason: 'Employer/requisition/role evidence matched.',
  };
}

export function assessApplicationQuality(input = {}) {
  const application = asRecord(input.application);
  const posting = asRecord(input.posting);
  const raw = asRecord(application.raw_record);
  const artifacts = Array.isArray(input.artifacts) ? input.artifacts.map(asRecord) : [];
  const preferredMinimumBaseSalaryUsd = Number(input.preferredMinimumBaseSalaryUsd || COMPENSATION_FLOOR_USD);
  const text = [
    posting.title,
    posting.job_description,
    posting.normalized_description,
    posting.location,
    posting.work_arrangement,
    application.position,
    application.employer,
    raw.qualification_reason,
    raw.application_url,
  ].map(clean).join(' ');
  const lower = text.toLowerCase();
  const score = numberValue(posting.fit_score || raw.fit_score || raw.match_score || raw.score);
  const compensationMax = numberValue(posting.compensation_max_usd || raw.compensation_max_usd);
  const compensationText = clean(posting.compensation_text || raw.compensation_text);
  const compensationPolicy = classifyCompensationPolicy({
    description: text,
    maxUsd: compensationMax,
    score,
    text: compensationText,
    title: clean(posting.title || application.position),
  });
  const active = !hasAny(lower, ['closed', 'expired', 'no longer available']) && !hasAny(`${posting.posting_validation_status || posting.status || raw.status}`, ['inactive', 'closed', 'expired', 'unavailable']);
  const duplicate = Boolean(raw.duplicate_locked || /duplicate/.test(`${application.lifecycle_stage || ''} ${application.next_action || ''}`.toLowerCase()));
  const postingRaw = asRecord(posting.raw_record);
  const postingDetail = asRecord(postingRaw.detail);
  const postingInfo = asRecord(postingDetail.jobPostingInfo);
  const additionalLocations = [
    ...(Array.isArray(posting.additionalLocations) ? posting.additionalLocations : []),
    ...(Array.isArray(posting.additional_locations) ? posting.additional_locations : []),
    ...(Array.isArray(postingInfo.additionalLocations) ? postingInfo.additionalLocations : []),
  ].map(clean).filter(Boolean);

  const locationText = [
    posting.location,
    posting.work_arrangement,
    postingRaw.location,
    postingRaw.work_arrangement,
    postingInfo.location,
    ...additionalLocations,
  ].map(clean).join(' ').toLowerCase();

  const remoteEvidenceText = [
    posting.title,
    posting.work_arrangement,
    posting.job_description,
    posting.normalized_description,
    postingRaw.work_arrangement,
  ].map(clean).join(' ').toLowerCase();

  const texasLocation = /\b(texas|tx|dallas|plano|austin|irving|fort worth|houston|san antonio|frisco|richardson|arlington)\b/.test(locationText);

  const verifiedRemote = /\b(remote|work from home|home-based|home based|virtual position|anywhere in (?:the )?(?:united states|u\.s\.|us|usa))\b/.test(remoteEvidenceText)
    && !/\b(not remote|onsite only|on-site only|must report to an office)\b/.test(remoteEvidenceText);

  const explicitNonTexasOnsite = !texasLocation
    && /\b(hybrid|on-site|onsite|in-office|in office|relocation required|must be located in)\b/.test(remoteEvidenceText);

  const locationOk = texasLocation || verifiedRemote || !explicitNonTexasOnsite;
  const compensationOk = raw.total_compensation_exception_approved === true || compensationPolicy.eligible;
  const coverLetterAvailable = Boolean(
    clean(application.cover_letter)
    || artifacts.some((artifact) => clean(artifact.artifact_type) === 'cover_letter' && hasAny(`${artifact.validation_status || ''} ${artifact.approval_status || ''}`, ['passed', 'approved'])),
  );
  const seniorOrBorderline = score < 85 || /director|principal|head of|vp|vice president|executive/i.test(lower);
  const coverLetterNeeded = Boolean(seniorOrBorderline && !/intern|associate/i.test(lower));
  const hasResume = Boolean(clean(application.exact_resume) || artifacts.some((artifact) => clean(artifact.artifact_type).includes('resume')));
  const requiredQualificationConcern = findRequiredQualificationConcern(lower);
  const roleFamilyConcern = findRoleFamilyConcern([
    posting.title,
    posting.job_description,
    posting.normalized_description,
    posting.location,
  ].map(clean).join(' ') || lower);

  const holdReasons = [];
  const improvements = [];
  if (!active) holdReasons.push('role_not_active');
  if (duplicate) holdReasons.push('duplicate_or_terminal_record');
  if (score < 65) holdReasons.push('fit_score_below_65');
  else if (score < 75) holdReasons.push('fit_score_65_74_review_required');
  else if (score < 85 && !coverLetterAvailable) holdReasons.push('borderline_score_requires_cover_letter');
  if (!compensationOk) holdReasons.push(compensationPolicy.holdReason || compensationPolicy.status || 'compensation_policy_hold');
  holdReasons.push(...compensationPolicy.warnings);
  if (!locationOk) holdReasons.push('non_texas_location_without_verified_remote_or_relocation');
  if (!hasResume) holdReasons.push('approved_resume_missing');
  if (requiredQualificationConcern) holdReasons.push(requiredQualificationConcern);
  if (roleFamilyConcern) holdReasons.push(roleFamilyConcern);
  if (coverLetterNeeded && !coverLetterAvailable) improvements.push('generate_tailored_cover_letter');
  if (/ai|platform|automation|customer|enterprise/.test(lower)) improvements.push('surface_ai_platform_customer_keywords');

  const hardHold = holdReasons.some((reason) => !['borderline_score_requires_cover_letter'].includes(reason));
  const submitReady = !hardHold && (!coverLetterNeeded || coverLetterAvailable);
  const status = submitReady
    ? coverLetterNeeded ? 'ready_with_cover_letter' : 'ready_strong'
    : hardHold ? 'hold_for_quality' : 'needs_cover_letter';

  return {
    active,
    compensationOk,
    compensationPolicyStatus: compensationPolicy.status,
    compensationPolicyWarnings: compensationPolicy.warnings,
    coverLetterAvailable,
    coverLetterNeeded,
    duplicate,
    holdReasons: Array.from(new Set(holdReasons.filter(Boolean))),
    interviewReadinessGate: 'interview_conversion_readiness_v1',
    interviewReadinessScore: score,
    improvements: Array.from(new Set(improvements)),
    locationOk,
    packageComplete: hasResume && (!coverLetterNeeded || coverLetterAvailable),
    preferredMinimumBaseSalaryUsd,
    requiredQualificationConcern,
    roleFamilyConcern,
    score,
    status,
    submitReady,
    thresholdBand: score >= 85 ? '85_plus_strong_apply' : score >= 75 ? '75_84_cover_letter_or_rationale' : score >= 65 ? '65_74_hold_for_review' : 'below_65_reject',
  };
}

export function generateTailoredCoverLetter(input = {}) {
  const application = asRecord(input.application);
  const posting = asRecord(input.posting);
  const profile = asRecord(input.profile);
  const verifiedProfile = asRecord(profile.verified_profile);
  const employer = clean(application.employer || posting.company || 'the company');
  const role = clean(application.position || posting.title || 'the role');
  const description = clean(posting.job_description || posting.normalized_description);
  const signals = keywordSignals(description);
  const profileFacts = [
    'nearly 30 years of product management and digital transformation leadership at Verizon, a Fortune 50 telecommunications company',
    'enterprise product strategy, roadmap execution, and customer-experience modernization',
    'cross-functional stakeholder alignment across business, technology, operations, legal, compliance, analytics, and channel teams',
    'AI-enabled product and workflow transformation experience grounded in verified, non-confidential career facts',
  ];
  const name = clean(profile.display_name) || 'Tomas Nieves';
  const body = [
    `${name}`,
    '',
    `Dear ${employer} Hiring Team,`,
    '',
    `I am interested in the ${role} opportunity because it aligns with the product leadership work I have done across enterprise platforms, digital transformation, and customer-experience modernization. ${employer}'s need for disciplined product execution, clear prioritization, and measurable customer impact is the kind of environment where my background can contribute quickly.`,
    '',
    `My experience includes ${profileFacts[0]}, with product ownership spanning strategy, roadmap development, governance, and delivery across complex stakeholder groups. The role's emphasis on ${signals.slice(0, 3).join(', ') || 'product leadership, platform execution, and customer outcomes'} aligns with the executive product leadership, platform modernization, and customer-experience work reflected in my resume.`,
    '',
    `I bring concrete operating depth: leading product work through ambiguity, modernizing customer and associate-facing journeys, aligning technical and business teams, and translating strategic priorities into executable roadmaps. I have also invested in current AI fluency through AI-focused credentials and practical workflow transformation work, while keeping application materials limited to verified, non-confidential facts.`,
    '',
    `After a long Verizon tenure, I offer the depth of an operator who has seen platforms, customers, and organizations evolve over time. That experience is directly relevant to senior product roles that require judgment, resilience, and the ability to create alignment across business, technology, and customer needs.`,
    '',
    `I would welcome the opportunity to discuss how my product leadership background can help ${employer} advance the outcomes expected from this role.`,
    '',
    'Sincerely,',
    name,
  ].join('\n');

  return {
    content: body,
    generatedAt: new Date().toISOString(),
    hash: sha256Hex(body),
    source: 'career_os_quality_layer_template_v1',
  };
}

export function coverLetterFilename(application = {}) {
  const employer = slug(clean(application.employer || 'employer'));
  const role = slug(clean(application.position || 'role'));
  return `${employer}-${role}-cover-letter.txt`;
}

export function buildOutcomeIntelligence(input = {}) {
  const applications = Array.isArray(input.applications) ? input.applications.map(asRecord) : [];
  const artifacts = Array.isArray(input.artifacts) ? input.artifacts.map(asRecord) : [];
  const workflowEvents = Array.isArray(input.workflowEvents) ? input.workflowEvents.map(asRecord) : [];
  const outcomeEvents = workflowEvents.filter(isEmployerOutcomeEvent);
  const rejected = outcomeEvents.filter((event) => /^rejected_/i.test(clean(event.status))
    || /not moving forward|not selected|other candidates|regret to inform/i.test(`${event.status || ''} ${event.evidence_text || ''}`));
  const feedback = outcomeEvents.filter((event) => /^feedback_requested$/i.test(clean(event.status))
    || (/feedback|survey/i.test(`${event.status || ''} ${event.evidence_text || ''}`) && !rejected.includes(event)));
  const interviews = outcomeEvents.filter((event) => /^interview_requested$/i.test(clean(event.status)));
  const assessments = outcomeEvents.filter((event) => /^assessment_requested$/i.test(clean(event.status)));
  const submitted = applications.filter((application) => Boolean(application.confirmation_number || application.submission_evidence));
  const coverLetterArtifacts = artifacts.filter((artifact) => clean(artifact.artifact_type) === 'cover_letter');
  const uploadedCoverLetters = coverLetterArtifacts.filter((artifact) => asRecord(artifact.metadata).uploaded === true || asRecord(artifact.metadata).upload_evidence);
  const applicationIdsWithCoverLetters = new Set(coverLetterArtifacts.map((artifact) => clean(artifact.application_id)).filter(Boolean));
  const submittedWithoutCoverLetter = submitted.filter((application) => !applicationIdsWithCoverLetters.has(clean(application.id)) && !clean(application.cover_letter));
  const heldForQuality = applications.filter((application) => {
    const raw = asRecord(application.raw_record);
    return clean(raw.quality_gate_status) === 'hold_for_quality' || clean(raw.production_outcome) === 'quality_hold';
  });
  const responseRate = submitted.length ? Math.round(((rejected.length + feedback.length + interviews.length + assessments.length) / submitted.length) * 1000) / 10 : 0;

  return {
    assessments: assessments.length,
    coverLettersGenerated: coverLetterArtifacts.length,
    coverLettersUploaded: uploadedCoverLetters.length,
    fastRejections: rejected.filter((event) => clean(asRecord(event.metadata).rejection_speed_bucket) === 'fast' || /fast/i.test(`${event.evidence_text || ''}`)).length,
    feedbackRequests: feedback.length,
    heldForQuality: heldForQuality.length,
    interviews: interviews.length,
    plainEnglish: outcomeSummaryLine({ coverLetterArtifacts, heldForQuality, rejected, submitted, submittedWithoutCoverLetter }),
    rejections: rejected.length,
    responseRate,
    submittedAnalyzed: submitted.length,
    submittedWithoutCoverLetter: submittedWithoutCoverLetter.length,
  };
}

function isEmployerOutcomeEvent(event) {
  const type = clean(event.event_type);
  const status = clean(event.status);
  if (type === 'application_outcome_email') return true;
  return [
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
  ].includes(status);
}

function outcomeSummaryLine({ coverLetterArtifacts, heldForQuality, rejected, submitted, submittedWithoutCoverLetter }) {
  if (!submitted.length) return 'Career OS has no submitted applications to analyze yet.';
  if (rejected.length || submittedWithoutCoverLetter.length) {
    return `Career OS analyzed ${submitted.length} submitted applications, found ${rejected.length} rejection signal(s), and identified ${submittedWithoutCoverLetter.length} submitted application(s) without a recorded cover letter. Future submissions now require stronger fit and a tailored cover letter when useful.`;
  }
  return `Career OS analyzed ${submitted.length} submitted applications. The quality layer is active, with ${coverLetterArtifacts.length} cover letter artifact(s) recorded and ${heldForQuality.length} weak-fit application(s) held back.`;
}

function keywordSignals(text) {
  const lower = clean(text).toLowerCase();
  const signals = [];
  if (/ai|artificial intelligence|machine learning/.test(lower)) signals.push('AI-enabled product transformation');
  if (/platform|api|ecosystem|enterprise/.test(lower)) signals.push('enterprise platform strategy');
  if (/customer|experience|journey|outcomes/.test(lower)) signals.push('customer outcome leadership');
  if (/security|trust|risk|compliance/.test(lower)) signals.push('high-trust product execution');
  if (/roadmap|strategy|prioritization/.test(lower)) signals.push('roadmap and prioritization discipline');
  if (/cross-functional|stakeholder|partner/.test(lower)) signals.push('cross-functional alignment');
  return Array.from(new Set(signals)).slice(0, 5);
}

function findRequiredQualificationConcern(text) {
  if (/phd required|doctorate required/.test(text)) return 'required_credential_not_verified';
  if (/mba required/.test(text)) return 'required_mba_not_verified';
  if (/security clearance required|active clearance required/.test(text)) return 'required_clearance_not_verified';
  if (/must be located in/.test(text) && !/remote|texas|dallas|plano|austin/.test(text)) return 'location_requirement_conflict';
  return '';
}

function findRoleFamilyConcern(text) {
  const lower = clean(text).toLowerCase();
  const productSignals = /product management|product manager|product owner|product director|product strategy|product roadmap|platform product|digital product|customer experience|cx|portfolio|roadmap|pricing product|bss|oss|api product|enterprise product/.test(lower);
  const platformSignals = /platform|api|ecosystem|customer experience|digital|ai|automation|enterprise|telecom|bss|oss|data product|product-led/.test(lower);
  const salesSignals = /quota|pipeline generation|sales target|book of business|account executive|sales executive|territory sales|hunter|cold call|prospecting/.test(lower);
  const channelSignals = /channel sales|partner sales|var\b|reseller|sell-through|sell through|distribution partner|alliances sales|partner quota/.test(lower);
  const engineeringSignals = /hands-on coding|write code|software engineer|engineering manager|architect role|devops|site reliability|sre|on-call|java|python|kubernetes/.test(lower);
  const cpaasApiSignals = /cpaas|communications api|messaging api|voice api|contact center api|programmable communications/.test(lower);

  if (channelSignals && !(productSignals && platformSignals)) return 'channel_var_requires_stronger_evidence';
  if (salesSignals && !productSignals) return 'pure_sales_role_family_hold';
  if (engineeringSignals && !productSignals) return 'engineering_heavy_role_family_hold';
  if (cpaasApiSignals && !(productSignals && platformSignals)) return 'cpaas_api_requires_product_platform_evidence';
  return '';
}

function hasAny(value, terms) {
  const text = String(value || '').toLowerCase();
  return terms.some((term) => text.includes(String(term).toLowerCase()));
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function slug(value) {
  return normalized(value).replace(/\s+/g, '-').slice(0, 90) || 'career-os';
}

export function validOutcomeStatus(status) {
  return OUTCOME_STATUSES.has(clean(status));
}
