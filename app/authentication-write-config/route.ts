import { resolvePublicAPIBaseURL } from "../_lib/deployment-env.mts";

export const dynamic = "force-static";

export function GET() {
  // Public deployment configuration, compiled from the same value as api.ts.
  // A client cannot grant the shared worker a different trusted API origin.
  return Response.json({ apiBaseURL: resolvePublicAPIBaseURL(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV) });
}
