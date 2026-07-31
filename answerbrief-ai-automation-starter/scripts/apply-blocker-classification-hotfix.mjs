import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const queuePath = path.resolve(here, '../lib/career-os-queue.ts');
let source = fs.readFileSync(queuePath, 'utf8');

for (const overlyBroadHumanTerm of [
  "  'captcha',\n",
  "  'account',\n",
  "  'workday',\n",
]) {
  source = source.replace(overlyBroadHumanTerm, '');
}

const anchor = `const TECHNICAL_BLOCKER_TERMS = [\n  'technical blocker',\n  'technical failure',\n`;
const replacement = `const TECHNICAL_BLOCKER_TERMS = [\n  'technical blocker',\n  'technical failure',\n  'unsupported browser or ats operation',\n  'unsupported browser operation',\n  'unsupported ats operation',\n  'selector not found',\n  'navigation timeout',\n  'browser timeout',\n  'resume upload failure',\n  'file picker',\n`;

if (!source.includes("'unsupported browser or ats operation'")) {
  if (!source.includes(anchor)) {
    throw new Error('Career OS blocker hotfix anchor was not found.');
  }
  source = source.replace(anchor, replacement);
}

fs.writeFileSync(queuePath, source);

const workerPath = path.resolve(here, '../lib/career-os-browser-worker.ts');
let workerSource = fs.readFileSync(workerPath, 'utf8');

const diagnosticHelper = `function buildBrowserWorkerTechnicalDiagnostic(\n  application: QueueApplication,\n  report: WorkerReport,\n  details: JsonRecord,\n  currentUrl: string,\n  screenshotPath: string,\n): JsonRecord {\n  const raw = asRecord(application.raw_record);\n  const step = cleanEnv(details.step || details.failedStep || details.stage || details.phase) || 'unknown_step';\n  const attemptedAction = cleanEnv(details.attemptedAction || details.action || details.operation) || 'unknown_action';\n  const selector = cleanEnv(details.selector || details.targetSelector || details.locator);\n  const browserException = cleanEnv(details.browserException || details.exception || details.error || details.message || report.evidenceText);\n  const platform = cleanEnv(details.platform || raw.platform || raw.ats || raw.source_platform) || 'unknown';\n  const retryCountValue = Number(details.retryCount ?? details.attempt ?? details.attemptNumber ?? 0);\n  const retryCount = Number.isFinite(retryCountValue) ? retryCountValue : 0;\n  const retryable = details.retryable === false ? false : report.status !== 'failed';\n  const summaryParts = [\n    application.employer,\n    platform,\n    step,\n    attemptedAction,\n    browserException,\n  ].filter(Boolean);\n\n  return {\n    attempted_action: attemptedAction,\n    browser_exception: browserException,\n    current_url: currentUrl,\n    employer: application.employer,\n    platform,\n    position: application.position,\n    retry_count: retryCount,\n    retryable,\n    screenshot_path: screenshotPath,\n    selector,\n    step,\n    summary: summaryParts.join(' | '),\n  };\n}\n\n`;

if (!workerSource.includes('function buildBrowserWorkerTechnicalDiagnostic(')) {
  const reportMarker = 'export async function reportBrowserWorkerProgress(report: WorkerReport) {';
  if (!workerSource.includes(reportMarker)) {
    throw new Error('Browser worker report function anchor was not found.');
  }
  workerSource = workerSource.replace(reportMarker, diagnosticHelper + reportMarker);
}

const detailsAnchor = `  const details = asRecord(report.details);\n  const outcomeStatus = normalizeProductionOutcome(report.status, cleanEnv(details.outcomeStatus));`;
const detailsReplacement = `  const details = asRecord(report.details);\n  const technicalDiagnostic: JsonRecord = report.status === 'blocked_technical' || report.status === 'failed'\n    ? buildBrowserWorkerTechnicalDiagnostic(application, report, details, currentUrl, screenshotPath)\n    : {};\n  const outcomeStatus = normalizeProductionOutcome(report.status, cleanEnv(details.outcomeStatus));`;
if (!workerSource.includes('const technicalDiagnostic: JsonRecord = report.status')) {
  if (!workerSource.includes(detailsAnchor)) {
    throw new Error('Browser worker details anchor was not found.');
  }
  workerSource = workerSource.replace(detailsAnchor, detailsReplacement);
}

const reportAnchor = `      details,\n      evidence_text: report.evidenceText || '',`;
const reportReplacement = `      details,\n      technical_diagnostic: technicalDiagnostic,\n      evidence_text: report.evidenceText || '',`;
if (!workerSource.includes('technical_diagnostic: technicalDiagnostic')) {
  if (!workerSource.includes(reportAnchor)) {
    throw new Error('Browser worker last-report anchor was not found.');
  }
  workerSource = workerSource.replace(reportAnchor, reportReplacement);
}

const blockerAnchor = `      next_action: report.evidenceText || 'Browser companion hit a technical blocker.',`;
const blockerReplacement = `      next_action: cleanEnv(technicalDiagnostic.summary) || report.evidenceText || 'Browser companion hit a technical blocker.',`;
if (!workerSource.includes('next_action: cleanEnv(technicalDiagnostic.summary)')) {
  if (!workerSource.includes(blockerAnchor)) {
    throw new Error('Browser worker blocker next-action anchor was not found.');
  }
  workerSource = workerSource.replace(blockerAnchor, blockerReplacement);
}

const eventDetailsAnchor = `      screenshot_path: screenshotPath || undefined,\n      ...details,\n    });\n    return;\n  }\n\n  if (report.status === 'retry_scheduled') {`;
const eventDetailsReplacement = `      screenshot_path: screenshotPath || undefined,\n      technical_diagnostic: technicalDiagnostic,\n      ...details,\n    });\n    return;\n  }\n\n  if (report.status === 'retry_scheduled') {`;
if (!workerSource.includes('technical_diagnostic: technicalDiagnostic,\n      ...details')) {
  if (!workerSource.includes(eventDetailsAnchor)) {
    throw new Error('Browser worker technical event anchor was not found.');
  }
  workerSource = workerSource.replace(eventDetailsAnchor, eventDetailsReplacement);
}

fs.writeFileSync(workerPath, workerSource);
console.log('Career OS blocker classification and browser diagnostics hotfix applied.');
