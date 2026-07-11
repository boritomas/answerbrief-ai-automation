import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { isTransactionalEmailConfigured } from './email';

type MobileSessionPayload = {
  email: string;
  exp: number;
};

const sessionTtlSeconds = 60 * 60 * 24 * 7;
const otpWindowSeconds = 10 * 60;

export function getMobileAuthConfiguration() {
  const secretConfigured = Boolean(getMobileAuthSecret());

  return {
    configured: secretConfigured,
    otpDeliveryConfigured: secretConfigured && isTransactionalEmailConfigured(),
  };
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createMobileSessionToken(email: string) {
  const secret = getMobileAuthSecret();

  if (!secret) {
    throw new Error('Mobile authentication secret is not configured.');
  }

  const payload: MobileSessionPayload = {
    email: email.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(body, secret);

  return `${body}.${signature}`;
}

export function generateMobileOtp(email: string, now = Date.now()) {
  const secret = getMobileAuthSecret();

  if (!secret) {
    throw new Error('Mobile authentication secret is not configured.');
  }

  return createOtpForWindow(email, Math.floor(now / 1000 / otpWindowSeconds), secret);
}

export function verifyMobileOtp(email: string, otp: string) {
  const secret = getMobileAuthSecret();

  if (!secret || !/^\d{6}$/.test(otp)) {
    return false;
  }

  const currentWindow = Math.floor(Date.now() / 1000 / otpWindowSeconds);
  const actualBuffer = Buffer.from(otp);

  return [currentWindow, currentWindow - 1].some((window) => {
    const expectedBuffer = Buffer.from(createOtpForWindow(email, window, secret));

    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  });
}

export function getMobileSession(request: NextRequest) {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;

  if (!token) {
    return undefined;
  }

  return verifyMobileSessionToken(token);
}

export function verifyMobileSessionToken(token: string): MobileSessionPayload | undefined {
  const secret = getMobileAuthSecret();

  if (!secret) {
    return undefined;
  }

  const [body, signature] = token.split('.');

  if (!body || !signature || signature !== sign(body, secret)) {
    return undefined;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as MobileSessionPayload;

    if (!payload.email || payload.exp < Math.floor(Date.now() / 1000)) {
      return undefined;
    }

    return payload;
  } catch {
    return undefined;
  }
}

function getMobileAuthSecret() {
  return process.env.MOBILE_AUTH_SECRET || '';
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function createOtpForWindow(email: string, window: number, secret: string) {
  const digest = createHmac('sha256', secret)
    .update(`${email.toLowerCase()}:${window}`)
    .digest();
  const value = digest.readUInt32BE(0) % 1000000;

  return value.toString().padStart(6, '0');
}
