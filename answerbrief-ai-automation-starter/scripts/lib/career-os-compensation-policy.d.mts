export const COMPENSATION_FLOOR_USD: number;
export const COMPENSATION_NEAR_FLOOR_MIN_USD: number;

export const COMPENSATION_STATUSES: Readonly<{
  benefitTextIgnored: string;
  belowFloorReject: string;
  meetsFloor: string;
  nearFloorReview: string;
  notPosted: string;
  parseUncertain: string;
  unknownHold: string;
  unknownStrongFit: string;
}>;

export function classifyCompensationPolicy(input?: Record<string, unknown>): {
  autoEligible: boolean;
  eligible: boolean;
  holdReason: string;
  status: string;
  warnings: string[];
};

export function hasTotalCompensationEvidence(value: unknown): boolean;

export function hasBenefitOnlyCompensationText(value: unknown): boolean;

export function isSeniorStrategicRole(value: unknown): boolean;
