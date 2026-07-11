import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { packages, PackageKey } from '@/lib/packages';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

function getPackage(packageKey: string | null) {
  if (!packageKey || !(packageKey in packages)) {
    return null;
  }
  return packages[packageKey as PackageKey];
}

export async function GET(request: NextRequest) {
  const packageKey = request.nextUrl.searchParams.get('packageKey');
  const pkg = getPackage(packageKey);

  if (!pkg) {
    return NextResponse.json({ error: 'Invalid package.' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.answer-brief.com';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `AnswerBrief AI - ${pkg.name}`,
            description: pkg.description,
          },
          unit_amount: pkg.priceUsd * 100,
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/#packages`,
    metadata: {
      package: packageKey,
      packageName: pkg.name,
    },
  });

  return NextResponse.redirect(session.url || baseUrl);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const pkg = getPackage(body.packageKey);

  if (!pkg) {
    return NextResponse.json({ error: 'Invalid package.' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.answer-brief.com';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `AnswerBrief AI - ${pkg.name}`,
            description: pkg.description,
          },
          unit_amount: pkg.priceUsd * 100,
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/#packages`,
    metadata: {
      package: body.packageKey,
      packageName: pkg.name,
    },
  });

  return NextResponse.json({ url: session.url });
}
