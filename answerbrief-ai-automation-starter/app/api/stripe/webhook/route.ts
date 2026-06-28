import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendNextStepsEmail } from '@/lib/email';

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
    const packageName = session.metadata?.package || 'Interview Prep Package';

    if (customerEmail) {
      await sendNextStepsEmail({
        to: customerEmail,
        packageName,
      });
    }

    // TODO:
    // 1. Create order row in tracker.
    // 2. Create customer Drive folder.
    // 3. Send intake form link.
    // 4. Notify owner.
  }

  return NextResponse.json({ received: true });
}
