import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendNextStepsEmail } from '@/lib/email';
import { createPaidOrder, getIntakeUrl } from '@/lib/orders';
import { packages } from '@/lib/packages';

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
    const packageName = getPackageName(session);

    if (customerEmail) {
      const order = await createPaidOrder({
        customerEmail,
        packageName,
        stripeSessionId: session.id,
      });
      const intakeUrl = getIntakeUrl(order.id, customerEmail);

      await sendNextStepsEmail({
        to: customerEmail,
        packageName,
        intakeUrl,
      });
    }

    // TODO: Notify owner and upload customer materials into an AI-ready knowledge store.
  }

  return NextResponse.json({ received: true });
}

function getPackageName(session: Stripe.Checkout.Session) {
  const metadataPackage = session.metadata?.package;

  if (metadataPackage) {
    return metadataPackage;
  }

  const matchingPackage = Object.values(packages).find((pkg) => {
    return session.amount_total === pkg.priceUsd * 100;
  });

  return matchingPackage?.name || 'Interview Prep Package';
}
