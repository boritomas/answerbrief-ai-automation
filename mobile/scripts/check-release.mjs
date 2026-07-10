import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const forbidden = [
  { pattern: /stripe/i, allowed: [/README\.md$/, /docs\/release-readiness\.md$/], label: 'Stripe reference' },
  { pattern: /checkout/i, allowed: [/README\.md$/, /docs\/release-readiness\.md$/], label: 'checkout reference' },
  { pattern: /pricing/i, allowed: [/README\.md$/, /docs\/release-readiness\.md$/], label: 'pricing reference' },
  { pattern: /buy button/i, allowed: [/README\.md$/, /docs\/release-readiness\.md$/], label: 'buy-button reference' },
  { pattern: /localhost|127\.0\.0\.1/i, allowed: [], label: 'local development URL' },
  { pattern: /service_role|SUPABASE_SERVICE_ROLE|SECRET_KEY|REFRESH_TOKEN/i, allowed: [], label: 'server secret reference' }
];

const scanExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md']);

function walk(dir, files = []) {
  for (const item of readdirSync(dir)) {
    if (['node_modules', 'dist', '.expo', '.git'].includes(item)) continue;
    const path = join(dir, item);
    if (statSync(path).isDirectory()) {
      walk(path, files);
    } else if (scanExtensions.has(path.slice(path.lastIndexOf('.')))) {
      files.push(path);
    }
  }
  return files;
}

const failures = [];
for (const file of walk(root)) {
  const rel = relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (!rule.pattern.test(text)) continue;
    if (rule.allowed.some((allowed) => allowed.test(rel))) continue;
    failures.push(`${rule.label} found in ${rel}`);
  }
}

if (failures.length > 0) {
  console.error('Mobile release check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Mobile release check passed.');
