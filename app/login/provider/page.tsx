import { OAuthProviderStart } from "../../_components/oauth-provider-start";
import { oauthProviderRedirect } from "../../_lib/oauth-navigation.mts";
import { resolvePublicAPIBaseURL } from "../../_lib/deployment-env.mts";

export default async function ProviderLoginPage({ searchParams }: { searchParams: Promise<{ provider?: string | string[]; next?: string | string[] }> }) {
  const parameters = await searchParams;
  const apiBaseURL = resolvePublicAPIBaseURL(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV);
  return <OAuthProviderStart target={oauthProviderRedirect(apiBaseURL, parameters.provider, parameters.next)} />;
}
