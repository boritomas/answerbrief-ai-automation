import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirs = ['app', 'components', 'lib'].map((dir) => path.join(repoRoot, dir));
const issues = [];

for (const required of [
  path.join(repoRoot, 'app', 'career-os', 'page.tsx'),
  path.join(repoRoot, 'app', 'api', 'career-os', 'status', 'route.ts'),
  path.join(repoRoot, 'lib', 'career-os-status.ts'),
]) {
  if (!existsSync(required)) {
    issues.push(`Missing required Career OS source file: ${path.relative(repoRoot, required)}`);
  }
}

for (const file of sourceDirs.flatMap(walkSourceFiles)) {
  const text = readFileSync(file, 'utf8');
  const relative = path.relative(repoRoot, file);

  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,}/.test(text)) {
    issues.push(`${relative}: possible committed secret material.`);
  }

  if (/Verizon confidential|internal screenshot|employment-confidential/i.test(text)) {
    issues.push(`${relative}: forbidden confidential-data marker.`);
  }

  if (/productionEvidenceReady:\s*true/.test(text)) {
    issues.push(`${relative}: hard-coded production evidence readiness is not allowed.`);
  }
}

if (issues.length) {
  console.error('Career OS source lint failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log('Career OS source lint passed.');

function walkSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (['node_modules', '.next', 'data'].includes(entry)) continue;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}
