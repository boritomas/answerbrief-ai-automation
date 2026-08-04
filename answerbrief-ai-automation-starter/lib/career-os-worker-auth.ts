import crypto from 'node:crypto';

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

export async function authorizeBrowserWorker(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const sharedToken = clean(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);

  if (sharedToken && bearer === sharedToken) {
    return { authorized: true, reason: '' };
  }

  if (await verifyGitHubActionsOidc(bearer)) {
    return { authorized: true, reason: '' };
  }

  return { authorized: false, reason: 'Unauthorized browser worker request.' };
}

async function verifyGitHubActionsOidc(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;

    if (header.alg !== 'RS256' || !header.kid) return false;
    if (payload.iss !== 'https://token.actions.githubusercontent.com') return false;
    if (payload.aud !== 'answerbrief-career-os') return false;
    if (payload.repository !== 'boritomas/answerbrief-ai-automation') return false;
    if (payload.ref !== 'refs/heads/main') return false;
    if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return false;

    const response = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks');
    if (!response.ok) return false;

    const jwks = await response.json() as { keys?: Array<Record<string, unknown>> };
    const jwk = jwks.keys?.find((key) => key.kid === header.kid);
    if (!jwk) return false;

    const publicKey = crypto.createPublicKey({ key: jwk as never, format: 'jwk' });
    return crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], 'base64url'),
    );
  } catch {
    return false;
  }
}
