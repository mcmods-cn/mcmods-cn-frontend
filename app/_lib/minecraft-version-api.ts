import { apiRequest } from "./api";
import type { MinecraftVersionConfig } from "./mod-api";

let cachedConfig: MinecraftVersionConfig | undefined;
let latestConfig: Promise<MinecraftVersionConfig> | undefined;

export function getCachedMinecraftVersionConfig() {
  return cachedConfig;
}

export function cacheMinecraftVersionConfig(config: MinecraftVersionConfig) {
  cachedConfig = config;
  latestConfig = Promise.resolve(config);
}

export function loadMinecraftVersionConfig(options: { refresh?: boolean } = {}) {
  if (!options.refresh && cachedConfig) return Promise.resolve(cachedConfig);
  if (!options.refresh && latestConfig) return latestConfig;

  const request: Promise<MinecraftVersionConfig> = apiRequest<MinecraftVersionConfig>("/api/v1/minecraft/versions")
    .then((config) => {
      if (latestConfig && latestConfig !== request) return latestConfig;
      cachedConfig = config;
      return config;
    }, (error: unknown) => {
      if (latestConfig && latestConfig !== request) return latestConfig;
      latestConfig = cachedConfig && Promise.resolve(cachedConfig);
      throw error;
    });
  latestConfig = request;
  return request;
}
