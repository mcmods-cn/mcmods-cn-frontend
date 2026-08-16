"use client";

import type { MinecraftVersionConfig } from "../_lib/mod-api";
import { useI18n } from "../_lib/i18n-provider";
import { MinecraftVersionPicker, useMinecraftVersionConfig } from "./minecraft-version-picker";

export type MinecraftVersionMatchMode = "any" | "all";

type CatalogMinecraftVersionFilterProps = {
  values: string[];
  versionMode: MinecraftVersionMatchMode;
  onChange: (values: string[]) => void;
  onVersionModeChange: (mode: MinecraftVersionMatchMode) => void;
  config?: MinecraftVersionConfig;
};

/**
 * The single catalog-facing Minecraft version control. Editors keep using the
 * lower-level picker because matching modes and common-version shortcuts are
 * query semantics rather than content-editing semantics.
 */
export function CatalogMinecraftVersionFilter({
  values,
  versionMode,
  onChange,
  onVersionModeChange,
  config,
}: CatalogMinecraftVersionFilterProps) {
  const { t } = useI18n();
  const remoteConfig = useMinecraftVersionConfig();
  const effectiveConfig = config ?? remoteConfig;

  function toggleCommonVersion(version: string) {
    onChange(values.includes(version)
      ? values.filter((value) => value !== version)
      : [...values, version]);
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 rounded-lg border border-[var(--line)] p-1">
        {(["any", "all"] as const).map((mode) => (
          <button
            aria-pressed={versionMode === mode}
            className={`focus-ring min-w-0 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-bold ${versionMode === mode ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`}
            key={mode}
            type="button"
            onClick={() => onVersionModeChange(mode)}
          >
            {t(`mods.versionMode.${mode}`)}
          </button>
        ))}
      </div>

      {(effectiveConfig.commonVersions ?? []).length ? (
        <div className="grid grid-cols-1 gap-1.5">
          {(effectiveConfig.commonVersions ?? []).map((version) => {
            const selected = values.includes(version);
            return (
              <button
                aria-pressed={selected}
                className={`focus-ring w-full rounded-md border px-3 py-2 text-left text-sm font-bold ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`}
                key={version}
                type="button"
                onClick={() => toggleCommonVersion(version)}
              >
                {version}
              </button>
            );
          })}
        </div>
      ) : null}

      <MinecraftVersionPicker
        config={effectiveConfig}
        values={values}
        onChange={onChange}
      />
    </div>
  );
}
