import { NextResponse, type NextRequest } from 'next/server';
import { decideDomainRouting } from './scripts/lib/tomas-domain-policy.mjs';

// See scripts/lib/tomas-domain-policy.mjs for the policy and its rationale
// (tested directly in tests/acceptance/tomas-domain-policy.test.mjs). This
// file only translates that decision into a Next.js response.
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const decision = decideDomainRouting(hostname, request.nextUrl.pathname);

  if (decision.action === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }
  if (decision.action === 'not-found') {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/).*)'],
};
