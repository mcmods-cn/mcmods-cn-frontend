import {
  createSafeSiteLogo,
  maximumLogoBytes,
  readBoundedRequestBody,
} from "../../_lib/site-logo-image.mts";

export const runtime = "nodejs";

const apiBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export async function POST(request: Request) {
  const credentials = logoCredentials(request);
  if (!credentials || !await canWriteSiteSettings(credentials)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    return Response.json({ error: "multipart form data is required" }, { status: 415 });
  }
  const body = await readBoundedRequestBody(request).catch(() => null);
  if (!body) {
    return Response.json({ error: "logo request body is too large or invalid" }, { status: 413 });
  }
  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const form = await boundedRequest.formData().catch(() => null);
  const files = form?.getAll("file") ?? [];
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File) || file.size <= 0 || file.size > maximumLogoBytes) {
    return Response.json({ error: "invalid logo file" }, { status: 422 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeLogo = await createSafeSiteLogo(bytes).catch(() => null);
  if (!safeLogo) {
    return Response.json({ error: "logo must be a safe PNG, JPEG, WebP, or GIF image" }, { status: 422 });
  }
  try {
    const response = await fetch(new URL("/api/v1/admin/config/general/logo", apiBaseURL), {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: new Headers([...credentials, ["Content-Type", "image/webp"]]),
      body: Uint8Array.from(safeLogo).buffer,
    });
    const responseBody = await readBoundedRequestBody(response, 32 * 1024);
    const result = JSON.parse(responseBody.toString("utf8")) as { data?: { url?: unknown }; error?: unknown; code?: unknown } | null;
    if (!response.ok) {
      return Response.json({
        error: typeof result?.error === "string" ? result.error : "shared logo storage is unavailable",
        ...(typeof result?.code === "string" ? { code: result.code } : {}),
      }, { status: response.status });
    }
    const url = result?.data?.url;
    if (response.status !== 201 || typeof url !== "string" || !/^\/site-assets\/site-logo-[a-z0-9]{9}\.png$/.test(url)) {
      return Response.json({ error: "shared logo storage returned an invalid asset identity" }, { status: 502 });
    }
    return Response.json({ url }, { status: 201 });
  } catch {
    return Response.json({ error: "shared logo storage is unavailable" }, { status: 502 });
  }
}

function logoCredentials(request: Request): Headers | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (authorization) {
    return /^(Bearer|SiteLogo) \S+$/.test(authorization) ? new Headers({ Authorization: authorization }) : null;
  }
  // Same-host deployments can forward the HttpOnly session, but only for a
  // same-origin browser mutation. Split-host deployments use the scoped
  // delegation issued by the backend, never the real session JWT in JS.
  const session = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith("mcmods_session="));
  if (!session || request.headers.get("origin") !== new URL(request.url).origin) return null;
  return new Headers({ Cookie: session, Origin: request.headers.get("origin")! });
}

async function canWriteSiteSettings(credentials: Headers) {
  try {
    const response = await fetch(`${apiBaseURL}/api/v1/admin/config/general/logo-upload-access`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: credentials,
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}
