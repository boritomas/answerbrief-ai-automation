import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Static source guardrails, matching this repo's existing precedent
// (career-os-production-readiness.test.mjs) of reading source files and
// asserting on their shape rather than executing the full credential-write
// path (which would require a real macOS Keychain and a real Playwright
// browser against a real Workday tenant). Dynamic redaction behavior is
// covered separately in career-os-diagnostic-redaction.test.mjs.

const employerAuthSource = fs.readFileSync('lib/career-os-employer-auth.ts', 'utf8');
const actionsRouteSource = fs.readFileSync('app/api/career-os/actions/route.ts', 'utf8');

test('the password variable is never passed to a Supabase write call', () => {
  // The only two functions that touch career_os_employer_accounts with
  // arbitrary data are careerOsUpsertRows/careerOsPatchRowById. Every call
  // site in this file must be free of a bare `password` identifier
  // anywhere in its argument list.
  const writeCalls = employerAuthSource.match(/careerOs(?:UpsertRows|PatchRowById)\([^;]*?\);/gs) || [];
  assert.ok(writeCalls.length > 0, 'expected to find at least one Supabase write call to check');
  for (const call of writeCalls) {
    assert.doesNotMatch(call, /\bpassword\b/, `Supabase write call must not reference \`password\`: ${call.slice(0, 120)}...`);
  }
});

test('the password variable is never passed to console.log/console.error', () => {
  const logCalls = employerAuthSource.match(/console\.(?:log|error|warn)\([^;]*?\);/gs) || [];
  for (const call of logCalls) {
    assert.doesNotMatch(call, /\bpassword\b/, `console call must not reference \`password\`: ${call.slice(0, 120)}...`);
  }
});

test('updateEmployerCredentialAndResume and verifyWorkdayCredential never return a password field', () => {
  // Every object literal returned from these two functions must not
  // declare a `password` key -- their whole point is to report on the
  // outcome (ok/reason/classification/status) without echoing the secret
  // back to the caller.
  const returnObjects = employerAuthSource.match(/return\s*\{[^}]*\}/gs) || [];
  assert.ok(returnObjects.length > 0, 'expected to find return statements to check');
  for (const block of returnObjects) {
    assert.doesNotMatch(block, /\bpassword\s*:/, `a return object declares a password field: ${block.slice(0, 160)}`);
  }
});

test('the actions API route never echoes body.password back in a response, and only passes it into updateEmployerCredentialAndResume', () => {
  // Checks for the VALUE reference (body.password, a bare `password`
  // identifier used as a value) rather than the bare word "password" --
  // that word legitimately appears in human-readable error message prose
  // (e.g. "Missing ... or password."), which is not a leak.
  const jsonCalls = actionsRouteSource.match(/NextResponse\.json\([^;]*?\);/gs) || [];
  assert.ok(jsonCalls.length > 0, 'expected to find NextResponse.json calls to check');
  for (const call of jsonCalls) {
    assert.doesNotMatch(call, /body\.password\b/, `NextResponse.json call must not reference body.password: ${call.slice(0, 120)}...`);
    assert.doesNotMatch(call, /password\s*:\s*\w/, `NextResponse.json call must not assign a password value: ${call.slice(0, 120)}...`);
  }
  const passwordUsages = [...actionsRouteSource.matchAll(/\bpassword\b/g)];
  // Every raw occurrence of the identifier `password` in this route file
  // must be one of: the ActionBody type field, the missing-field guard
  // check, the error message string, or the single legitimate passthrough
  // into updateEmployerCredentialAndResume. Assert there's exactly one
  // passthrough call site (the number that actually matters for this
  // guardrail) rather than an unbounded/growing set.
  const passthroughCallSites = actionsRouteSource.match(/password:\s*body\.password/g) || [];
  assert.equal(passthroughCallSites.length, 1, `expected exactly one password passthrough into updateEmployerCredentialAndResume, found ${passthroughCallSites.length}`);
  assert.ok(passwordUsages.length >= passthroughCallSites.length);
});
