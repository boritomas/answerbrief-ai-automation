'use server';

import { redirect } from 'next/navigation';
import { intakeSchema } from '@/lib/intake-schema';
import { saveOrderIntake } from '@/lib/orders';

export async function submitIntake(formData: FormData) {
  const errorPath = getSafePath(getValue(formData, 'errorPath'), '/intake');
  const successPath = getSafePath(getValue(formData, 'successPath'), '/intake/thanks');
  const privacyAccepted = formData.get('privacyAccepted') === 'on';

  if (!privacyAccepted) {
    redirect(`${errorPath}?error=privacy`);
  }

  const orderId = getValue(formData, 'orderId');
  const packageName = getPackageName(getValue(formData, 'packageName'));
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

  await saveOrderIntake(orderId, result.data, packageName);

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
