'use server';

import { redirect } from 'next/navigation';
import { intakeSchema } from '@/lib/intake-schema';
import { saveOrderIntake } from '@/lib/orders';

export async function submitIntake(formData: FormData) {
  const privacyAccepted = formData.get('privacyAccepted') === 'on';

  if (!privacyAccepted) {
    redirect('/intake?error=privacy');
  }

  const orderId = getValue(formData, 'orderId');
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
    redirect('/intake?error=validation');
  }

  await saveOrderIntake(orderId, result.data);

  redirect('/intake/thanks');
}

function getValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
