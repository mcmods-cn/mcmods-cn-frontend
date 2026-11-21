import { oauthProviders } from "./oauth-navigation.mts";

export type OAuthProviderConfig = {
  enabled: boolean;
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
};

export type OAuthConfig = { providers: Record<string, OAuthProviderConfig> };

// The admin API returns all supported providers, including unconfigured ones.
export function hasCompleteOAuthConfig(value: OAuthConfig | undefined) {
  return oauthProviders.every(({ key }) => {
    const provider = value?.providers?.[key];
    return provider && typeof provider.enabled === "boolean" && typeof provider.clientId === "string"
      && typeof provider.redirectUri === "string" && typeof provider.hasClientSecret === "boolean";
  });
}
