import fs from 'node:fs';

const workerFile = new URL('../lib/career-os-browser-worker.ts', import.meta.url);
let source = fs.readFileSync(workerFile, 'utf8');
const originalSharedAuth = `export function browserWorkerConfigured() {\n  return Boolean(cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN));\n}\n\nexport function authorizeBrowserWorker(request: Request) {\n  const token = cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);\n  const authorization = request.headers.get('authorization') || '';\n  if (!token) return { authorized: false, reason: 'CAREER_OS_BROWSER_WORKER_TOKEN is not configured.' };\n  if (authorization === \`Bearer \${token}\`) return { authorized: true, reason: '' };\n  return { authorized: false, reason: 'Unauthorized browser worker request.' };\n}`;
const fallbackSharedAuth = `function browserWorkerAuthToken() {\n  return cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN) || cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);\n}\n\nexport function browserWorkerConfigured() {\n  return Boolean(browserWorkerAuthToken());\n}\n\nexport function authorizeBrowserWorker(request: Request) {\n  const token = browserWorkerAuthToken();\n  const authorization = request.headers.get('authorization') || '';\n  if (!token) return { authorized: false, reason: 'Browser worker authentication is not configured.' };\n  if (authorization === \`Bearer \${token}\`) return { authorized: true, reason: '' };\n  return { authorized: false, reason: 'Unauthorized browser worker request.' };\n}`;
const oidcAuth = `function browserWorkerAuthToken() {\n  return cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);\n}\n\nexport function browserWorkerConfigured() {\n  return true;\n}\n\nexport async function authorizeBrowserWorker(request: Request) {\n  const authorization = request.headers.get('authorization') || '';\n  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';\n  const sharedToken = browserWorkerAuthToken();\n  if (sharedToken && bearer === sharedToken) return { authorized: true, reason: '' };\n  const oidc = await verifyGitHubActionsOidc(bearer);\n  if (oidc) return { authorized: true, reason: '' };\n  return { authorized: false, reason: 'Unauthorized browser worker request.' };\n}\n\nasync function verifyGitHubActionsOidc(token: string) {\n  try {\n    const parts = token.split('.');\n    if (parts.length !== 3) return false;\n    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { alg?: string; kid?: string };\n    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;\n    if (header.alg !== 'RS256' || !header.kid) return false;\n    if (payload.iss !== 'https://token.actions.githubusercontent.com') return false;\n    if (payload.aud !== 'answerbrief-career-os') return false;\n    if (payload.repository !== 'boritomas/answerbrief-ai-automation') return false;\n    if (payload.ref !== 'refs/heads/main') return false;\n    if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return false;\n    const response = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks');\n    if (!response.ok) return false;\n    const jwks = await response.json() as { keys?: JsonWebKey[] };\n    const jwk = jwks.keys?.find((key) => key.kid === header.kid);\n    if (!jwk) return false;\n    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });\n    const signingInput = parts[0] + '.' + parts[1];\n    return crypto.verify('RSA-SHA256', Buffer.from(signingInput), publicKey, Buffer.from(parts[2], 'base64url'));\n  } catch {\n    return false;\n  }\n}`;
if (!source.includes(oidcAuth)) {
  if (source.includes(fallbackSharedAuth)) source = source.replace(fallbackSharedAuth, oidcAuth);
  else if (source.includes(originalSharedAuth)) source = source.replace(originalSharedAuth, oidcAuth);
  else throw new Error('Browser worker auth block not found.');
  fs.writeFileSync(workerFile, source);
}

for (const relative of [
  '../app/api/career-os/worker/claim/route.ts',
  '../app/api/career-os/worker/report/route.ts',
  '../app/api/career-os/worker/submit-check/route.ts',
]) {
  const routeFile = new URL(relative, import.meta.url);
  let route = fs.readFileSync(routeFile, 'utf8');
  route = route.replace('const auth = authorizeBrowserWorker(request);', 'const auth = await authorizeBrowserWorker(request);');
  fs.writeFileSync(routeFile, route);
}

console.log('Applied GitHub OIDC browser worker authentication hotfix.');
