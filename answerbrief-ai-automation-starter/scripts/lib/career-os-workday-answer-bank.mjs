import fs from 'node:fs';
import path from 'node:path';

const HUMAN_ONLY_SENSITIVITIES = new Set(['legal', 'protected_status']);
const RECONFIRM_SENSITIVITIES = new Set(['relocation', 'employment_history']);
const LEGAL_STANDING_AUTH_BLOCK_PATTERN = /non[- ]?compete|non[- ]?solicit|criminal|felony|conviction|conflict of interest|relative|family member|disability|veteran|gender|race|ethnicity|hispanic|latino/i;
const STANDARD_LEGAL_ACK_PATTERN = /certify|accurate|true|complete|acknowledge|acknowledgement|acknowledgment|agree|accept|authorize|authorization|consent|terms|conditions|privacy|notice|policy|electronic signature|applicant portal/i;

export function loadWorkdayAnswerBank(options = {}) {
  const configPath = options.configPath || path.resolve(process.cwd(), 'config/workday-answer-bank.json');
  const bank = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  validateWorkdayAnswerBank(bank);
  return bank;
}

export function validateWorkdayAnswerBank(bank) {
  if (!bank || typeof bank !== 'object') throw new Error('Workday answer bank is missing.');
  if (!Array.isArray(bank.answers) || !bank.answers.length) throw new Error('Workday answer bank has no answers.');
  for (const entry of bank.answers) {
    const field = clean(entry.canonicalField);
    if (!field) throw new Error('Workday answer bank entry is missing canonicalField.');
    if (!clean(entry.normalizedQuestion)) throw new Error(`Workday answer bank entry ${field} is missing normalizedQuestion.`);
    if (!Array.isArray(entry.provenance) || !entry.provenance.length) throw new Error(`Workday answer bank entry ${field} is missing provenance.`);
    if (!clean(entry.authorization)) throw new Error(`Workday answer bank entry ${field} is missing authorization.`);
    if (!clean(entry.sensitivity)) throw new Error(`Workday answer bank entry ${field} is missing sensitivity.`);
    if (!clean(entry.status)) throw new Error(`Workday answer bank entry ${field} is missing status.`);
  }
  return true;
}

export function analyzeWorkdayAnswerBank(bank = loadWorkdayAnswerBank()) {
  const answers = Array.isArray(bank.answers) ? bank.answers : [];
  const byStatus = {};
  for (const answer of answers) {
    byStatus[answer.status] = (byStatus[answer.status] || 0) + 1;
  }
  return {
    version: clean(bank.version),
    total: answers.length,
    reusableVerified: byStatus.reusable_verified || 0,
    reusableButReconfirm: byStatus.reusable_but_reconfirm || 0,
    humanOnly: byStatus.human_only || 0,
    staleOrConflicting: answers.filter((entry) => Array.isArray(entry.conflicts) && entry.conflicts.length).length,
    runtimeOnly: answers.filter((entry) => entry.answer && typeof entry.answer === 'object' && entry.answer.runtimeOnly).length,
    sensitive: answers.filter((entry) => !['standard', 'contact', 'public_profile'].includes(clean(entry.sensitivity))).length,
  };
}

