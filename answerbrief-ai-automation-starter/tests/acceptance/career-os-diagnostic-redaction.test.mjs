import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { loadTsModule } from '../helpers/load-ts-module.mjs';

const SECRET_PASSWORD = 'DO_NOT_LEAK_ThisIsTheRealPassword123!';
const SECRET_TOKEN = 'DO_NOT_LEAK_action-token-abc123';
const SECRET_COOKIE = 'DO_NOT_LEAK_session=abc123xyz';
const SECRET_BEARER = 'DO_NOT_LEAK_bearer_value_zzz';

test('redactDiagnosticPayload strips password/actionToken/cookie/Authorization fields from a nested API-log-shaped payload', () => {
  const { redactDiagnosticPayload } = loadTsModule('lib/career-os-diagnostic-redaction.ts');
  const payload = {
    request: {
      body: {
        action: 'update_employer_credential',
        accountEmail: 'tomas@nieves.com',
        password: SECRET_PASSWORD,
        actionToken: SECRET_TOKEN,
        employer: 'Capital One',
      },
      headers: { Authorization: `Bearer ${SECRET_BEARER}`, cookie: SECRET_COOKIE, 'content-type': 'application/json' },
    },
    response: { ok: false, reason: 'Workday rejected the credential.' },
  };
  const redacted = JSON.stringify(redactDiagnosticPayload(payload));
  assert.doesNotMatch(redacted, new RegExp(SECRET_PASSWORD));
  assert.doesNotMatch(redacted, new RegExp(SECRET_TOKEN));
  assert.doesNotMatch(redacted, new RegExp(SECRET_COOKIE));
  assert.doesNotMatch(redacted, new RegExp(SECRET_BEARER));
  // Non-sensitive fields must survive untouched -- this is redaction, not destruction.
  assert.match(redacted, /Capital One/);
  assert.match(redacted, /tomas@nieves\.com/);
  assert.match(redacted, /Workday rejected the credential/);
});

test('redactDiagnosticPayload strips secrets from HAR-shaped name/value pairs (headers, cookies, queryString, postData)', () => {
  const { redactDiagnosticPayload } = loadTsModule('lib/career-os-diagnostic-redaction.ts');
  const harEntry = {
    request: {
      method: 'POST',
      url: `http://127.0.0.1:3210/api/career-os/actions?actionToken=${SECRET_TOKEN}`,
      headers: [
        { name: 'Authorization', value: `Bearer ${SECRET_BEARER}` },
        { name: 'content-type', value: 'application/json' },
      ],
      cookies: [{ name: 'session', value: SECRET_COOKIE }],
      queryString: [{ name: 'actionToken', value: SECRET_TOKEN }],
      postData: {
        mimeType: 'application/json',
        text: JSON.stringify({ password: SECRET_PASSWORD, employer: 'USAA' }),
      },
    },
  };
  const redacted = JSON.stringify(redactDiagnosticPayload(harEntry));
  assert.doesNotMatch(redacted, new RegExp(SECRET_PASSWORD));
  assert.doesNotMatch(redacted, new RegExp(SECRET_TOKEN));
  assert.doesNotMatch(redacted, new RegExp(SECRET_COOKIE));
  assert.doesNotMatch(redacted, new RegExp(SECRET_BEARER));
  assert.match(redacted, /USAA/);
});

test('career-os-sanitize-har.mjs strips secrets from a real HAR file end-to-end', () => {
  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-har-test-'));
  try {
    const harPath = path.join(tmpDir, 'input.har');
    const har = {
      log: {
        entries: [
          {
            request: {
              method: 'POST',
              url: 'http://127.0.0.1:3210/api/career-os/actions',
              headers: [
                { name: 'Authorization', value: `Bearer ${SECRET_BEARER}` },
                { name: 'Cookie', value: SECRET_COOKIE },
              ],
              cookies: [{ name: 'career_os_admin', value: SECRET_COOKIE }],
              queryString: [],
              postData: {
                mimeType: 'application/json',
                text: JSON.stringify({
                  action: 'update_employer_credential',
                  password: SECRET_PASSWORD,
                  actionToken: SECRET_TOKEN,
                  employer: 'Wells Fargo',
                }),
              },
            },
            response: {
              headers: [],
              cookies: [],
              content: { mimeType: 'application/json', text: JSON.stringify({ ok: false, reason: 'Workday rejected the credential.' }) },
            },
          },
        ],
      },
    };
    fs.writeFileSync(harPath, JSON.stringify(har));
    execFileSync('node', ['scripts/career-os-sanitize-har.mjs', harPath], { cwd: process.cwd() });
    const outputPath = harPath.replace(/\.har$/i, '') + '.sanitized.har';
    const sanitized = fs.readFileSync(outputPath, 'utf8');
    assert.doesNotMatch(sanitized, new RegExp(SECRET_PASSWORD));
    assert.doesNotMatch(sanitized, new RegExp(SECRET_TOKEN));
    assert.doesNotMatch(sanitized, new RegExp(SECRET_COOKIE));
    assert.doesNotMatch(sanitized, new RegExp(SECRET_BEARER));
    assert.match(sanitized, /Wells Fargo/);
    assert.match(sanitized, /Workday rejected the credential/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
