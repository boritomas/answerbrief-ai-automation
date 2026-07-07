'use server';

import { redirect } from 'next/navigation';
import { intakeSchema } from '@/lib/intake-schema';
import { saveOrderIntake } from '@/lib/orders';

const allowedFileTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);
const maxFileSizeBytes = 8 * 1024 * 1024;

export async function submitIntake(formData: FormData) {
  const privacyAccepted = formData.get('privacyAccepted') === 'on';

  if (!privacyAccepted) {
    redirect('/intake?error=privacy');
  }

  const orderId = getValue(formData, 'orderId');
  const token = getValue(formData, 'token');
  const result = intakeSchema.safeParse({
    name: getValue(formData, 'name'),
    email: getValue(formData, 'email'),
    targetRole: getValue(formData, 'targetRole'),
    targetCompany: getValue(formData, 'targetCompany'),
    interviewDate: getValue(formData, 'interviewDate'),
    careerLane: getValue(formData, 'careerLane'),
    jobPostingText: getValue(formData, 'jobPostingText'),
    notes: getValue(formData, 'notes'),
  });

  if (!result.success) {
    redirect('/intake?error=validation');
  }

  const files = [formData.get('resumeFile'), formData.get('jobDescriptionFile')]
    .filter((file): file is File => file instanceof File && file.size > 0);

  let uploads;

  try {
    uploads = await Promise.all(files.map(readAllowedUpload));
  } catch {
    redirect('/intake?error=file');
  }

  try {
    await saveOrderIntake({
      orderId,
      token,
      intake: result.data,
      uploads,
    });
  } catch {
    redirect('/intake?error=token');
  }

  redirect('/intake/thanks');
}

async function readAllowedUpload(file: File) {
  if (file.size > maxFileSizeBytes || !allowedFileTypes.has(file.type)) {
    throw new Error('Unsupported file upload.');
  }

  return {
    filename: file.name,
    contentType: file.type,
    content: Buffer.from(await file.arrayBuffer()),
  };
}

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
