export const COMPENSATION_FLOOR_USD = 200000;
export const COMPENSATION_NEAR_FLOOR_MIN_USD = 175000;

export const COMPENSATION_STATUSES = Object.freeze({
  benefitTextIgnored: 'comp_benefit_text_ignored',
  belowFloorReject: 'comp_below_floor_reject',
  meetsFloor: 'comp_meets_floor',
  nearFloorReview: 'comp_near_floor_review',
  notPosted: 'comp_not_posted',
  parseUncertain: 'comp_parse_uncertain',
  unknownHold: 'comp_unknown_hold',
  unknownStrongFit: 'comp_unknown_strong_fit',
});

export function classifyCompensationPolicy(input = {}) {
  const maxUsd = numberValue(input.maxUsd ?? input.compensationMaxUsd ?? input.compensation_max_usd);
  const text = clean(input.text ?? input.compensationText ?? input.compensation_text);
  const context = clean([
    input.title,
    input.role,
    input.description,
    input.jobDescription,
    input.location,
  ].join(' '));
  const score = numberValue(input.score ?? input.fitScore ?? input.fit_score);
  const hasTotalComp = hasTotalCompensationEvidence(text);
  const benefitTextIgnored = hasBenefitOnlyCompensationText(text);
  const strongUnknown = !maxUsd && isSeniorStrategicRole(context) && score >= 85;

  if (maxUsd > 0 && hasTotalComp) {
    return result({
      autoEligible: true,
      eligible: true,
      holdReason: '',
      status: COMPENSATION_STATUSES.meetsFloor,
      warnings: [],
    });
  }
  if (maxUsd >= COMPENSATION_FLOOR_USD) {
    return result({
      autoEligible: true,
      eligible: true,
      holdReason: '',
      status: COMPENSATION_STATUSES.meetsFloor,
      warnings: [],
    });
  }
  if (maxUsd >= COMPENSATION_NEAR_FLOOR_MIN_USD) {
    return result({
      autoEligible: false,
      eligible: false,
      holdReason: COMPENSATION_STATUSES.nearFloorReview,
      status: COMPENSATION_STATUSES.nearFloorReview,
      warnings: [],
    });
  }
  if (maxUsd > 0) {
    return result({
      autoEligible: false,
      eligible: false,
      holdReason: COMPENSATION_STATUSES.belowFloorReject,
      status: COMPENSATION_STATUSES.belowFloorReject,
      warnings: [],
    });
  }
  if (strongUnknown) {
    return result({
      autoEligible: true,
      eligible: true,
      holdReason: '',
      status: COMPENSATION_STATUSES.unknownStrongFit,
      warnings: benefitTextIgnored ? [COMPENSATION_STATUSES.benefitTextIgnored] : [],
    });
  }
  return result({
    autoEligible: false,
    eligible: false,
    holdReason: benefitTextIgnored ? COMPENSATION_STATUSES.parseUncertain : COMPENSATION_STATUSES.unknownHold,
    status: benefitTextIgnored ? COMPENSATION_STATUSES.parseUncertain : COMPENSATION_STATUSES.notPosted,
    warnings: benefitTextIgnored ? [COMPENSATION_STATUSES.benefitTextIgnored] : [],
  });
}

export function hasTotalCompensationEvidence(value) {
  return /on target earnings|\bote\b|total compensation|bonus|equity|stock|commission|variable/i.test(String(value || ''));
}

export function hasBenefitOnlyCompensationText(value) {
  const text = clean(value).toLowerCase();
  return /401\(k\)|medical|vision|dental|benefit|commuter|tuition|paid parental|pto|vacation|stock at a discount/.test(text)
    && !/salary|base pay|pay range|base salary|compensation range|reasonable estimate/.test(text);
}

export function isSeniorStrategicRole(value) {
  return /director|senior director|sr director|principal|head of|vice president|\bvp\b|executive|chief|general manager/i.test(String(value || ''));
}

function result(value) {
  return {
    autoEligible: Boolean(value.autoEligible),
    eligible: Boolean(value.eligible),
    holdReason: clean(value.holdReason),
    status: clean(value.status),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(clean).filter(Boolean) : [],
  };
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
