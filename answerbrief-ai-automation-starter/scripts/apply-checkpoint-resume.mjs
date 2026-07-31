import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(here, '../lib/career-os-browser-worker.ts');
let source = fs.readFileSync(workerPath, 'utf8');

const helper = `function buildBrowserCheckpoint(\n  application: QueueApplication,\n  report: WorkerReport,\n  details: JsonRecord,\n  now: string,\n): JsonRecord {\n  const raw = asRecord(application.raw_record);\n  const previous = asRecord(raw.browser_checkpoint);\n  const completedStep = cleanEnv(details.completedStep || details.completed_step || details.step || details.stage || details.phase);\n  const currentStep = cleanEnv(details.currentStep || details.current_step || details.nextStep || details.next_step || completedStep);\n  const completedSections = Array.isArray(details.completedSections)\n    ? details.completedSections.filter((value) => typeof value === 'string' && value.trim())\n    : Array.isArray(previous.completed_sections)\n      ? previous.completed_sections\n      : [];\n\n  if (!completedStep && !currentStep && !completedSections.length) return previous;\n\n  return {\n    application_id: application.id,\n    completed_sections: completedSections,\n    completed_step: completedStep || previous.completed_step || '',\n    current_step: currentStep || previous.current_step || '',\n    resume_url: cleanEnv(report.currentUrl || report.evidenceUrl) || previous.resume_url || '',\n    screenshot_path: cleanEnv(report.screenshotPath) || previous.screenshot_path || '',\n    status: report.status,\n    updated_at: now,\n    version: 1,\n  };\n}\n\n`;

if (!source.includes('function buildBrowserCheckpoint(')) {
  const marker = 'export async function reportBrowserWorkerProgress(report: WorkerReport) {';
  if (!source.includes(marker)) throw new Error('Browser worker report anchor was not found.');
  source = source.replace(marker, helper + marker);
}

const detailsAnchor = `  const details = asRecord(report.details);\n`;
const detailsReplacement = `  const details = asRecord(report.details);\n  const browserCheckpoint = buildBrowserCheckpoint(application, report, details, now);\n`;
if (!source.includes('const browserCheckpoint = buildBrowserCheckpoint(')) {
  if (!source.includes(detailsAnchor)) throw new Error('Browser worker details anchor was not found.');
  source = source.replace(detailsAnchor, detailsReplacement);
}

const rawAnchor = `    browser_worker: {\n      ...browserWorker,`;
const rawReplacement = `    browser_checkpoint: browserCheckpoint,\n    browser_worker: {\n      ...browserWorker,`;
if (!source.includes('browser_checkpoint: browserCheckpoint')) {
  if (!source.includes(rawAnchor)) throw new Error('Browser worker raw-record anchor was not found.');
  source = source.replace(rawAnchor, rawReplacement);
}

const reportAnchor = `      details,\n      technical_diagnostic: technicalDiagnostic,`;
const reportReplacement = `      details,\n      resume_checkpoint: browserCheckpoint,\n      technical_diagnostic: technicalDiagnostic,`;
if (!source.includes('resume_checkpoint: browserCheckpoint')) {
  if (!source.includes(reportAnchor)) throw new Error('Browser worker last-report anchor was not found.');
  source = source.replace(reportAnchor, reportReplacement);
}

const retryAnchor = `      next_action: report.evidenceText || 'Browser companion scheduled a retry.',`;
const retryReplacement = `      next_action: report.evidenceText || (cleanEnv(browserCheckpoint.current_step)\n        ? \\`Browser companion scheduled a retry from \\${cleanEnv(browserCheckpoint.current_step)}.\\`\n        : 'Browser companion scheduled a retry.'),`;
if (!source.includes('Browser companion scheduled a retry from')) {
  if (!source.includes(retryAnchor)) throw new Error('Retry next-action anchor was not found.');
  source = source.replace(retryAnchor, retryReplacement);
}

fs.writeFileSync(workerPath, source);
console.log('Career OS browser checkpoint resume hotfix applied.');
