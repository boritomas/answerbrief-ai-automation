import type { JsonRecord, UserGate } from './contracts';

export type CanonicalFieldSensitivity =
  | 'standard'
  | 'contact'
  | 'employment'
  | 'salary'
  | 'relocation'
  | 'sponsorship'
  | 'legal'
  | 'demographic'
  | 'disability'
  | 'veteran'
  | 'conflict_disclosure';

export type CanonicalAuthorizationStatus =
  | 'authorized'
  | 'authorized_for_reuse'
  | 'authorized_for_application'
  | 'authorization_required'
  | 'not_authorized'
  | 'user_decision_required'
  | 'unknown';

export type CanonicalFieldValue = {
  canonicalFieldKey: string;
  value?: unknown;
  displayValue?: string;
  source: string;
  confidence: number;
  verified: boolean;
  authorizationStatus: CanonicalAuthorizationStatus;
  sensitivityClassification: CanonicalFieldSensitivity;
  reviewedAt?: string;
  expiresAt?: string;
  reasonUnavailable?: string;
  provenance: JsonRecord;
};

export type AtsRequestedField = {
  atsFieldIdentifier?: string;
  visibleLabel: string;
  controlType: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file' | 'combobox' | 'unknown';
  options: string[];
  required: boolean;
  surroundingContext?: string;
};

export type CanonicalFieldMappingResult = {
  requestedField: AtsRequestedField;
  canonicalFieldKey?: string;
  value?: unknown;
  displayValue?: string;
  confidence: number;
  verified: boolean;
  authorizationStatus: CanonicalAuthorizationStatus;
  sensitivityClassification: CanonicalFieldSensitivity;
  canAutofill: boolean;
  reasonUnavailable?: string;
  userGate?: UserGate;
  provenance: JsonRecord;
};

export const SENSITIVE_FIELD_CLASSIFICATIONS: CanonicalFieldSensitivity[] = [
  'salary',
  'relocation',
  'sponsorship',
  'legal',
  'demographic',
  'disability',
  'veteran',
  'conflict_disclosure',
];

export function resolveCanonicalFieldValue(
  requestedField: AtsRequestedField,
  candidateValues: CanonicalFieldValue[],
  options: { minimumConfidence?: number } = {},
): CanonicalFieldMappingResult {
  const minimumConfidence = options.minimumConfidence ?? 0.82;
  const match = candidateValues.find((candidate) => fieldMatches(requestedField, candidate));

  if (!match) {
    return unavailable(requestedField, 'missing_canonical_value', {
      requestedLabel: requestedField.visibleLabel,
    });
  }

  if (!match.verified) {
    return unavailable(requestedField, 'value_not_verified', match.provenance, match);
  }

  if (hasConflictingProvenance(match.provenance)) {
    return unavailable(requestedField, 'conflicting_provenance', match.provenance, match);
  }

  if (isExpired(match.expiresAt)) {
    return unavailable(requestedField, 'value_expired', match.provenance, match);
  }

  if (match.confidence < minimumConfidence) {
    return unavailable(requestedField, 'low_confidence_value', match.provenance, match);
  }

  if (match.sensitivityClassification === 'legal' && match.authorizationStatus !== 'authorized_for_application') {
    return unavailable(requestedField, 'legal_consent_requires_application_review', match.provenance, match);
  }

  if (isUserControlledSelfId(match.sensitivityClassification)) {
    return unavailable(requestedField, 'demographic_decision_user_controlled', match.provenance, match);
  }

  if (isSensitive(match.sensitivityClassification) && !hasExplicitSensitiveAuthorization(match.authorizationStatus)) {
    return unavailable(requestedField, 'sensitive_value_requires_authorization', match.provenance, match);
  }

  if (!hasAutofillAuthorization(match.authorizationStatus)) {
    return unavailable(requestedField, 'authorization_required', match.provenance, match);
  }

  return {
    requestedField,
    canonicalFieldKey: match.canonicalFieldKey,
    value: match.value,
    displayValue: match.displayValue,
    confidence: match.confidence,
    verified: match.verified,
    authorizationStatus: match.authorizationStatus,
    sensitivityClassification: match.sensitivityClassification,
    canAutofill: true,
    provenance: match.provenance,
  };
}

