import { OAuthProviderStart } from "../../_components/oauth-provider-start";
import { oauthProviderRedirect } from "../../_lib/oauth-navigation.mts";

export default async function ProviderLoginPage({ searchParams }: { searchParams: Promise<{ provider?: string | string[]; next?: string | string[] }> }) {
  const parameters = await searchParams;
  const apiBaseURL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
  return <OAuthProviderStart target={oauthProviderRedirect(apiBaseURL, parameters.provider, parameters.next)} />;
}
