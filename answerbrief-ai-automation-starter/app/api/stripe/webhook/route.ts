import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendNextStepsEmail } from '@/lib/email';
import { createPaidOrder, getIntakeUrl } from '@/lib/orders';
import { packages } from '@/lib/packages';
import type { PackageKey } from '@/lib/packages';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (error) {
    return NextResponse.json({ error: 'Webhook signature verification failed.' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name || undefined;
    const packageKey = getPackageKey(session);
    const packageName = packageKey ? packages[packageKey].name : getPackageName(session);

    if (customerEmail) {
      const order = await createPaidOrder({
        amountPaid: session.amount_total || undefined,
        customerEmail,
        customerName,
        packageKey,
        packageName,
        stripePaymentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
        stripeSessionId: session.id,
      });
      const intakeUrl = getIntakeUrl(order.id, customerEmail, order.intakeToken);

      await sendNextStepsEmail({
        to: customerEmail,
        packageName,
        intakeUrl,
      }).catch(async (error) => {
        console.error('Next-steps email failed:', error instanceof Error ? error.message : 'Unknown email error.');
      });
    }

    // Customer materials are uploaded through the secure intake flow after checkout.
  }

  return NextResponse.json({ received: true });
}

function getPackageName(session: Stripe.Checkout.Session) {
  const packageKey = getPackageKey(session);

  if (packageKey) {
    return packages[packageKey].name;
  }

  const metadataPackage = session.metadata?.package;

  if (metadataPackage) {
    return metadataPackage;
  }

  const matchingPackage = Object.values(packages).find((pkg) => {
    return session.amount_total === pkg.priceUsd * 100;
  });

  return matchingPackage?.name || 'Interview Prep Package';
}

function getPackageKey(session: Stripe.Checkout.Session): PackageKey | undefined {
  const metadataPackage = session.metadata?.package;

  if (metadataPackage && metadataPackage in packages) {
    return metadataPackage as PackageKey;
  }

  return (Object.keys(packages) as PackageKey[]).find((key) => {
    return session.amount_total === packages[key].priceUsd * 100;
  });
}
