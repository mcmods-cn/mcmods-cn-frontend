import { publicAPIURL } from "../../_lib/deployment-env.mts";

export const runtime = "nodejs";

const logoNamePattern = /^site-logo-([a-z0-9]{9})\.png$/;

export async function GET(_request: Request, context: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await context.params;
  const identity = logoNamePattern.exec(fileName)?.[1];
  if (!identity) return new Response(null, { status: 404 });
  try {
    const response = await fetch(publicAPIURL(`/api/v1/site/logo/${identity}`), {
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    if (response.status === 404) return new Response(null, { status: 404 });
    const location = response.headers.get("location");
    if ((response.status !== 307 && response.status !== 302) || !location) {
      return new Response(null, { status: response.status === 503 ? 503 : 502 });
    }
    const target = new URL(location);
    if ((target.protocol !== "http:" && target.protocol !== "https:") || target.username || target.password) {
      return new Response(null, { status: 502 });
    }
    // Never retain a short-lived signature as an immutable cached redirect.
    return new Response(null, { status: 307, headers: {
      Location: target.toString(), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response(null, { status: 502 });
  }
}
