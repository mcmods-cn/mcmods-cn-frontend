export const dynamic = "force-static";

export function GET() {
  // Public deployment configuration, compiled from the same value as api.ts.
  // A client cannot grant the shared worker a different trusted API origin.
  return Response.json({ apiBaseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080" });
}
