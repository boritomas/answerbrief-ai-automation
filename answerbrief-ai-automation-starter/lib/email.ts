type NextStepsEmail = {
  to: string;
  packageName: string;
  intakeUrl: string;
};

type DeliveryEmail = {
  to: string;
  packageName: string;
  briefUrl?: string;
};

type OwnerPaymentNotification = {
  adminUrl: string;
  amountPaid?: number;
  customerEmail: string;
  customerName?: string;
  orderId: string;
  packageName: string;
};

type OwnerIntakeNotification = {
  adminUrl: string;
  customerEmail: string;
  customerName?: string;
  interviewDate?: string;
  jobPostingUploaded: boolean;
  orderId: string;
  packageName: string;
  resumeUploaded: boolean;
  submittedAt: string;
  targetCompany?: string;
  targetRole: string;
};

type IntakeConfirmationEmail = {
  deliveryDate?: string;
  packageName: string;
  to: string;
};

export async function sendNextStepsEmail({ to, packageName, intakeUrl }: NextStepsEmail) {
  const subject = 'Next steps for your AnswerBrief AI prep package';
  const text = buildNextStepsEmail({ packageName, intakeUrl });

  return sendEmail({ label: 'Next-steps', subject, text, to });
}

export async function sendDeliveryEmail({ to, packageName, briefUrl }: DeliveryEmail) {
  const subject = 'Your AnswerBrief AI interview brief is ready';
  const text = buildDeliveryEmail({ packageName, briefUrl });

  return sendEmail({ label: 'Delivery', subject, text, to });
}

export async function sendIntakeConfirmationEmail({ deliveryDate, packageName, to }: IntakeConfirmationEmail) {
  const subject = 'Your AnswerBrief AI intake was received';
  const text = buildIntakeConfirmationEmail({ deliveryDate, packageName });

  return sendEmail({ label: 'Intake confirmation', subject, text, to });
}

export async function sendMobileOtpEmail({ otp, to }: { otp: string; to: string }) {
  const subject = 'Your AnswerBrief AI sign-in code';
  const text = [
    'Hi,',
    '',
    `Your AnswerBrief AI mobile sign-in code is: ${otp}`,
    '',
    'This code expires in about 10 minutes. If you did not request it, you can ignore this email.',
    '',
    'Thanks,',
    'AnswerBrief AI',
  ].join('\n');

  return sendEmail({ label: 'Mobile sign-in code', subject, text, to });
}

export async function sendOwnerPaymentNotification(input: OwnerPaymentNotification) {
  const to = getOwnerNotificationEmail();
  const subject = `New AnswerBrief AI order: ${input.packageName}`;
  const text = buildOwnerPaymentNotification(input);

  return sendEmail({ label: 'Owner payment notification', subject, text, to });
}

export async function sendOwnerIntakeNotification(input: OwnerIntakeNotification) {
  const to = getOwnerNotificationEmail();
  const subject = `AnswerBrief AI intake submitted: ${input.customerName || input.customerEmail}`;
  const text = buildOwnerIntakeNotification(input);

  return sendEmail({ label: 'Owner intake notification', subject, text, to });
}

function getOwnerNotificationEmail() {
  return process.env.OWNER_NOTIFICATION_EMAIL
    || process.env.NOTIFICATION_EMAIL
    || process.env.ADMIN_NOTIFICATION_EMAIL
    || process.env.GMAIL_SENDER_EMAIL
    || '';
}

async function sendEmail({
  label,
  subject,
  text,
  to,
}: {
  label: string;
  subject: string;
  text: string;
  to?: string;
}) {
  if (!to) {
    console.log(`${label} email skipped because no recipient is configured.`);

    return {
      success: true,
      skipped: true,
    };
  }

  if (!isGmailConfigured()) {
    console.log(`Gmail is not configured. ${label} email for ${to}:`);
    console.log(text);

    return {
      success: true,
      skipped: true,
    };
  }

  const accessToken = await getGmailAccessToken();
  const raw = encodeMessage({
    from: process.env.GMAIL_SENDER_EMAIL as string,
    to,
    subject,
    text,
  });

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    throw new Error(`Gmail ${label.toLowerCase()} send failed: ${await response.text()}`);
  }

  return {
    success: true,
  };
}

function isGmailConfigured() {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN &&
    process.env.GMAIL_SENDER_EMAIL
  );
}

async function getGmailAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID as string,
      client_secret: process.env.GMAIL_CLIENT_SECRET as string,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN as string,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Gmail token request failed: ${await response.text()}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

