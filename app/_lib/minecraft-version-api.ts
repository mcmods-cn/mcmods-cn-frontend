import { apiRequest } from "./api";
import type { MinecraftVersionConfig } from "./mod-api";

let cachedConfig: MinecraftVersionConfig | undefined;
let pendingRequest: Promise<MinecraftVersionConfig> | undefined;

export function getCachedMinecraftVersionConfig() {
  return cachedConfig;
}

export function cacheMinecraftVersionConfig(config: MinecraftVersionConfig) {
  cachedConfig = config;
}

export function loadMinecraftVersionConfig(options: { refresh?: boolean } = {}) {
  if (!options.refresh && cachedConfig) return Promise.resolve(cachedConfig);
  if (!options.refresh && pendingRequest) return pendingRequest;

  const request = apiRequest<MinecraftVersionConfig>("/api/v1/minecraft/versions")
    .then((config) => {
      cachedConfig = config;
      return config;
    });
  pendingRequest = request;
  return request.finally(() => {
    if (pendingRequest === request) pendingRequest = undefined;
  });
}
