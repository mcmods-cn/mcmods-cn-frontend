import { apiRequest } from "./api";

export type AntiAbuseFormToken = {
  token: string;
  fieldName: string;
  expiresAt: string;
};

export type AntiAbuseChallenge = {
  id: string;
  provider: "proof" | "turnstile";
  prompt?: string;
  siteKey?: string;
  expiresAt: string;
};

export function loadAntiAbuseFormToken(action: string, object: string, token: string) {
  const query = new URLSearchParams({ action, object });
  return apiRequest<AntiAbuseFormToken>(`/api/v1/anti-abuse/form-token?${query}`, {}, token);
}

export function challengeFromDetails(details: unknown): AntiAbuseChallenge | undefined {
  if (!details || typeof details !== "object" || !("challenge" in details)) return undefined;
  const challenge = (details as { challenge?: unknown }).challenge;
  if (!challenge || typeof challenge !== "object" || !("id" in challenge) || !("provider" in challenge)) return undefined;
  return challenge as AntiAbuseChallenge;
}
