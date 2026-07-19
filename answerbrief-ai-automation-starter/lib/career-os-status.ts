import { existsSync, readFileSync } from 'fs';
import path from 'path';

export type CareerOsStatus = {
  environment: 'production' | 'unconfigured';
  generatedAt: string;
  greetingName: string;
  dailyDiscoveries: number;
  activeOpportunities: number;
  worthApplyingToday: number;
  preparedPackages: number;
  submittedApplications: number;
  humanOnlyGates: number;
  salaryRange?: {
    minUsd?: number;
    maxUsd?: number;
    complete: boolean;
  };
  nextAction?: {
    label: string;
    reason: string;
    estimatedMinutes?: number;
    deepLink?: string;
  };
  productionEvidenceReady: boolean;
  blocker?: string;
};

type ProductionEvidence = {
  liveApplication?: Partial<CareerOsStatus>;
};

export function getCareerOsStatus(): CareerOsStatus {
  const evidencePath = process.env.CAREER_OS_PRODUCTION_EVIDENCE_PATH || process.env.CAREER_OS_STATUS_PATH;

  if (evidencePath) {
    const resolved = path.resolve(evidencePath);
    if (existsSync(resolved)) {
      const evidence = JSON.parse(readFileSync(resolved, 'utf8')) as ProductionEvidence;
      if (evidence.liveApplication) {
        return normalizeStatus(evidence.liveApplication, true);
      }
    }
  }

  return normalizeStatus({
    environment: 'unconfigured',
    greetingName: 'Tomas',
    dailyDiscoveries: 0,
    activeOpportunities: 0,
    worthApplyingToday: 0,
    preparedPackages: 0,
    submittedApplications: 0,
    humanOnlyGates: 0,
    productionEvidenceReady: false,
    blocker: 'No production Career OS evidence file is configured for this deployment.',
  }, false);
}

export function summarizeCareerOsStatus(status: CareerOsStatus) {
  const salary = status.salaryRange?.complete && status.salaryRange.minUsd && status.salaryRange.maxUsd
    ? `$${Math.round(status.salaryRange.minUsd / 1000)}K-$${Math.round(status.salaryRange.maxUsd / 1000)}K`
    : 'Salary information is incomplete.';

  return {
    greeting: `Good morning, ${status.greetingName}.`,
    discoveryLine: status.productionEvidenceReady
      ? `I found ${status.dailyDiscoveries} jobs that match your background.`
      : 'Career OS has no connected production discovery evidence yet.',
    applyLine: `${status.worthApplyingToday} are worth applying to today.`,
    packageLine: `${status.preparedPackages} application package${status.preparedPackages === 1 ? '' : 's'} prepared.`,
    submittedLine: `${status.submittedApplications} submitted application${status.submittedApplications === 1 ? '' : 's'} with confirmation evidence.`,
    needsLine: `${status.humanOnlyGates} item${status.humanOnlyGates === 1 ? '' : 's'} need Tomas.`,
    salary,
  };
}

function normalizeStatus(input: Partial<CareerOsStatus>, productionEvidenceReady: boolean): CareerOsStatus {
  return {
    environment: productionEvidenceReady ? 'production' : 'unconfigured',
    generatedAt: input.generatedAt || new Date().toISOString(),
    greetingName: input.greetingName || 'Tomas',
    dailyDiscoveries: numberOrZero(input.dailyDiscoveries),
    activeOpportunities: numberOrZero(input.activeOpportunities),
    worthApplyingToday: numberOrZero(input.worthApplyingToday),
    preparedPackages: numberOrZero(input.preparedPackages),
    submittedApplications: numberOrZero(input.submittedApplications),
    humanOnlyGates: numberOrZero(input.humanOnlyGates),
    salaryRange: input.salaryRange,
    nextAction: input.nextAction,
    productionEvidenceReady,
    blocker: input.blocker,
  };
}

function numberOrZero(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
