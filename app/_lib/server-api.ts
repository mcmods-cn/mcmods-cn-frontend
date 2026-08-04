import { apiRequest } from "./api";

export type ServerCatalogSettings = {
  maxProofFiles: number;
  maxProofTotalBytes: number;
  nameMaxLength: number;
  summaryMaxLength: number;
  historyDays: number;
  reviewRequired?: boolean;
};

export type DetectedServerMod = {
  id: string;
  version?: string;
  source: "forge_status" | "configuration" | "agent" | "manual";
  confidence: "exact" | "high" | "inferred" | "declared";
};

export type ServerProbeResult = {
  address: string;
  normalizedAddress: string;
  handshakeHost: string;
  connectHost: string;
  connectPort: number;
  online: boolean;
  latencyMs: number;
  playersOnline: number;
  playersMax: number;
  motd: string;
  minecraftVersion: string;
  detectedMinecraftVersion?: string;
  protocol: number;
  iconDataUri?: string;
  modded: boolean;
  loader?: string;
  modListComplete: boolean;
  mods: DetectedServerMod[];
  detectionDiagnostic?: string;
};

export type ServerCatalogItem = {
  id: string;
  name: string;
  shortDescription: string;
  iconDataUri?: string;
  modded: boolean;
  loader?: string;
  languages: string[];
  primaryTag: ServerPrimaryTag;
  minecraftVersions: string[];
  online: boolean;
  latencyMs?: number;
  playersOnline: number;
  playersMax: number;
  lastCheckedAt?: string;
};

export type ServerPrimaryTag =
  | "survival"
  | "casual"
  | "adventure"
  | "creative"
  | "war"
  | "rpg"
  | "minigame"
  | "technology";

export type ServerLink = {
  kind: "website" | "forum" | "discord" | "qq" | "bilibili" | "other";
  label: string;
  url: string;
};

export type ServerMod = DetectedServerMod & {
  resolved: boolean;
  modPublicId?: string;
  modId?: string;
  modName?: string;
  modSlug?: string;
  iconUrl?: string;
};

export type ServerDetail = ServerCatalogItem & {
  address: string;
  bodyMarkdown: string;
  dedicatedClient: boolean;
  hasWhitelist: boolean;
  onlineMode: boolean;
  motd: string;
  minecraftVersion: string;
  protocol?: number;
  modListComplete: boolean;
  links: ServerLink[];
  mods: ServerMod[];
  canEdit: boolean;
  reviewStatus: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

export type ServerCatalogResponse = {
  items: ServerCatalogItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type ServerHistoryPoint = {
  checkedAt: string;
  online: boolean;
  latencyMs: number | null;
  playersOnline: number | null;
  playersMax: number | null;
};

export type ServerHistory = {
  range: "24h" | "7d" | "30d" | "90d";
  points: ServerHistoryPoint[];
  generatedAt: string;
};

export type CreateServerRequest = {
  address: string;
  name: string;
  shortDescription: string;
  bodyMarkdown: string;
  minecraftVersions: string[];
  dedicatedClient: boolean;
  languages: string[];
  primaryTag: ServerPrimaryTag;
  hasWhitelist: boolean;
  onlineMode: boolean;
  links: ServerLink[];
  mods: DetectedServerMod[];
  proofText: string;
  proofFileIds: string[];
};

export type CreateServerResponse = {
  id: string;
  reviewStatus: "pending" | "approved";
  published: boolean;
};

export type UpdateServerRequest = Omit<CreateServerRequest, "address" | "proofText" | "proofFileIds">;

export const serverPrimaryTags: ServerPrimaryTag[] = [
  "survival",
  "casual",
  "adventure",
  "creative",
  "war",
  "rpg",
  "minigame",
  "technology",
];

export function loadServerSettings(token?: string) {
  return apiRequest<ServerCatalogSettings>("/api/v1/servers/settings", {}, token);
}

export function probeServer(address: string, token: string) {
  return apiRequest<ServerProbeResult>(
    "/api/v1/servers/probe",
    { method: "POST", body: JSON.stringify({ address }) },
    token,
  );
}

export function submitServer(request: CreateServerRequest, token: string) {
  return apiRequest<CreateServerResponse>(
    "/api/v1/servers",
    { method: "POST", body: JSON.stringify(request) },
    token,
  );
}

export function updateServer(serverID: string, request: UpdateServerRequest, token: string) {
  return apiRequest<{ id: string }>(
    `/api/v1/servers/${encodeURIComponent(serverID)}`,
    { method: "PATCH", body: JSON.stringify(request) },
    token,
  );
}

export function suggestedMinecraftVersionFromProbe(
  probe: Pick<ServerProbeResult, "detectedMinecraftVersion" | "minecraftVersion">,
) {
  const detected = probe.detectedMinecraftVersion?.trim();
  if (detected) return detected;
  if (/\b(?:velocity|bungeecord|waterfall)\b/i.test(probe.minecraftVersion)) return "";
  return probe.minecraftVersion.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? "";
}
