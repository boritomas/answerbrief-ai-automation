import { NextResponse, type NextRequest } from 'next/server';

// This deployment serves two unrelated properties from one Next.js app:
// tomasnieves.com (Tomas's personal executive site, just /tomas) and
// answer-brief.com (the AnswerBrief AI product). next.config.mjs only
// rewrites the root path "/" per host -- it does not restrict any other
// route, so every AnswerBrief route (career-os, admin, checkout, the API)
// was reachable on tomasnieves.com, and /tomas was reachable on
// answer-brief.com. This middleware is the host boundary that was missing.
//
// /api/* is exempt on every host: Vercel Cron and webhooks (Stripe, etc.)
// invoke API routes directly and must keep working regardless of which
// domain Vercel treats as primary; blocking browser-facing pages is enough
// to satisfy "a recruiter must never see the product," since raw JSON API
// responses are not a product experience.
const TOMAS_HOSTS = new Set(['tomasnieves.com', 'www.tomasnieves.com']);
const ANSWERBRIEF_HOSTS = new Set(['answer-brief.com', 'www.answer-brief.com']);

const TOMAS_ALLOWED_PREFIXES = ['/tomas', '/icon', '/robots.txt', '/sitemap.xml', '/api'];

export function middleware(request: NextRequest) {
  const hostname = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const { pathname } = request.nextUrl;

  if (TOMAS_HOSTS.has(hostname)) {
    const isAllowed = pathname === '/' || TOMAS_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (!isAllowed) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (ANSWERBRIEF_HOSTS.has(hostname)) {
    if (pathname === '/tomas' || pathname.startsWith('/tomas/')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Any other host (Vercel preview deployments, the default *.vercel.app
  // domain, localhost) is internal review infrastructure, not a public
  // production domain -- leave it unrestricted so PR previews keep working.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/).*)'],
};
