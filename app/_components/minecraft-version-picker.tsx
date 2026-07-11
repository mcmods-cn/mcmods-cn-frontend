"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { MinecraftVersionConfig } from "../_lib/mod-api";
import { useI18n } from "../_lib/i18n-provider";

type MinecraftVersionPickerProps = {
  values: string[];
  onChange: (values: string[]) => void;
  config?: MinecraftVersionConfig;
  optionCodes?: string[];
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  emptyLabelKey?: string;
};

const emptyConfig: MinecraftVersionConfig = { versions: [], loaders: [] };

export function MinecraftVersionPicker({
  values,
  onChange,
  config,
  optionCodes,
  multiple = true,
  disabled = false,
  className = "",
  emptyLabelKey = "minecraftVersionPicker.select",
}: MinecraftVersionPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [remoteConfig, setRemoteConfig] = useState<MinecraftVersionConfig>(emptyConfig);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showAprilFools, setShowAprilFools] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (config) return;
    let cancelled = false;
    apiRequest<MinecraftVersionConfig>("/api/v1/minecraft/versions")
      .then((result) => { if (!cancelled) setRemoteConfig(result); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [config]);

  const effectiveConfig = config ?? remoteConfig;

  const available = useMemo(() => {
    const allowed = optionCodes ? new Set(optionCodes) : null;
    const configured = effectiveConfig.versions.filter((version) => !allowed || allowed.has(version.code));
    const known = new Set(configured.map((version) => version.code));
    const missing = [...new Set([...(optionCodes ?? []), ...values])]
      .filter((code) => code && !known.has(code))
      .map((code) => ({ code, type: "release" as const }));
    return [...configured, ...missing];
  }, [effectiveConfig.versions, optionCodes, values]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const grouped = new Map<string, typeof available>();
    for (const version of available) {
      if (version.type === "snapshot" && !showSnapshots) continue;
      if (version.type === "april_fools" && !showAprilFools) continue;
      if (query && !version.code.toLowerCase().includes(query)) continue;
      const key = versionGroup(version.code, version.type);
      const items = grouped.get(key) ?? [];
      items.push(version);
      grouped.set(key, items);
    }
    return [...grouped.entries()];
  }, [available, search, showAprilFools, showSnapshots]);

  function choose(code: string) {
    if (!multiple) {
      onChange([code]);
      setOpen(false);
      return;
    }
    onChange(values.includes(code) ? values.filter((value) => value !== code) : [...values, code]);
  }

  const summary = values.length ? values.join(", ") : t(emptyLabelKey);

  return (
    <>
      <button className={`field focus-ring flex min-h-11 items-center justify-between gap-3 text-left ${className}`} disabled={disabled} type="button" onClick={() => setOpen(true)}>
        <span className="min-w-0 truncate">{summary}</span>
        <span aria-hidden="true" className="shrink-0 text-[var(--muted)]">...</span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-3 sm:p-6" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="surface flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--line)] shadow-2xl" role="dialog" aria-modal="true" aria-label={t("minecraftVersionPicker.title")} onMouseDown={(event) => event.stopPropagation()}>
            <header className="border-b border-[var(--line)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">{t("minecraftVersionPicker.title")}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{t(multiple ? "minecraftVersionPicker.multipleHint" : "minecraftVersionPicker.singleHint")}</p>
                </div>
                <button className="button-secondary focus-ring" type="button" onClick={() => setOpen(false)}>{t("common.close")}</button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input className="field" value={search} placeholder={t("minecraftVersionPicker.search")} onChange={(event) => setSearch(event.target.value)} />
                <button className={`button-secondary focus-ring ${showSnapshots ? "border-[var(--accent)] text-[var(--accent)]" : ""}`} type="button" onClick={() => setShowSnapshots((current) => !current)}>{t("minecraftVersionPicker.showSnapshots")}</button>
                <button className={`button-secondary focus-ring ${showAprilFools ? "border-[var(--accent)] text-[var(--accent)]" : ""}`} type="button" onClick={() => setShowAprilFools((current) => !current)}>{t("minecraftVersionPicker.showAprilFools")}</button>
              </div>
              {multiple && values.length ? <div className="mt-3 flex flex-wrap gap-2">{values.map((value) => <button key={value} className="rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-2.5 py-1 text-sm font-bold" type="button" onClick={() => choose(value)}>{value} x</button>)}</div> : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-6">
                {groups.map(([group, versions]) => (
                  <section key={group}>
                    <h3 className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--panel)] py-2 text-sm font-black text-[var(--muted)]">{groupLabel(group, t)}</h3>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {versions.map((version) => {
                        const selected = values.includes(version.code);
                        return <button key={version.code} className={`focus-ring min-h-11 rounded-md border px-3 py-2 text-left text-sm font-bold ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`} type="button" onClick={() => choose(version.code)}><span className="block truncate">{version.code}</span><small className="mt-0.5 block text-[var(--muted)]">{t(`admin.minecraftVersions.types.${version.type}`)}</small></button>;
                      })}
                    </div>
                  </section>
                ))}
                {groups.length === 0 ? <p className="py-12 text-center font-bold text-[var(--muted)]">{t("minecraftVersionPicker.empty")}</p> : null}
              </div>
            </div>
            {multiple ? <footer className="flex items-center justify-between gap-3 border-t border-[var(--line)] p-4"><span className="text-sm font-bold text-[var(--muted)]">{t("minecraftVersionPicker.selected", { count: values.length })}</span><button className="button-primary focus-ring" type="button" onClick={() => setOpen(false)}>{t("common.confirm")}</button></footer> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function versionGroup(code: string, type: MinecraftVersionConfig["versions"][number]["type"]) {
  if (type === "april_fools") return "april_fools";
  if (type === "snapshot") {
    const match = code.match(/^(\d{2})w/i);
    return match ? `snapshot:20${match[1]}` : "snapshot";
  }
  if (type === "legacy") return "legacy";
  const release = code.match(/^(\d+\.\d+)/);
  return release ? `release:${release[1]}` : "other";
}

function groupLabel(group: string, t: (key: string, params?: Record<string, string | number>) => string) {
  if (group === "april_fools") return t("minecraftVersionPicker.aprilFoolsGroup");
  if (group === "legacy") return t("minecraftVersionPicker.legacyGroup");
  if (group === "snapshot") return t("minecraftVersionPicker.snapshotGroup");
  if (group === "other") return t("minecraftVersionPicker.otherGroup");
  if (group.startsWith("snapshot:")) return t("minecraftVersionPicker.snapshotYearGroup", { year: group.slice("snapshot:".length) });
  return t("minecraftVersionPicker.releaseGroup", { version: group.slice("release:".length) });
}
