import { buildPingPayload } from '@/lib/career-os-response-diagnostics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return Response.json(buildPingPayload(), {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