export function canonicalFieldValue(input: CanonicalFieldValue): CanonicalFieldValue {
  return input;
}

export function inferSensitivityFromLabel(label: string): CanonicalFieldSensitivity {
  const text = normalize(label);
  if (/salary|compensation|pay|wage/.test(text)) return 'salary';
  if (/relocat|commute|travel/.test(text)) return 'relocation';
  if (/sponsor|visa|work authorization|authorized to work/.test(text)) return 'sponsorship';
  if (/consent|acknowledge|terms|privacy|arbitration|background|drug screen|certify/.test(text)) return 'legal';
  if (/gender|ethnicity|race|demographic/.test(text)) return 'demographic';
  if (/disabilit/.test(text)) return 'disability';
  if (/veteran/.test(text)) return 'veteran';
  if (/conflict|relative|non compete|previously worked/.test(text)) return 'conflict_disclosure';
  if (/employer|job title|start date|end date|education/.test(text)) return 'employment';
  if (/email|phone|address|city|state|postal/.test(text)) return 'contact';
  return 'standard';
}

function unavailable(
  requestedField: AtsRequestedField,
  reasonUnavailable: string,
  provenance: JsonRecord,
  match?: CanonicalFieldValue,
): CanonicalFieldMappingResult {
  return {
    requestedField,
    canonicalFieldKey: match?.canonicalFieldKey,
    displayValue: match?.displayValue,
    value: match?.value,
    confidence: match?.confidence ?? 0,
    verified: match?.verified ?? false,
    authorizationStatus: match?.authorizationStatus ?? 'unknown',
    sensitivityClassification: match?.sensitivityClassification ?? inferSensitivityFromLabel(requestedField.visibleLabel),
    canAutofill: false,
    reasonUnavailable,
    userGate: userGateFor(reasonUnavailable, requestedField, match),
    provenance,
  };
}

function fieldMatches(requestedField: AtsRequestedField, candidate: CanonicalFieldValue) {
  const requested = normalize(`${requestedField.visibleLabel} ${requestedField.atsFieldIdentifier || ''}`);
  const candidateKey = normalize(candidate.canonicalFieldKey);
  if (!requested || !candidateKey) return false;
  if (requested.includes(candidateKey)) return true;
  const aliases = aliasesFor(candidate.canonicalFieldKey).map(normalize);
  return aliases.some((alias) => alias && requested.includes(alias));
}

function aliasesFor(key: string) {
  const normalized = normalize(key);
  const aliases: Record<string, string[]> = {
    'first name': ['first name', 'legal first name'],
    'last name': ['last name', 'legal last name'],
    email: ['email', 'email address'],
    phone: ['phone', 'phone number'],
    city: ['city'],
    state: ['state', 'state or province'],
    'postal code': ['postal code', 'zip code', 'zip'],
    'sponsorship now': ['sponsorship', 'visa sponsorship', 'require sponsorship'],
    'salary expectation': ['salary', 'compensation', 'desired pay', 'desired compensation'],
    'legal consent': ['consent', 'acknowledge', 'certify', 'privacy policy', 'terms', 'arbitration', 'background check', 'drug screen'],
    relocation: ['relocation', 'willing to relocate'],
  };
  return aliases[normalized] || [key.replace(/_/g, ' ')];
}

function isSensitive(classification: CanonicalFieldSensitivity) {
  return SENSITIVE_FIELD_CLASSIFICATIONS.includes(classification);
}

function isUserControlledSelfId(classification: CanonicalFieldSensitivity) {
  return classification === 'demographic'
    || classification === 'disability'
    || classification === 'veteran';
}

function hasAutofillAuthorization(status: CanonicalAuthorizationStatus) {
  return status === 'authorized'
    || status === 'authorized_for_reuse'
    || status === 'authorized_for_application';
}

function hasExplicitSensitiveAuthorization(status: CanonicalAuthorizationStatus) {
  return status === 'authorized_for_reuse'
    || status === 'authorized_for_application';
}

