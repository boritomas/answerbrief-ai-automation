#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const persist = process.argv.includes('--persist');
const root = process.cwd();
const registryPath = path.join(root, 'config', 'career-os-artifacts.json');
const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com');
const supabaseUrl = clean(process.env.SUPABASE_URL);
const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const checked = [];
for (const artifact of registry.artifacts || []) {
  for (const [format, relativePath] of Object.entries(artifact.formats || {})) {
    const localPath = path.resolve(root, relativePath);
    let exists = false;
    try {
      const stat = await fs.stat(localPath);
      exists = stat.isFile() && stat.size > 0;
    } catch {
      exists = false;
    }
    checked.push({
      artifactId: artifact.id,
      canonical: Boolean(artifact.canonical),
      exists,
      format,
      localPath,
      relativePath,
      type: artifact.type,
      version: artifact.version,
    });
  }
}

const missingRequired = checked.filter((item) => item.canonical && !item.exists);
if (missingRequired.length) {
  console.error(JSON.stringify({
    ok: false,
    error: 'canonical_artifact_files_missing',
    missing: missingRequired,
  }, null, 2));
  process.exitCode = 2;
} else if (!persist) {
  console.log(JSON.stringify({ ok: true, mode: 'validate', checked }, null, 2));
} else {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --persist.');
  }

  const applications = await selectApplications();
  const rows = [];
  for (const application of applications) {
    const resume = checked.find((item) => item.artifactId === registry.defaults.canonicalResumeId && item.format === 'pdf');
    if (resume?.exists) rows.push(toArtifactRow(application, resume, 'approved'));

    const exactCoverLetter = checked.find((item) => {
      const config = (registry.artifacts || []).find((entry) => entry.id === item.artifactId);
      return item.type === 'cover_letter'
        && item.format === 'pdf'
        && item.exists
        && clean(config?.jobScope?.employer).toLowerCase() === clean(application.employer).toLowerCase()
        && clean(config?.jobScope?.requisitionId).toLowerCase() === clean(application.requisition_id || application.raw_record?.requisition_id).toLowerCase();
    });
    if (exactCoverLetter) rows.push(toArtifactRow(application, exactCoverLetter, 'approved'));
  }

  if (rows.length) await upsert('career_os_artifacts', rows);
  console.log(JSON.stringify({
    ok: true,
    mode: 'persist',
    applicationsScanned: applications.length,
    artifactRowsUpserted: rows.length,
    checked,
  }, null, 2));
}

function toArtifactRow(application, artifact, approvalStatus) {
  const id = deterministicUuid(`${ownerEmail}:${application.id}:${artifact.artifactId}:${artifact.format}`);
  return {
    id,
    owner_email: ownerEmail,
    application_id: application.id,
    opportunity_id: application.opportunity_id || null,
    artifact_type: artifact.type,
    filename: path.basename(artifact.localPath),
    local_path: artifact.localPath,
    approval_status: approvalStatus,
    version: artifact.version,
    metadata: {
      registry_artifact_id: artifact.artifactId,
      canonical: artifact.canonical,
      format: artifact.format,
      source: 'career-os-artifact-registry-v1',
    },
    updated_at: new Date().toISOString(),
  };
}

async function selectApplications() {
  const url = `${supabaseUrl}/rest/v1/career_os_applications?select=id,opportunity_id,employer,requisition_id,raw_record&owner_email=eq.${encodeURIComponent(ownerEmail)}&lifecycle_stage=in.(qualified,package_pending,package_ready,queued,running)`;
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error(`Career OS applications query failed: ${response.status} ${await response.text()}`);
  return await response.json();
}

async function upsert(table, rows) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`${table} upsert failed: ${response.status} ${await response.text()}`);
}

function authHeaders() {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
}

function deterministicUuid(value) {
  const hash = crypto.createHash('sha256').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}
