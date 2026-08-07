// One-time repair for the single career_os_profiles row: corrects the
// stale Fort Worth location that every résumé/application-answer generator
// reads from (career_os_profiles.verified_profile.contact), matching the
// Dallas correction already made publicly in PR #64. Only touches
// city/state/location (high confidence, matches the existing public
// correction). Does NOT invent a new street address, postal code, or full
// address -- those are cleared to null rather than guessed, since Tomas
// has not supplied his current exact mailing address. Verifies the exact
// BEFORE state first and aborts if it doesn't match.
//
// Dry run (default): node scripts/career-os-repair-profile-location.mjs
// Apply:             node scripts/career-os-repair-profile-location.mjs --write

import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const OWNER_EMAIL = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const WRITE = process.argv.includes('--write');

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function endpoint(query) {
  return `${SUPABASE_URL}/rest/v1/career_os_profiles${query ? `?${query}` : ''}`;
}

console.log(WRITE ? 'MODE: WRITE (repair will be applied)' : 'MODE: DRY RUN (no writes; pass --write to apply)');
console.log('');

const rows = await (await fetch(
  endpoint(`select=*&owner_email=eq.${encodeURIComponent(OWNER_EMAIL)}`),
  { headers },
)).json();

if (rows.length !== 1) {
  console.error(`ABORTED: expected exactly 1 profile row, found ${rows.length}. No write attempted.`);
  process.exit(1);
}

const profile = rows[0];
const verified = profile.verified_profile && typeof profile.verified_profile === 'object' ? profile.verified_profile : {};
const contact = verified.contact && typeof verified.contact === 'object' ? verified.contact : {};

const before = {
  city: contact.city ?? null,
  state: contact.state ?? null,
  location: contact.location ?? null,
  postal_code: contact.postal_code ?? null,
  street_address: contact.street_address ?? null,
  full_address: contact.full_address ?? null,
};
console.log(`BEFORE: ${JSON.stringify(before)}`);

const expected = before.city === 'Fort Worth' && before.state === 'Texas' && before.location === 'Fort Worth, Texas 76227';

if (!expected) {
  console.error('ABORTED: live state does not match the expected BEFORE condition. No write attempted.');
  process.exit(1);
}

if (!WRITE) {
  console.log('DRY RUN: would set city/state/location to Dallas, Texas and clear street_address/postal_code/full_address.');
  process.exit(0);
}

const updatedContact = {
  ...contact,
  city: 'Dallas',
  state: 'Texas',
  location: 'Dallas, Texas',
  postal_code: null,
  street_address: null,
  full_address: null,
};

const response = await fetch(
  endpoint(`id=eq.${encodeURIComponent(profile.id)}`),
  {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      verified_profile: { ...verified, contact: updatedContact },
    }),
  },
);

if (!response.ok) {
  throw new Error(`PATCH failed: ${response.status} ${await response.text()}`);
}

const [patched] = await response.json();
const patchedContact = (patched.verified_profile || {}).contact || {};
console.log(`AFTER:  ${JSON.stringify({
  city: patchedContact.city ?? null,
  state: patchedContact.state ?? null,
  location: patchedContact.location ?? null,
  postal_code: patchedContact.postal_code ?? null,
  street_address: patchedContact.street_address ?? null,
  full_address: patchedContact.full_address ?? null,
})}`);
console.log('REPAIRED: career_os_profiles contact location');