export function normalizeQuestion(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findWorkdayAnswerEntry(label, bank = loadWorkdayAnswerBank()) {
  const target = normalizeQuestion(label);
  if (!target) return null;
  const entries = Array.isArray(bank.answers) ? bank.answers : [];
  const scored = entries
    .map((entry) => ({ entry, score: answerMatchScore(target, entry) }))
    .filter((item) => item.score >= 60)
    .sort((left, right) => right.score - left.score);
  return scored[0]?.entry || null;
}

export function resolveWorkdayAnswerForLabel(label, options = {}) {
  const bank = options.bank || loadWorkdayAnswerBank();
  const field = options.field || {};
  const currentValue = clean(options.currentValue ?? field.currentValue);
  if (currentValue && !isEmptyChoicePlaceholder(currentValue)) {
    return {
      action: 'preserve_existing',
      answer: null,
      canonicalField: '',
      confidence: 1,
      reason: 'Existing visible value is preserved.',
      safeToAutoFill: false,
      sensitivity: 'existing_value',
    };
  }

  const entry = findWorkdayAnswerEntry(label, bank);
  if (!entry) {
    return gateDecision({
      category: 'unknown',
      fieldLabel: label,
      reason: 'No canonical Workday answer-bank entry matched this field.',
      sensitivity: 'unknown',
    });
  }

  const sensitivity = clean(entry.sensitivity);
  const standingLegal = resolveStandingLegalAuthorization(entry, label, field, options);
  if (standingLegal) return standingLegal;

  if (entry.status === 'human_only' || entry.requiresApplicationSpecificConfirmation || HUMAN_ONLY_SENSITIVITIES.has(sensitivity)) {
    return gateDecision({
      category: categoryForEntry(entry),
      entry,
      fieldLabel: label,
      reason: `${entry.canonicalField} is human-only or requires application-specific confirmation.`,
      sensitivity,
    });
  }

  if (Array.isArray(entry.conflicts) && entry.conflicts.length) {
    return gateDecision({
      category: 'conflict',
      entry,
      fieldLabel: label,
      reason: `${entry.canonicalField} has recovered stale or conflicting source values and cannot be auto-used.`,
      sensitivity,
    });
  }

  if (entry.status === 'reusable_but_reconfirm' && RECONFIRM_SENSITIVITIES.has(sensitivity)) {
    return gateDecision({
      category: categoryForEntry(entry),
      entry,
      fieldLabel: label,
      reason: `${entry.canonicalField} should be reconfirmed for this Workday application.`,
      sensitivity,
    });
  }

  const answer = resolveEntryAnswer(entry, {
    candidate: options.candidate || options.task?.candidate || {},
    field,
    task: options.task || {},
  });
  if (!clean(answer)) {
    return gateDecision({
      category: 'low_confidence',
      entry,
      fieldLabel: label,
      reason: `${entry.canonicalField} resolved to an empty runtime value.`,
      sensitivity,
    });
  }

  const optionAnswer = resolveOptionAnswer(answer, field, entry);
  if (optionAnswer.gated) {
    return gateDecision({
      category: 'low_confidence',
      entry,
      fieldLabel: label,
      reason: optionAnswer.reason,
      sensitivity,
    });
  }

  return {
    action: isChoiceField(field, entry) ? 'select' : 'fill',
    answer: optionAnswer.answer,
    answerType: clean(entry.answerType),
    canonicalField: clean(entry.canonicalField),
    confidence: boundedConfidence(entry.confidence),
    entry,
    provenance: entry.provenance,
    reason: 'Resolved from canonical Workday answer bank.',
    safeToAutoFill: true,
    sensitivity,
    status: clean(entry.status),
  };
}

export function answerReportValue(resolution) {
  if (!resolution || !resolution.safeToAutoFill) return null;
  if (['contact', 'public_profile'].includes(clean(resolution.sensitivity))) return '[verified-profile-value]';
  if (clean(resolution.sensitivity) === 'salary') return '[verified-compensation-policy]';
  if (clean(resolution.sensitivity) === 'legal') return '[standing-authorized-legal-acknowledgment]';
  return clean(resolution.answer);
}

function answerMatchScore(target, entry) {
  const candidates = [
    entry.normalizedQuestion,
    clean(entry.canonicalField).replace(/_/g, ' '),
    ...(Array.isArray(entry.possibleLabelVariations) ? entry.possibleLabelVariations : []),
  ].map(normalizeQuestion).filter(Boolean);
  let score = 0;
  for (const candidate of candidates) {
    if (target === candidate) score = Math.max(score, 100);
    else if (target.includes(candidate) || candidate.includes(target)) score = Math.max(score, 86);
    else {
      const tokens = candidate.split(/\s+/).filter((token) => token.length > 2);
      if (tokens.length && tokens.every((token) => target.includes(token))) score = Math.max(score, 72);
    }
  }
  const field = clean(entry.canonicalField);
  if (field.includes('sponsorship') && /sponsor|visa|immigration/.test(target)) score = Math.max(score, field.includes('future') && /future|now or in the future/.test(target) ? 96 : 90);
  if (field === 'legally_authorized_to_work_us' && /authorized|right to work|work authorization/.test(target)) score = Math.max(score, 94);
  if (field === 'desired_base_salary' && /salary|base pay|base compensation/.test(target) && !/total/.test(target)) score = Math.max(score, 94);
  if (field === 'desired_total_compensation_text' && /total compensation|compensation expectation/.test(target)) score = Math.max(score, 94);
  if (field === 'legal_acknowledgment' && /certify|acknowledge|authorize|consent|signature|privacy|terms/.test(target)) score = Math.max(score, 98);
  if (field === 'voluntary_disclosure' && /gender|race|ethnicity|veteran|disability|self identification|self id/.test(target)) score = Math.max(score, 98);
  return score;
}

function resolveEntryAnswer(entry, context) {
  const answer = entry.answer;
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    const value = resolveRuntimeSource(clean(answer.runtimeSource), context);
    if (typeof value === 'boolean') return value ? clean(answer.truthyDisplay) || 'Yes' : clean(answer.falseyDisplay) || 'No';
    return clean(value);
  }
  return clean(answer);
}

function resolveRuntimeSource(source, context) {
  const candidate = context.candidate || {};
  const map = {
    'career_os_profiles.verified_profile.contact.first_name': candidate.firstName,
    'career_os_profiles.verified_profile.contact.last_name': candidate.lastName,
    'career_os_profiles.verified_profile.contact.email': candidate.email,
    'career_os_profiles.verified_profile.contact.phone': candidate.phone,
    'career_os_profiles.verified_profile.contact.street_address': candidate.streetAddress,
    'career_os_profiles.verified_profile.contact.city': candidate.city,
    'career_os_profiles.verified_profile.contact.state': candidate.stateOrProvince,
    'career_os_profiles.verified_profile.contact.postal_code': candidate.postalCode,
    'career_os_profiles.verified_profile.contact.linkedin': candidate.linkedin,
    'career_os_profiles.verified_profile.pronouns.answer': candidate.pronouns,
    'career_os_profiles.verified_profile.reusable_application_answers.us_work_authorization': candidate.usWorkAuthorization,
  };
  if (Object.prototype.hasOwnProperty.call(map, source)) return map[source];
  return source.split('.').reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, context.task?.rawRecord);
}

