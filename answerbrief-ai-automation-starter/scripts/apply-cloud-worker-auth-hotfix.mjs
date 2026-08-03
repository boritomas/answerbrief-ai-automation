import fs from 'node:fs';

const file = new URL('../lib/career-os-browser-worker.ts', import.meta.url);
let source = fs.readFileSync(file, 'utf8');
const before = `export function browserWorkerConfigured() {\n  return Boolean(cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN));\n}\n\nexport function authorizeBrowserWorker(request: Request) {\n  const token = cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);\n  const authorization = request.headers.get('authorization') || '';\n  if (!token) return { authorized: false, reason: 'CAREER_OS_BROWSER_WORKER_TOKEN is not configured.' };\n  if (authorization === \`Bearer \${token}\`) return { authorized: true, reason: '' };\n  return { authorized: false, reason: 'Unauthorized browser worker request.' };\n}`;
const after = `function browserWorkerAuthToken() {\n  return cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN) || cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);\n}\n\nexport function browserWorkerConfigured() {\n  return Boolean(browserWorkerAuthToken());\n}\n\nexport function authorizeBrowserWorker(request: Request) {\n  const token = browserWorkerAuthToken();\n  const authorization = request.headers.get('authorization') || '';\n  if (!token) return { authorized: false, reason: 'Browser worker authentication is not configured.' };\n  if (authorization === \`Bearer \${token}\`) return { authorized: true, reason: '' };\n  return { authorized: false, reason: 'Unauthorized browser worker request.' };\n}`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Browser worker auth block not found.');
  source = source.replace(before, after);
  fs.writeFileSync(file, source);
}
console.log('Applied cloud worker authentication hotfix.');
