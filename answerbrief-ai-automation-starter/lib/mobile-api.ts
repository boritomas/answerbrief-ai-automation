import { NextRequest, NextResponse } from 'next/server';
import { getMobileSession } from './mobile-auth';

export function unauthorizedMobileResponse() {
  return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
}

export function getAuthenticatedMobileEmail(request: NextRequest) {
  return getMobileSession(request)?.email;
}

export function assertMobileOrderAccess(orderEmail: string, sessionEmail?: string) {
  return Boolean(sessionEmail && orderEmail.toLowerCase() === sessionEmail.toLowerCase());
}

export function notFoundMobileResponse() {
  return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
}
