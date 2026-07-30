export type JsonRecord = Record<string, unknown>;

export type OutcomeClassification = {
  automated: boolean;
  confidence: number;
  invitesFutureApplications: boolean;
  mentionsQualifications: boolean;
  reasons: string[];
  rejectionType: string;
  sender: string;
  status: string;
  subject: string;
};

export type ApplicationQualityGate = {
  active: boolean;
  compensationOk: boolean;
  compensationPolicyStatus: string;
  compensationPolicyWarnings: string[];
  coverLetterAvailable: boolean;
  coverLetterNeeded: boolean;
  duplicate: boolean;
  holdReasons: string[];
  interviewReadinessGate: string;
  interviewReadinessScore: number;
  improvements: string[];
  locationOk: boolean;
  packageComplete: boolean;
  preferredMinimumBaseSalaryUsd: number;
  requiredQualificationConcern: string;
  roleFamilyConcern: string;
  score: number;
  status: string;
  submitReady: boolean;
  thresholdBand: string;
};

export type OutcomeIntelligence = {
  assessments: number;
  coverLettersGenerated: number;
  coverLettersUploaded: number;
  fastRejections: number;
  feedbackRequests: number;
  heldForQuality: number;
  interviews: number;
  plainEnglish: string;
  rejections: number;
  responseRate: number;
  submittedAnalyzed: number;
  submittedWithoutCoverLetter: number;
};

export function clean(value: unknown): string;
export function normalized(value: unknown): string;
export function sha256Hex(value: unknown): string;
export function classifyOutcomeEmail(input?: JsonRecord): OutcomeClassification;
export function linkOutcomeEmailToApplication(email?: JsonRecord, applications?: JsonRecord[]): {
  application: JsonRecord | null;
  confidence: number;
  linked: boolean;
  reason: string;
};
export function assessApplicationQuality(input?: JsonRecord): ApplicationQualityGate;
export function generateTailoredCoverLetter(input?: JsonRecord): {
  content: string;
  generatedAt: string;
  hash: string;
  source: string;
};
export function coverLetterFilename(application?: JsonRecord): string;
export function buildOutcomeIntelligence(input?: JsonRecord): OutcomeIntelligence;
export function validOutcomeStatus(status: string): boolean;