function isExpired(expiresAt?: string) {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time < Date.now();
}

function hasConflictingProvenance(provenance: JsonRecord) {
  const conflicts = provenance.conflicts;
  return Array.isArray(conflicts) ? conflicts.length > 0 : Boolean(conflicts);
}

function userGateFor(
  reasonUnavailable: string,
  requestedField: AtsRequestedField,
  match?: CanonicalFieldValue,
): UserGate | undefined {
  const classification = match?.sensitivityClassification ?? inferSensitivityFromLabel(requestedField.visibleLabel);
  const label = requestedField.visibleLabel || match?.canonicalFieldKey || 'application field';
  const rawSignals = {
    reasonUnavailable,
    canonicalFieldKey: match?.canonicalFieldKey,
    confidence: match?.confidence,
    authorizationStatus: match?.authorizationStatus,
    provenance: match?.provenance,
  };

  if (reasonUnavailable === 'low_confidence_value') {
    return {
      category: 'LOW_CONFIDENCE_ANSWER',
      label,
      reason: 'The best available answer is below the configured confidence threshold.',
      rawSignals,
    };
  }

  if (
    reasonUnavailable === 'missing_canonical_value'
    || reasonUnavailable === 'value_not_verified'
    || reasonUnavailable === 'value_expired'
    || reasonUnavailable === 'conflicting_provenance'
  ) {
    return {
      category: 'MISSING_VERIFIED_FACT',
      label,
      reason: 'A verified, current, conflict-free candidate fact is required before autofill.',
      rawSignals,
    };
  }

  if (classification === 'salary') {
    return {
      category: 'SALARY_DECISION_REQUIRED',
      label,
      reason: 'Salary or compensation answers require explicit approval before reuse.',
      rawSignals,
    };
  }

  if (classification === 'relocation') {
    return {
      category: 'RELOCATION_DECISION_REQUIRED',
      label,
      reason: 'Relocation answers require an application-specific decision.',
      rawSignals,
    };
  }

  if (classification === 'sponsorship') {
    return {
      category: 'SPONSORSHIP_DECISION_REQUIRED',
      label,
      reason: 'Sponsorship or work-authorization answers require explicit approval before reuse.',
      rawSignals,
    };
  }

  if (classification === 'legal') {
    const legalText = normalize(label);
    if (/background/.test(legalText)) {
      return {
        category: 'BACKGROUND_CHECK_CONSENT_REQUIRED',
        label,
        reason: 'Background-check consents require application-specific review.',
        rawSignals,
      };
    }
    if (/drug/.test(legalText)) {
      return {
        category: 'DRUG_SCREEN_CONSENT_REQUIRED',
        label,
        reason: 'Drug-screen consents require application-specific review.',
        rawSignals,
      };
    }
    if (/arbitration/.test(legalText)) {
      return {
        category: 'ARBITRATION_CONSENT_REQUIRED',
        label,
        reason: 'Arbitration consents require application-specific review.',
        rawSignals,
      };
    }
    return {
      category: 'LEGAL_CONSENT_REQUIRED',
      label,
      reason: 'Legal acknowledgements and consents require application-specific review.',
      rawSignals,
    };
  }

  if (classification === 'demographic') {
    return {
      category: 'DEMOGRAPHIC_DECISION_REQUIRED',
      label,
      reason: 'Demographic self-identification fields remain user-controlled.',
      rawSignals,
    };
  }

  if (classification === 'disability') {
    return {
      category: 'DISABILITY_SELF_ID_REQUIRED',
      label,
      reason: 'Disability self-identification fields remain user-controlled.',
      rawSignals,
    };
  }

  if (classification === 'veteran') {
    return {
      category: 'VETERAN_SELF_ID_REQUIRED',
      label,
      reason: 'Veteran self-identification fields remain user-controlled.',
      rawSignals,
    };
  }

  if (classification === 'conflict_disclosure') {
    return {
      category: 'CONFLICT_DISCLOSURE_REQUIRED',
      label,
      reason: 'Conflict disclosures require application-specific review.',
      rawSignals,
    };
  }

  return undefined;
}

function normalize(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
