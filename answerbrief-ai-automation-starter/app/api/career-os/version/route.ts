import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const buildTimestamp = new Date().toISOString();

export async function GET() {
  return NextResponse.json(
    {
      buildTimestamp,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      region: process.env.VERCEL_REGION || null,
      runtime: 'nodejs',
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}
