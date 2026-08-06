// Host-isolation policy shared by middleware.ts (Next.js runtime) and this
// module's test suite (plain node, no Next.js dependency -- middleware.ts
// imports this file directly so the same decision logic runs in both
// places, matching the existing scripts/lib/*.mjs convention in this repo).
//
// tomasnieves.com (Tomas's personal site) and answer-brief.com (AnswerBrief
// AI) share one Vercel project and one Next.js app. Without this policy,
// every AnswerBrief route was reachable on tomasnieves.com and /tomas was
// reachable on answer-brief.com.

export const TOMAS_HOSTS = new Set(['tomasnieves.com', 'www.tomasnieves.com']);
export const ANSWERBRIEF_HOSTS = new Set(['answer-brief.com', 'www.answer-brief.com']);

// The public tomasnieves.com site is fully static and has no API dependency
// of its own -- this allowlist is intentionally empty. These two exact
// paths are the only /api exemption, on every host, as an operational
// safety net: Vercel Cron (vercel.json) and the Stripe webhook are invoked
// directly by Vercel/Stripe against the deployment, and neither vercel.json
// nor Stripe's dashboard config lets this repo pin which Host header
// they'll send, so the safe choice is keeping both reachable everywhere
// rather than gambling on which custom domain Vercel treats as
// "Production." Every other /api route stays answer-brief.com-only.
export const INFRA_EXEMPT_PATHS = new Set(['/api/career-os/daily-run', '/api/stripe/webhook']);

export const TOMAS_ALLOWED_PREFIXES = ['/tomas', '/icon', '/robots.txt', '/sitemap.xml'];

/**
 * @param {string} rawHostname
 * @param {string} pathname
 * @returns {{ action: 'next' } | { action: 'redirect', to: string } | { action: 'not-found' }}
 */
export function decideDomainRouting(rawHostname, pathname) {
  const hostname = (rawHostname || '').split(':')[0].toLowerCase();

  if (INFRA_EXEMPT_PATHS.has(pathname)) {
    return { action: 'next' };
  }

  if (TOMAS_HOSTS.has(hostname)) {
    const isAllowed = pathname === '/' || TOMAS_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (isAllowed) {
      return { action: 'next' };
    }
    if (pathname.startsWith('/api/')) {
      return { action: 'not-found' };
    }
    return { action: 'redirect', to: '/' };
  }

  if (ANSWERBRIEF_HOSTS.has(hostname)) {
    if (pathname === '/tomas' || pathname.startsWith('/tomas/')) {
      return { action: 'redirect', to: '/' };
    }
    return { action: 'next' };
  }

  // Any other host (Vercel preview deployments, the default *.vercel.app
  // domain, localhost) is internal review infrastructure, not a public
  // production domain -- leave it unrestricted so PR previews keep working.
  return { action: 'next' };
}
