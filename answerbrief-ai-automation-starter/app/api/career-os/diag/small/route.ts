import {
  buildCareerOsStatusBundle,
  buildSmallStatusPayload,
  createCareerOsJsonResponse,
  serializeCareerOsPayload,
} from '@/lib/career-os-response-diagnostics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const bundle = await buildCareerOsStatusBundle();
  const serialized = serializeCareerOsPayload(buildSmallStatusPayload(bundle), bundle.diagnostics);
  return createCareerOsJsonResponse(serialized.serializedPayload, serialized.diagnostics);
}
