import { NextRequest, NextResponse } from 'next/server';
import { getMobileSession } from './mobile-auth';

export function mobileJson<T>(data: T, status = 200) {
  return NextResponse.json({ ok: status < 400, ...data }, { status });
}

export function mobileError(error: string, status = 400) {
  return mobileJson({ error }, status);
}

export function unauthorizedMobileResponse() {
  return mobileError('Authentication required.', 401);
}

export function forbiddenMobileResponse() {
  return mobileError('You do not have access to this order.', 403);
}

export function getAuthenticatedMobileEmail(request: NextRequest) {
  return getMobileSession(request)?.email;
}

export function assertMobileOrderAccess(orderEmail: string, sessionEmail?: string) {
  return Boolean(sessionEmail && orderEmail.toLowerCase() === sessionEmail.toLowerCase());
}

export function notFoundMobileResponse() {
  return mobileError('Order not found.', 404);
}

export async function readMobileJson(request: NextRequest) {
  return request.json().catch(() => ({}));
}
