export type ContentSecurityPolicyInput = {
  nonce: string;
  production: boolean;
  apiBaseURL?: string;
  connectOrigins?: string;
  imageOrigins?: string;
  mediaOrigins?: string;
  fontOrigins?: string;
};

const builtInImageOrigins = [
  "https://oss.mcmods.cn",
  "https://avatars.githubusercontent.com",
  "https://raw.githubusercontent.com",
  "https://user-images.githubusercontent.com",
  "https://cdn.modrinth.com",
  "https://media.forgecdn.net",
  "https://mediafilez.forgecdn.net",
  "https://textures.minecraft.net",
];

const builtInConnectOrigins = ["https://challenges.cloudflare.com"];
const frameOrigins = [
  "https://challenges.cloudflare.com",
  "https://embed.diagrams.net",
  "https://www.geogebra.org",
  "https://player.bilibili.com",
  "https://www.youtube-nocookie.com",
];

export function buildContentSecurityPolicy(input: ContentSecurityPolicyInput) {
  if (!/^[A-Za-z0-9+/_=-]+$/.test(input.nonce)) {
    throw new Error("CSP nonce contains unsupported characters");
  }
  const apiOrigin = input.apiBaseURL
    ? normalizeHTTPOrigin("NEXT_PUBLIC_API_BASE_URL", input.apiBaseURL, input.production, false)
    : "";
  const configuredConnect = parseOriginList("NEXT_PUBLIC_CSP_CONNECT_ORIGINS", input.connectOrigins, input.production);
  const configuredImages = parseOriginList("NEXT_PUBLIC_CSP_IMAGE_ORIGINS", input.imageOrigins, input.production);
  const configuredMedia = parseOriginList("NEXT_PUBLIC_CSP_MEDIA_ORIGINS", input.mediaOrigins, input.production);
  const configuredFonts = parseOriginList("NEXT_PUBLIC_CSP_FONT_ORIGINS", input.fontOrigins, input.production);

  const connectSources = uniqueSources(["'self'", apiOrigin, ...builtInConnectOrigins, ...configuredConnect]);
  const imageSources = uniqueSources(["'self'", "data:", "blob:", apiOrigin, ...builtInImageOrigins, ...configuredImages]);
  const mediaSources = uniqueSources(["'self'", "blob:", ...configuredMedia]);
  const fontSources = uniqueSources(["'self'", "data:", ...configuredFonts]);
  if (!input.production) {
    connectSources.push("http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*");
    imageSources.push("http://localhost:*", "http://127.0.0.1:*");
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'${input.production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    `font-src ${fontSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    `media-src ${mediaSources.join(" ")}`,
    "worker-src 'self' blob:",
    `frame-src ${frameOrigins.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(input.production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function parseOriginList(name: string, value: string | undefined, production: boolean) {
  if (!value?.trim()) return [];
  return uniqueSources(value.split(",").map((item) => normalizeHTTPOrigin(name, item.trim(), production, true)));
}

function normalizeHTTPOrigin(name: string, value: string, production: boolean, originOnly: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} entries must be absolute HTTPS origins`);
  }
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && (production || parsed.protocol !== "http:" || !loopback)) {
    throw new Error(`${name} entries must use HTTPS (loopback HTTP is development-only)`);
  }
  if (parsed.hostname.includes("*") || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} entries must be credential-free origins without query strings or fragments`);
  }
  if (originOnly && parsed.pathname !== "/") {
    throw new Error(`${name} entries must contain only an origin`);
  }
  return parsed.origin;
}

function uniqueSources(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
