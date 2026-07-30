#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  classifyOutcomeEmail,
  linkOutcomeEmailToApplication,
  sha256Hex,
} from './lib/career-os-quality-layer.mjs';

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));

const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
const file = argValue('--file');

if (!file) {
  console.log(JSON.stringify({
    imported: 0,
    linked: 0,
    message: 'No outcome email import file provided. Re-run with --file <json-or-jsonl-export>.',
  }, null, 2));
  process.exit(0);
}

const records = readOutcomeRecords(file);
const applications = await selectRows('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc`);
const validOpportunityIds = new Set(
  (await selectRows('career_os_job_postings', `select=id&owner_email=eq.${encodeURIComponent(ownerEmail)}`))
    .map((row) => clean(row.id))
    .filter(Boolean),
);
const now = new Date().toISOString();
const events = [];
const patches = [];

for (const record of records) {
  const classification = classifyOutcomeEmail(record);
  const link = linkOutcomeEmailToApplication(record, applications);
  const application = link.application;
  const eventId = deterministicUuid(`career-os-outcome:${ownerEmail}:${record.messageId || record.id || record.subject || ''}:${record.date || record.receivedAt || ''}:${classification.status}`);
  const metadata = {
    automated: classification.automated,
    classification_confidence: classification.confidence,
    classifier: 'career_os_quality_layer_v1',
    email_hash: sha256Hex(`${record.sender || record.from || ''}\n${record.subject || ''}\n${record.date || record.receivedAt || ''}\n${record.body || record.text || record.snippet || ''}`),
    evidence_kind: clean(record.evidenceKind || record.sourceKind || ''),
    evidence_path: clean(record.evidencePath || record.screenshotPath || record.sourcePath || ''),
    invites_future_applications: classification.invitesFutureApplications,
    link_confidence: link.confidence,
    link_reason: link.reason,
    mentions_qualifications: classification.mentionsQualifications,
    outcome_link_uncertain: !link.linked,
    rejection_type: classification.rejectionType,
    source: 'career_os_outcome_import',
  };
  events.push({
    id: eventId,
    owner_email: ownerEmail,
    application_id: application?.id || null,
    opportunity_id: application?.opportunity_id && validOpportunityIds.has(clean(application.opportunity_id))
      ? application.opportunity_id
      : null,
    employer: application?.employer || clean(record.employer || record.company) || null,
    platform: clean(asRecord(application?.raw_record).ats_platform || asRecord(application?.raw_record).platform || record.platform || ''),
    event_type: 'application_outcome_email',
    status: classification.status,
    evidence_text: publicEvidenceText(record, classification),
    evidence_url: clean(record.url || record.webLink || record.evidencePath || record.screenshotPath || ''),
    occurred_at: clean(record.receivedAt || record.date || record.timestamp) || now,
    created_at: now,
    metadata,
  });

  if (application?.id && link.linked) {
    const raw = asRecord(application.raw_record);
    patches.push({
      id: application.id,
      patch: {
        lifecycle_stage: outcomeLifecycleStage(classification.status, application.lifecycle_stage),
        next_action: outcomeNextAction(classification.status),
        raw_record: {
          ...raw,
          latest_outcome: {
            classified_at: now,
            confidence: classification.confidence,
            source_event_id: eventId,
            status: classification.status,
          },
          outcome_intelligence: {
            ...asRecord(raw.outcome_intelligence),
            latest_status: classification.status,
            latest_status_at: clean(record.receivedAt || record.date || record.timestamp) || now,
            rejection_type: classification.rejectionType,
          },
        },
        updated_at: now,
      },
    });
  }
}

if (events.length) await upsertRows('career_os_employer_workflow_events', events);
for (const item of patches) await patchRowById('career_os_applications', item.id, item.patch);

console.log(JSON.stringify({
  imported: records.length,
  linked: events.filter((event) => event.application_id).length,
  linked_confidently: events.filter((event) => event.application_id && asRecord(event.metadata).outcome_link_uncertain !== true).length,
  uncertain: events.filter((event) => asRecord(event.metadata).outcome_link_uncertain === true).length,
  statuses: countBy(events.map((event) => event.status)),
}, null, 2));

function readOutcomeRecords(inputFile) {
  const absolute = path.resolve(inputFile);
  const content = fs.readFileSync(absolute, 'utf8').trim();
  if (!content) return [];
  if (absolute.endsWith('.jsonl')) {
    return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.messages) ? parsed.messages : [parsed];
}

function publicEvidenceText(record, classification) {
  const sender = clean(record.sender || record.from);
  const subject = clean(record.subject);
  const source = clean(record.evidencePath || record.screenshotPath || record.sourcePath);
  return [
    sender ? `From ${sender}` : '',
    subject ? `Subject: ${subject}` : '',
    source ? `Evidence: ${source}` : '',
    `Classified as ${classification.status}`,
  ].filter(Boolean).join(' | ').slice(0, 500);
}

function outcomeLifecycleStage(status, fallback) {
  if (status === 'submitted_confirmed') return fallback || 'submitted';
  if (status === 'feedback_requested') return 'feedback_requested';
  if (status.startsWith('rejected')) return status;
  if (status === 'interview_requested') return 'interview_requested';
  if (status === 'assessment_requested') return 'assessment_requested';
  if (status === 'duplicate_submission_detected') return 'duplicate';
  if (status === 'withdrawn_or_closed') return 'inactive';
  if (status === 'recruiter_response') return 'recruiter_response';
  return fallback || 'outcome_unknown';
}

function outcomeNextAction(status) {
  if (status === 'feedback_requested') return 'Feedback or candidate-experience survey received; do not classify as rejection unless the message explicitly rejects the application.';
  if (status.startsWith('rejected')) return 'Outcome email indicates the employer is not moving forward; Career OS will use this as rejection-pattern evidence without overfitting from one response.';
  if (status === 'interview_requested') return 'Interview requested; prepare AnswerBrief AI handoff package.';
  if (status === 'assessment_requested') return 'Assessment requested; prepare assessment plan and deadline tracking.';
  if (status === 'duplicate_submission_detected') return 'Duplicate submission detected; lock this requisition from future submission.';
  if (status === 'withdrawn_or_closed') return 'Role appears closed or withdrawn; do not reapply to this requisition.';
  return 'Outcome email imported; review classification if confidence is low.';
}

async function selectRows(table, query) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?${query}`, {
    headers: restHeaders(),
  });
  if (!response.ok) throw new Error(`Supabase ${table} select failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
  return response.json();
}

async function upsertRows(table, rows) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?on_conflict=id`, {
    body: JSON.stringify(rows),
    headers: {
      ...restHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    method: 'POST',
  });
  if (!response.ok) throw new Error(`Supabase ${table} upsert failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
}

async function patchRowById(table, id, patch) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    body: JSON.stringify(patch),
    headers: restHeaders(),
    method: 'PATCH',
  });
  if (!response.ok) throw new Error(`Supabase ${table} patch failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
}

function restHeaders() {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl() || !key || key.startsWith('[')) throw new Error('Career OS Supabase service configuration is unavailable.');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function supabaseUrl() {
  return clean(process.env.SUPABASE_URL);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? clean(process.argv[index + 1]) : '';
}

function countBy(values) {
  return values.reduce((acc, value) => {
    const key = clean(value) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function deterministicUuid(input) {
  const hash = sha256Hex(input);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
}
