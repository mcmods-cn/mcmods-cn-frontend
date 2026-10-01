export const runtime = "nodejs";

const logoNamePattern = /^site-logo-([a-z0-9]{9})\.png$/;
const apiBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export async function GET(_request: Request, context: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await context.params;
  const identity = logoNamePattern.exec(fileName)?.[1];
  if (!identity) return new Response(null, { status: 404 });
  try {
    const response = await fetch(new URL(`/api/v1/site/logo/${identity}`, apiBaseURL), {
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