function buildNextStepsEmail({
  packageName,
  intakeUrl,
}: Pick<NextStepsEmail, 'packageName' | 'intakeUrl'>) {
  return [
    'Hi,',
    '',
    `Thanks for your ${packageName} order.`,
    '',
    'Next step: send the materials we need to build your interview prep package.',
    '',
    `Intake form: ${intakeUrl}`,
    '',
    'Please provide:',
    '',
    '1. Your current resume',
    '2. The job posting',
    '3. Interview date, if scheduled',
    '4. Interview format, if known',
    '5. Any notes about the role or your concerns',
    '6. Two or three work examples you may want to use',
    '',
    'Do not upload confidential employer documents or anything you do not have permission to share.',
    '',
    'Once we receive your materials, we will start your prep package. Standard delivery is within 24 hours after usable materials are received. Rush delivery may be available when capacity allows.',
    '',
    'You can request deletion of your submitted materials by replying to this email.',
    '',
    'AnswerBrief AI provides interview preparation materials only. We do not guarantee interviews, job offers, or hiring outcomes.',
    '',
    'Thanks,',
    'AnswerBrief AI',
  ].join('\n');
}

function buildIntakeConfirmationEmail({
  deliveryDate,
  packageName,
}: Pick<IntakeConfirmationEmail, 'deliveryDate' | 'packageName'>) {
  return [
    'Hi,',
    '',
    `We received your intake for ${packageName}.`,
    '',
    'Next steps:',
    '',
    '1. We review your resume, target role, job posting, and notes.',
    '2. We prepare your interview strategy brief.',
    deliveryDate
      ? `3. Your current estimated delivery date is ${deliveryDate}.`
      : '3. Standard delivery is within 24 hours after usable materials are received.',
    '',
    'If anything is missing or unclear, reply to this email or contact support@answer-brief.com.',
    '',
    'Reminder: AnswerBrief AI provides interview preparation materials only. We do not guarantee interviews, job offers, promotions, or hiring outcomes.',
    '',
    'Thanks,',
    'AnswerBrief AI',
  ].join('\n');
}

function buildDeliveryEmail({ packageName, briefUrl }: Pick<DeliveryEmail, 'packageName' | 'briefUrl'>) {
  return [
    'Hi,',
    '',
    `Your ${packageName} interview brief is ready.`,
    '',
    briefUrl
      ? `View or download your brief here: ${briefUrl}`
      : 'Your brief has been generated, but the share link is not available. Please reply to this email and we will send it manually.',
    '',
    'If anything looks off or you need a minor clarification, reply to this email with the question.',
    '',
    'Reminder: AnswerBrief AI provides preparation materials to help you organize and communicate your experience. We do not guarantee interviews, job offers, promotions, or hiring outcomes.',
    '',
    'Thanks,',
    'AnswerBrief AI',
  ].join('\n');
}

function buildOwnerPaymentNotification({
  adminUrl,
  amountPaid,
  customerEmail,
  customerName,
  orderId,
  packageName,
}: OwnerPaymentNotification) {
  return [
    'New AnswerBrief AI payment received.',
    '',
    `Customer name: ${customerName || 'Not provided'}`,
    `Customer email: ${customerEmail}`,
    `Package: ${packageName}`,
    `Order ID: ${orderId}`,
    amountPaid ? `Amount paid: $${(amountPaid / 100).toFixed(2)}` : undefined,
    '',
    `Admin dashboard: ${adminUrl}`,
  ].filter(Boolean).join('\n');
}

function buildOwnerIntakeNotification({
  adminUrl,
  customerEmail,
  customerName,
  interviewDate,
  jobPostingUploaded,
  orderId,
  packageName,
  resumeUploaded,
  submittedAt,
  targetCompany,
  targetRole,
}: OwnerIntakeNotification) {
  return [
    'AnswerBrief AI intake submitted.',
    '',
    `Customer name: ${customerName || 'Not provided'}`,
    `Customer email: ${customerEmail}`,
    `Package: ${packageName}`,
    `Order ID: ${orderId}`,
    `Interview company: ${targetCompany || 'Not provided'}`,
    `Target role: ${targetRole}`,
    `Interview date: ${interviewDate || 'Not provided'}`,
    `Resume uploaded: ${resumeUploaded ? 'Yes' : 'No'}`,
    `Job posting uploaded: ${jobPostingUploaded ? 'Yes' : 'No'}`,
    `Submission timestamp: ${submittedAt}`,
    '',
    `Admin dashboard: ${adminUrl}`,
  ].join('\n');
}

function encodeMessage({
  from,
  to,
  subject,
  text,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
