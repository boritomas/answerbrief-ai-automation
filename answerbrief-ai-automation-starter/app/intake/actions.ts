'use server';

import { redirect } from 'next/navigation';
import { intakeSchema } from '@/lib/intake-schema';
import { IntakeUpload, saveOrderIntake } from '@/lib/orders';

const maxUploadBytes = 10 * 1024 * 1024;

export async function submitIntake(formData: FormData) {
  const errorPath = getSafePath(getValue(formData, 'errorPath'), '/intake');
  const successPath = getSafePath(getValue(formData, 'successPath'), '/intake/thanks');
  const privacyAccepted = formData.get('privacyAccepted') === 'on';

  if (!privacyAccepted) {
    redirect(`${errorPath}?error=privacy`);
  }

  const orderId = getValue(formData, 'orderId');
  const packageName = getPackageName(getValue(formData, 'packageName'));
  const uploads = await getUploads(formData);

  if (!uploads) {
    redirect(`${errorPath}?error=validation`);
  }

  const result = intakeSchema.safeParse({
    name: getValue(formData, 'name'),
    email: getValue(formData, 'email'),
    targetRole: getValue(formData, 'targetRole'),
    targetCompany: getValue(formData, 'targetCompany'),
    interviewDate: getValue(formData, 'interviewDate'),
    careerLane: getValue(formData, 'careerLane'),
    notes: getValue(formData, 'notes'),
  });

  if (!result.success) {
    redirect(`${errorPath}?error=validation`);
  }

  await saveOrderIntake(orderId, result.data, packageName, uploads);

  redirect(successPath);
}

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function getPackageName(value: string) {
  if (value === 'Free Interview Fit Check') {
    return value;
  }

  return 'Interview Prep Package';
}

function getSafePath(value: string, fallback: string) {
  return ['/intake', '/fit-check', '/intake/thanks'].includes(value) ? value : fallback;
}

async function getUploads(formData: FormData) {
  const uploadFields = [
    ['Resume', 'resumeFile'],
    ['Job Posting', 'jobPostingFile'],
    ['Interview Notes', 'notesFile'],
  ] as const;
  const uploads: IntakeUpload[] = [];

  for (const [label, field] of uploadFields) {
    const value = formData.get(field);

    if (!isUploadFile(value) || value.size === 0) {
      continue;
    }

    if (value.size > maxUploadBytes) {
      return null;
    }

    uploads.push({
      label,
      fileName: value.name,
      mimeType: value.type || 'application/octet-stream',
      bytes: Buffer.from(await value.arrayBuffer()),
    });
  }

  return uploads;
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'arrayBuffer' in value &&
    'name' in value &&
    'size' in value
  );
}
