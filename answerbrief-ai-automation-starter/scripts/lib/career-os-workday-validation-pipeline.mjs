import {
  applyFieldMappings,
  fieldCompatibleWithMapping,
  fieldMatchesMappingRoute,
  matchesField,
  scanVisibleFields,
} from './career-os-field-engine.mjs';

const DEFAULT_MAX_REPAIR_ATTEMPTS = 2;
const UNVERIFIABLE_VALUES = new Set(['', '__first_available__']);

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeForCompare(value) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '');
}

// Exact-normalized equality is the default and required for every mapping
// kind that carries production risk if silently mismatched: enumerated
// prompt/select/radio selections (a partial label match can commit the
// wrong option), and identity/contact/enumerated-answer fields where a
// substring match ("1" matching "10", a truncated phone/postal value, a
// partial country or device-type label) would incorrectly verify a wrong
// value. Looser containment matching is only used when a mapping
// explicitly opts in via `allowPartialMatch: true` (declared free-text
// mappings where the widget may legitimately reformat/trim the value).
export function requiresExactMatch(mapping = {}) {
  return mapping.allowPartialMatch !== true;
}

export function valuesMatch(expected, actual, options = {}) {
  const exact = options.exact !== false;
  const expectedNorm = normalizeForCompare(expected);
  const actualNorm = normalizeForCompare(actual);
  if (!expectedNorm) return { match: true, matchType: 'vacuous' };
  if (!actualNorm) return { match: false, matchType: 'empty_actual' };
  if (expectedNorm === actualNorm) return { match: true, matchType: 'exact' };
  if (!exact && (actualNorm.includes(expectedNorm) || expectedNorm.includes(actualNorm))) {
    return { match: true, matchType: 'contains' };
  }
  return { match: false, matchType: 'value_mismatch' };
}

function findMatchingField(fields, mapping) {
  const matchers = mapping.matchers || [];
  const candidates = fields.filter((candidate) => matchers.some((matcher) => matchesField(candidate, matcher))
    && fieldMatchesMappingRoute(candidate, mapping));
  return candidates.find((candidate) => fieldCompatibleWithMapping(candidate, mapping)) || candidates[0] || null;
}

function isVerifiableResult(result) {
  return Boolean(result && result.applied) && !UNVERIFIABLE_VALUES.has(clean(result.value));
}

export async function readBackMappingValues(page, mappings) {
  const fields = await scanVisibleFields(page);
  return mappings.map((mapping) => {
    const field = findMatchingField(fields, mapping);
    return {
      key: mapping.key,
      field: field ? (field.label || field.id) : null,
      found: Boolean(field),
      currentValue: field ? field.currentValue : null,
    };
  });
}

export async function verifyAppliedResults(page, mappings, results) {
  const mappingByKey = new Map(mappings.map((mapping) => [mapping.key, mapping]));
  const applicable = results.filter(isVerifiableResult);
  const matchedMappings = applicable
    .map((result) => mappingByKey.get(result.key))
    .filter(Boolean);
  const readbacks = await readBackMappingValues(page, matchedMappings);
  const readbackByKey = new Map(readbacks.map((readback) => [readback.key, readback]));

  return applicable.map((result) => {
    const mapping = mappingByKey.get(result.key);
    const readback = readbackByKey.get(result.key);
    if (!readback || !readback.found) {
      return {
        key: result.key,
        field: result.field || null,
        status: 'unreadable',
        matchType: 'field_not_found_on_readback',
        expected: result.value,
        actual: null,
      };
    }
    const comparison = valuesMatch(result.value, readback.currentValue, { exact: requiresExactMatch(mapping) });
    return {
      key: result.key,
      field: readback.field || result.field || null,
      status: comparison.match ? 'verified' : 'mismatch',
      matchType: comparison.matchType,
      expected: result.value,
      actual: readback.currentValue,
    };
  });
}

export async function runValidationReadbackRepairPipeline(page, mappings, results, context, options = {}) {
  const maxRepairAttempts = Number.isFinite(options.maxRepairAttempts)
    ? options.maxRepairAttempts
    : DEFAULT_MAX_REPAIR_ATTEMPTS;
  const mappingByKey = new Map(mappings.map((mapping) => [mapping.key, mapping]));
  const resultByKey = new Map(results.map((result) => [result.key, result]));

  const fieldReports = await verifyAppliedResults(page, mappings, results);
  const repairLog = [];

  for (const report of fieldReports) {
    if (report.status !== 'mismatch' && report.status !== 'unreadable') continue;
    const mapping = mappingByKey.get(report.key);
    const originalResult = resultByKey.get(report.key);
    if (!mapping || !originalResult) continue;

    let attempts = 0;
    let latest = report;
    while (attempts < maxRepairAttempts && latest.status !== 'verified') {
      attempts += 1;
      await applyFieldMappings(page, [mapping], context);
      const [reVerified] = await verifyAppliedResults(page, [mapping], [originalResult]);
      latest = reVerified || latest;
      repairLog.push({ key: report.key, attempt: attempts, outcome: latest.status });
    }

    report.status = latest.status;
    report.matchType = latest.matchType;
    report.actual = latest.actual;
    report.repairAttempts = attempts;
    report.repaired = attempts > 0 && latest.status === 'verified';
  }

  // Unreadable fields (the control could no longer be located on re-scan) are
  // treated the same as unresolved mismatches: we cannot prove the answer
  // bank's value actually landed, so the pipeline must not report ok:true.
  const unresolvedMismatches = fieldReports.filter((report) => report.status === 'mismatch');
  const unreadable = fieldReports.filter((report) => report.status === 'unreadable');

  return {
    ok: unresolvedMismatches.length === 0 && unreadable.length === 0,
    verifiedCount: fieldReports.filter((report) => report.status === 'verified').length,
    mismatchCount: unresolvedMismatches.length,
    unreadableCount: unreadable.length,
    repairedCount: fieldReports.filter((report) => report.repaired).length,
    fieldReports,
    repairLog,
  };
}

export function emptyValidationReport(overrides = {}) {
  return {
    ok: true,
    verifiedCount: 0,
    mismatchCount: 0,
    unreadableCount: 0,
    repairedCount: 0,
    fieldReports: [],
    repairLog: [],
    coverageIncomplete: false,
    ...overrides,
  };
}
