export type JsonRecord = Record<string, unknown>;

export const DEFAULT_LINKEDIN_SEARCH_TERMS: string[];

export const DEFAULT_LINKEDIN_SEARCH_LOCATIONS: string[];

export function parseLinkedInJobUrl(value: unknown): {
  generic: boolean;
  jobId: string;
  ok: boolean;
  reason: string;
  url: string;
};

export function buildLinkedInSearchUrl(input?: JsonRecord): string;

export function defaultLinkedInSearchInputs(options?: JsonRecord): JsonRecord[];

export function classifyLinkedInApplyDestination(input?: JsonRecord): JsonRecord;

export function loadLinkedInDiscoveryRecordsFromEnv(env?: Record<string, unknown>): {
  errors: string[];
  records: JsonRecord[];
  requested: boolean;
  sourceUrl: string;
};

export function normalizeLinkedInJobRecords(records?: JsonRecord[], options?: JsonRecord): {
  deferred: JsonRecord[];
  errors: string[];
  postings: JsonRecord[];
  rejected: JsonRecord[];
  summary: JsonRecord;
};

export function normalizeLinkedInJobRecord(input?: JsonRecord, options?: JsonRecord): JsonRecord;

export function summarizeLinkedInDiscovery(input?: JsonRecord): JsonRecord;

export function buildLinkedInSourceStatus(input?: JsonRecord): JsonRecord;

export function isLinkedInDiscoveryPosting(posting?: JsonRecord): boolean;

export function dedupeLinkedInJobRecords(records?: JsonRecord[]): JsonRecord[];

export function scoreLinkedInFeedRecord(input?: JsonRecord): number;

export function rankLinkedInFeedRecords(records?: JsonRecord[], options?: JsonRecord): JsonRecord[];

export function extractLinkedInFeedCardsFromPage(page: unknown, options?: JsonRecord): Promise<JsonRecord[]>;

export function extractLinkedInJobDetailFromPage(page: unknown, seed?: JsonRecord, options?: JsonRecord): Promise<JsonRecord>;

export function discoverLinkedInFeedFromAuthenticatedPage(page: unknown, options?: JsonRecord): Promise<JsonRecord>;

export function resolveLinkedInExternalApplyUrl(page: unknown, input?: JsonRecord, options?: JsonRecord): Promise<JsonRecord>;

export function resolveEmployerApplyDestination(context: unknown, input?: JsonRecord, options?: JsonRecord): Promise<JsonRecord>;
