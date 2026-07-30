export type PhaseTwoWorkdayBacklogItem = {
  applicationId: string;
  blocker: string;
  classification:
    | 'phase_two_workday_blocker'
    | 'phase_two_account_recovery'
    | 'phase_two_selector_mapping'
    | 'phase_two_original_apply_replay'
    | 'phase_two_password_reset'
    | 'phase_two_employer_modal'
    | 'phase_two_user_decision';
  currentStatus: string;
  eligibleLater: boolean;
  employer: string;
  engineeringFixNeeded: boolean;
  lastEvidencePath: string;
  nextRequiredFix: string;
  recordedAt?: string;
  requisition: string;
  role: string;
  source?: string;
  tenant: string;
  tomasActionNeeded: boolean;
  url: string;
};

export const PHASE_TWO_WORKDAY_BLOCKER_STATUSES: readonly PhaseTwoWorkdayBacklogItem['classification'][];

export function classifyPhaseTwoWorkdayBlocker(application?: Record<string, unknown>): PhaseTwoWorkdayBacklogItem | null;

export function buildPhaseTwoBacklogItem(application?: Record<string, unknown>, now?: string): PhaseTwoWorkdayBacklogItem | null;
