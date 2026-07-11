import { Resend } from 'resend';

export type PlatformEmailTemplate = {
  subject: string;
  text: string;
};

export type SendPlatformEmailInput = PlatformEmailTemplate & {
  label: string;
  to?: string;
};

export type SendPlatformEmailResult = {
  id?: string;
  provider: 'resend';
  skipped: boolean;
  success: boolean;
};

export type PlatformEmailDiagnostics = {
  configured: boolean;
  from: string;
  provider: 'resend';
  replyTo: string;
};

let resendClient: Resend | undefined;

export async function sendEmail({
  label,
  subject,
  text,
  to,
}: SendPlatformEmailInput): Promise<SendPlatformEmailResult> {
  if (!to) {
    console.log(`${label} email skipped because no recipient is configured.`);

    return {
      provider: 'resend',
      success: true,
      skipped: true,
    };
  }

  const config = getPlatformEmailConfiguration();

  if (!config.configured) {
    console.log(`Resend is not configured. ${label} email for ${to}:`);
    console.log(text);

    return {
      provider: 'resend',
      success: true,
      skipped: true,
    };
  }

  const result = await getResendClient().emails.send({
    from: formatEmailAddress(config.fromAddress, config.fromName),
    replyTo: config.replyTo,
    subject,
    text,
    to,
  });

  if (result.error) {
    throw new Error(`Resend ${label.toLowerCase()} send failed: ${result.error.message}`);
  }

  return {
    id: result.data?.id,
    provider: 'resend',
    success: true,
    skipped: false,
  };
}

export function isTransactionalEmailConfigured() {
  return getPlatformEmailConfiguration().configured;
}

export function getPlatformEmailDiagnostics(): PlatformEmailDiagnostics {
  const config = getPlatformEmailConfiguration();

  return {
    configured: config.configured,
    from: formatEmailAddress(config.fromAddress, config.fromName),
    provider: 'resend',
    replyTo: config.replyTo,
  };
}

function getPlatformEmailConfiguration() {
  const productName = process.env.PRODUCT_NAME || 'AnswerBrief AI';
  const fromAddress = process.env.FROM_ADDRESS || process.env.EMAIL_FROM_ADDRESS || 'hello@answer-brief.com';
  const fromName = process.env.FROM_NAME || productName;
  const replyTo = process.env.REPLY_TO || process.env.REPLY_TO_EMAIL || fromAddress;

  return {
    configured: Boolean(process.env.RESEND_API_KEY && fromAddress),
    fromAddress,
    fromName,
    replyTo,
  };
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  resendClient ||= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

function formatEmailAddress(email: string, displayName?: string) {
  const cleanEmail = sanitizeHeaderValue(email.trim());
  const cleanName = displayName ? sanitizeHeaderValue(displayName.trim()) : '';

  if (!cleanName) {
    return cleanEmail;
  }

  const quotedName = cleanName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${quotedName}" <${cleanEmail}>`;
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