function resolveOptionAnswer(answer, field, entry) {
  const options = Array.isArray(field.options) ? field.options : [];
  if (!options.length && !isChoiceField(field, entry)) return { answer };
  if (!options.length) return { answer };
  const target = normalizeQuestion(answer);
  const exact = options.find((option) => normalizeQuestion(option.label || option.value) === target);
  if (exact) return { answer: clean(exact.label || exact.value) };
  if (target === 'internet search') {
    const equivalent = options.find((option) => normalizeQuestion(option.label || option.value) === 'online search');
    if (equivalent) return { answer: clean(equivalent.label || equivalent.value) };
  }
  const tokens = target.split(/\s+/).filter(Boolean);
  const fuzzy = options.find((option) => {
    const haystack = normalizeQuestion(`${option.label || ''} ${option.value || ''}`);
    return tokens.length > 1 && tokens.every((token) => haystack.includes(token));
  });
  if (fuzzy) return { answer: clean(fuzzy.label || fuzzy.value) };
  if (entry.canonicalField === 'pronouns') {
    return { gated: true, reason: 'Pronouns can only be selected when the exact Workday option is visible.' };
  }
  return { answer };
}

function resolveStandingLegalAuthorization(entry, label, field, options) {
  if (options.standingLegalAuthorization !== true) return null;
  const sensitivity = clean(entry.sensitivity);
  const canonicalField = clean(entry.canonicalField);
  if (sensitivity !== 'legal' && canonicalField !== 'legal_acknowledgment') return null;

  const fieldText = `${label || ''} ${field?.label || ''} ${field?.ariaLabel || ''} ${field?.placeholder || ''} ${field?.name || ''} ${field?.id || ''}`;
  if (!STANDARD_LEGAL_ACK_PATTERN.test(fieldText)) return null;
  if (LEGAL_STANDING_AUTH_BLOCK_PATTERN.test(fieldText)) {
    return gateDecision({
      category: 'legal',
      entry,
      fieldLabel: label,
      reason: `${canonicalField} contains legal or sensitive conflict language that still requires a human gate.`,
      sensitivity,
    });
  }

  const optionsList = Array.isArray(field?.options) ? field.options : [];
  const affirmative = optionsList.find((option) => /^(yes|i agree|agree|accept|accepted|acknowledge|acknowledged)/i.test(clean(option.label || option.value))
    && !/not|do not|decline|disagree/i.test(clean(option.label || option.value)));
  const answer = clean(affirmative?.label || affirmative?.value)
    || (isChoiceField(field || {}, entry) ? '__first_available__' : 'Accepted');
  return {
    action: 'select',
    answer,
    answerType: 'legal_acknowledgment',
    canonicalField,
    confidence: Math.min(boundedConfidence(entry.confidence), 0.96),
    entry,
    provenance: [...(Array.isArray(entry.provenance) ? entry.provenance : []), 'career_os_workday_first_standing_authorization'],
    reason: 'Resolved from Tomas standing Workday-first authorization for standard application acknowledgments.',
    safeToAutoFill: true,
    sensitivity: 'legal',
    status: 'standing_authorized',
    strategy: answer === '__first_available__' ? 'first_available' : undefined,
  };
}

function isChoiceField(field, entry) {
  const type = clean(field.type).toLowerCase();
  const role = clean(field.role).toLowerCase();
  const tagName = clean(field.tagName).toLowerCase();
  const answerType = clean(entry.answerType);
  return tagName === 'select'
    || type === 'radio'
    || type === 'checkbox'
    || role === 'combobox'
    || ['select', 'boolean_yes_no'].includes(answerType);
}

function categoryForEntry(entry) {
  const sensitivity = clean(entry.sensitivity);
  if (sensitivity.includes('salary')) return 'salary';
  if (sensitivity.includes('sponsorship')) return 'sponsorship';
  if (sensitivity.includes('relocation')) return 'relocation';
  if (sensitivity.includes('legal')) return 'legal';
  if (sensitivity.includes('protected')) return 'demographic';
  if (sensitivity.includes('employment')) return 'unknown';
  return 'unknown';
}

function gateDecision(input) {
  return {
    action: 'gate',
    answer: null,
    canonicalField: clean(input.entry?.canonicalField),
    category: clean(input.category) || 'unknown',
    confidence: boundedConfidence(input.entry?.confidence || 0.5),
    entry: input.entry || null,
    fieldLabel: clean(input.fieldLabel),
    reason: clean(input.reason),
    safeToAutoFill: false,
    sensitivity: clean(input.sensitivity) || 'unknown',
    status: clean(input.entry?.status) || 'unresolved',
  };
}

function isEmptyChoicePlaceholder(value) {
  return /^(select|choose|please select|none)$/i.test(clean(value));
}

function boundedConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}
