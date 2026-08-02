import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'scripts/lib/career-os-controlled-browser.mjs');
const source = fs.readFileSync(target, 'utf8');
const marker = "  const fallback = classifyCdpWorkdayTargets(cdp.pages || [], {\n    expectedJobId,\n    expectedTenant,\n  });\n\n  try {";
const replacement = "  const fallback = classifyCdpWorkdayTargets(cdp.pages || [], {\n    expectedJobId,\n    expectedTenant,\n  });\n\n  if (fallback.status === 'CONTROLLED BROWSER READY — SIGN-IN REQUIRED') {\n    return {\n      ok: true,\n      authenticationState: 'sign_in_required',\n      pages: cdp.pages,\n      reason: fallback.reason,\n      status: fallback.status,\n      workdayTab: fallback.workdayTab,\n    };\n  }\n\n  try {";

if (source.includes(replacement)) {
  console.log('Controlled Workday sign-in guard already applied.');
  process.exit(0);
}
if (!source.includes(marker)) {
  throw new Error('Controlled Workday sign-in guard insertion point was not found.');
}
fs.writeFileSync(target, source.replace(marker, replacement));
console.log('Applied controlled Workday sign-in guard.');
