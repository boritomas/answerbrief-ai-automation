const SCHEMA_VERSION = 1;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function companyMemoryKey({ company, ats, host }) {
  const companyKey = normalizeKey(company);
  const atsKey = normalizeKey(ats);
  const hostKey = normalizeKey(host);
  return [companyKey, atsKey, hostKey].filter(Boolean).join("::") || "unknown";
}

export function createCompanyMemory(input = {}, previous = null) {
  const now = new Date().toISOString();
  const successful = input.submissionConfirmed === true;
  const memory = {
    schemaVersion: SCHEMA_VERSION,
    key: companyMemoryKey(input),
    company: normalizeText(input.company),
    ats: normalizeText(input.ats),
    host: normalizeText(input.host),
    selectors: { ...(previous?.selectors || {}), ...(input.selectors || {}) },
    fieldMappings: { ...(previous?.fieldMappings || {}), ...(input.fieldMappings || {}) },
    uploadStrategy: input.uploadStrategy || previous?.uploadStrategy || null,
    requiredQuestions: Array.from(new Set([...(previous?.requiredQuestions || []), ...(input.requiredQuestions || [])])),
    reviewSequence: input.reviewSequence || previous?.reviewSequence || [],
    confirmationPatterns: Array.from(new Set([...(previous?.confirmationPatterns || []), ...(input.confirmationPatterns || [])])),
    successfulSubmissions: (previous?.successfulSubmissions || 0) + (successful ? 1 : 0),
    failedAttempts: (previous?.failedAttempts || 0) + (input.failed === true ? 1 : 0),
    lastSuccessfulAt: successful ? now : previous?.lastSuccessfulAt || null,
    updatedAt: now,
  };
  return memory;
}

export function canReuseCompanyMemory(memory) {
  return Boolean(memory && memory.schemaVersion === SCHEMA_VERSION && memory.successfulSubmissions > 0 && (Object.keys(memory.selectors || {}).length || Object.keys(memory.fieldMappings || {}).length));
}

export function rankCompanyMemories(memories = [], context = {}) {
  const targetKey = companyMemoryKey(context);
  return [...memories]
    .map((memory) => {
      let score = 0;
      if (memory.key === targetKey) score += 100;
      if (normalizeKey(memory.ats) && normalizeKey(memory.ats) === normalizeKey(context.ats)) score += 30;
      if (normalizeKey(memory.host) && normalizeKey(memory.host) === normalizeKey(context.host)) score += 20;
      score += Math.min(memory.successfulSubmissions || 0, 10) * 3;
      score -= Math.min(memory.failedAttempts || 0, 10);
      return { memory, score };
    })
    .filter(({ memory }) => canReuseCompanyMemory(memory))
    .sort((a, b) => b.score - a.score);
}

export function selectCompanyMemory(memories = [], context = {}) {
  return rankCompanyMemories(memories, context)[0]?.memory || null;
}
