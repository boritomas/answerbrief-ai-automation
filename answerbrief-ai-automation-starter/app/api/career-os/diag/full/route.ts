import {
  buildCareerOsStatusBundle,
  createCareerOsJsonResponse,
  serializeCareerOsPayload,
} from '@/lib/career-os-response-diagnostics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const bundle = await buildCareerOsStatusBundle();
  const serialized = serializeCareerOsPayload(bundle.payload, bundle.diagnostics);
  return createCareerOsJsonResponse(serialized.serializedPayload, serialized.diagnostics);
}
