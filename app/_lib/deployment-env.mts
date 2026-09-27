export type PublicDeploymentInput = {
  apiBaseURL?: string;
  siteURL?: string;
  yggdrasilAPIRoot?: string;
};

export type PublicDeploymentConfig = {
  apiBaseURL: string;
  siteURL: string;
  yggdrasilAPIRoot?: string;
};

type PublicURLPolicy = {
  originOnly?: boolean;
  trailingSlash?: "remove" | "require";
};

export function resolvePublicDeploymentConfig(
  input: PublicDeploymentInput,
  nodeEnvironment = "development",
): PublicDeploymentConfig {
  const production = nodeEnvironment === "production";
  const apiBaseURL = resolveRequiredPublicURL(
    "NEXT_PUBLIC_API_BASE_URL",
    input.apiBaseURL,
    production,
    "http://localhost:8080",
    { trailingSlash: "remove" },
  );
  const siteURL = resolveRequiredPublicURL(
    "NEXT_PUBLIC_SITE_URL",
    input.siteURL,
    production,
    "http://localhost:3000",
    { originOnly: true, trailingSlash: "remove" },
  );
  const yggdrasilAPIRoot = resolveOptionalPublicURL(
    "NEXT_PUBLIC_YGGDRASIL_API_ROOT",
    input.yggdrasilAPIRoot,
    production,
    { trailingSlash: "require" },
  );

  return { apiBaseURL, siteURL, yggdrasilAPIRoot };
}

export function resolvePublicSiteURL(value?: string, nodeEnvironment = "development") {
  return resolveRequiredPublicURL(
    "NEXT_PUBLIC_SITE_URL",
    value,
    nodeEnvironment === "production",
    "http://localhost:3000",
    { originOnly: true, trailingSlash: "remove" },
  );
}

function resolveRequiredPublicURL(
  name: string,
  value: string | undefined,
  production: boolean,
  developmentDefault: string,
  policy: PublicURLPolicy,
) {
  const configured = value?.trim();
  if (!configured) {
    if (production) throw new Error(`${name} is required for production builds`);
    return parsePublicURL(name, developmentDefault, false, policy);
  }
  return parsePublicURL(name, configured, production, policy);
}

function resolveOptionalPublicURL(
  name: string,
  value: string | undefined,
  production: boolean,
  policy: PublicURLPolicy,
) {
  const configured = value?.trim();
  return configured ? parsePublicURL(name, configured, production, policy) : undefined;
}

function parsePublicURL(name: string, value: string, production: boolean, policy: PublicURLPolicy) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
  if (production && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain a query string or fragment`);
  }
  if (policy.originOnly && parsed.pathname !== "/") {
    throw new Error(`${name} must contain only an origin`);
  }

  let normalized = parsed.toString();
  if (policy.trailingSlash === "remove") normalized = normalized.replace(/\/$/, "");
  if (policy.trailingSlash === "require" && !normalized.endsWith("/")) normalized += "/";
  return normalized;
}
