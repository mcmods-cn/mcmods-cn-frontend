"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MinecraftVersionConfig } from "../_lib/mod-api";
import { getCachedMinecraftVersionConfig, loadMinecraftVersionConfig } from "../_lib/minecraft-version-api";
import { useI18n } from "../_lib/i18n-provider";

type MinecraftVersionPickerProps = {
  values: string[];
  onChange: (values: string[]) => void;
  config?: MinecraftVersionConfig;
  optionCodes?: string[];
  disabledCodes?: string[];
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  emptyLabelKey?: string;
};

const emptyConfig: MinecraftVersionConfig = { versions: [], loaders: [] };

export function useMinecraftVersionConfig() {
  const [config, setConfig] = useState<MinecraftVersionConfig>(() => getCachedMinecraftVersionConfig() ?? emptyConfig);
  useEffect(() => {
    let cancelled = false;
    loadMinecraftVersionConfig()
      .then((result) => { if (!cancelled) setConfig(result); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return config;
}

export function MinecraftVersionPicker({
  values,
  onChange,
  config,
  optionCodes,
  disabledCodes = [],
  multiple = true,
  disabled = false,
  className = "",
  emptyLabelKey = "minecraftVersionPicker.select",
}: MinecraftVersionPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const remoteConfig = useMinecraftVersionConfig();
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showAprilFools, setShowAprilFools] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingValues, setPendingValues] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const effectiveConfig = config ?? remoteConfig;
  const disabledSet = useMemo(() => new Set(disabledCodes), [disabledCodes]);

  const available = useMemo(() => {
    const allowed = optionCodes ? new Set(optionCodes) : null;
    const configured = effectiveConfig.versions.filter((version) => !allowed || allowed.has(version.code));
    const known = new Set(configured.map((version) => version.code));
    const missing = [...new Set([...(optionCodes ?? []), ...values])]
      .filter((code) => code && !known.has(code))
      .map((code) => ({ code, type: "release" as const }));
    return [...configured, ...missing];
  }, [effectiveConfig.versions, optionCodes, values]);

  const selectableGroups = useMemo(() => {
    const grouped = new Map<string, typeof available>();
    for (const version of available) {
      if (["snapshot", "pre_release", "release_candidate"].includes(version.type) && !showSnapshots) continue;
      if (version.type === "april_fools" && !showAprilFools) continue;
      const key = versionGroup(version.code, version.type);
      const items = grouped.get(key) ?? [];
      items.push(version);
      grouped.set(key, items);
    }
    return [...grouped.entries()];
  }, [available, showAprilFools, showSnapshots]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return selectableGroups;
    return selectableGroups
      .map(([key, versions]) => [key, versions.filter((version) => version.code.toLowerCase().includes(query))] as const)
      .filter(([, versions]) => versions.length > 0);
  }, [search, selectableGroups]);

  function choose(code: string) {
    if (disabledSet.has(code)) return;
    if (!multiple) {
      onChange([code]);
      setOpen(false);
      return;
    }
    setPendingValues((current) => current.includes(code)
      ? current.filter((value) => value !== code)
      : [...current, code]);
  }

  function chooseGroup(codes: readonly string[]) {
    if (!multiple) return;
    setPendingValues((current) => {
      const selected = new Set(current);
      const allSelected = codes.every((code) => selected.has(code));
      for (const code of codes) {
        if (allSelected) selected.delete(code);
        else selected.add(code);
      }
      return available.map((version) => version.code).filter((code) => selected.has(code));
    });
  }

  function openPicker() {
    setPendingValues(values);
    setOpen(true);
  }

  function confirmSelection() {
    onChange(pendingValues);
    setOpen(false);
  }

  const compressedValues = compressMinecraftVersionSelection(values, selectableGroups);
  const fullSummary = values.length ? compressedValues.map((item) => item.label).join(" / ") : t(emptyLabelKey);
  const summary = values.length ? summarizeMinecraftVersions(compressedValues.map((item) => item.label)) : fullSummary;
  const selectedValues = multiple ? pendingValues : values;
  const compressedSelected = compressMinecraftVersionSelection(selectedValues, selectableGroups);

  return (
    <>
      <button className={`field focus-ring flex min-h-11 min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden text-left ${className}`} disabled={disabled} title={fullSummary} type="button" onClick={openPicker}>
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span aria-hidden="true" className="shrink-0 text-[var(--muted)]">...</span>
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[100] isolate grid place-items-center overflow-hidden bg-black/50 p-3 sm:p-6" role="presentation" onMouseDown={() => setOpen(false)}>
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
              {multiple && selectedValues.length ? <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto overscroll-contain pr-1">{compressedSelected.map((item) => <button key={`${item.group}:${item.label}`} className="rounded-md border border-[var(--line)] bg-[var(--panel-subtle)] px-2.5 py-1 text-sm font-bold" type="button" onClick={() => item.codes.length > 1 ? chooseGroup(item.codes) : choose(item.codes[0])}>{item.label} x</button>)}</div> : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-6">
                {groups.map(([group, versions]) => (
                  <section key={group}>
                    <div className="sticky top-0 z-10 flex min-h-11 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] py-2 text-sm font-black text-[var(--muted)]">
                      {multiple ? <VersionGroupCheckbox
                        codes={(selectableGroups.find(([key]) => key === group)?.[1] ?? versions).map((version) => version.code)}
                        toggleCodes={(selectableGroups.find(([key]) => key === group)?.[1] ?? versions).map((version) => version.code).filter((code) => !disabledSet.has(code))}
                        label={groupLabel(group, t)}
                        selectedValues={selectedValues}
                        onToggle={chooseGroup}
                      /> : <span>{groupLabel(group, t)}</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {versions.map((version) => {
                        const selected = selectedValues.includes(version.code);
                        const optionDisabled = disabledSet.has(version.code);
                        return <button key={version.code} className={`focus-ring min-h-11 rounded-md border px-3 py-2 text-left text-sm font-bold ${optionDisabled ? "cursor-not-allowed opacity-50" : selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`} disabled={optionDisabled} type="button" onClick={() => choose(version.code)}><span className="block truncate">{version.code}</span><small className="mt-0.5 block text-[var(--muted)]">{t(`admin.minecraftVersions.types.${version.type}`)}</small></button>;
                      })}
                    </div>
                  </section>
                ))}
                {groups.length === 0 ? <p className="py-12 text-center font-bold text-[var(--muted)]">{t("minecraftVersionPicker.empty")}</p> : null}
              </div>
            </div>
            {multiple ? <footer className="flex items-center justify-between gap-3 border-t border-[var(--line)] p-4"><span className="text-sm font-bold text-[var(--muted)]">{t("minecraftVersionPicker.selected", { count: selectedValues.length })}</span><button className="button-primary focus-ring" type="button" onClick={confirmSelection}>{t("common.confirm")}</button></footer> : null}
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export function summarizeMinecraftVersions(values: readonly string[], visibleCount = 3) {
  if (values.length <= visibleCount) return values.join(", ");
  return `${values.slice(0, visibleCount).join(", ")} +${values.length - visibleCount}`;
}

export type CompressedMinecraftVersionSelection = {
  group: string;
  label: string;
  codes: string[];
};

export function compressMinecraftVersionSelection(
  values: readonly string[],
  groups: readonly (readonly [string, readonly { code: string }[]])[],
): CompressedMinecraftVersionSelection[] {
  const selected = new Set(values);
  const consumed = new Set<string>();
  const result: CompressedMinecraftVersionSelection[] = [];
  for (const [group, versions] of groups) {
    const codes = versions.map((version) => version.code);
    if (codes.length > 1 && codes.every((code) => selected.has(code))) {
      codes.forEach((code) => consumed.add(code));
      result.push({ group, label: publicVersionGroupLabel(group), codes });
    }
  }
  for (const value of values) {
    if (!consumed.has(value)) result.push({ group: `version:${value}`, label: value, codes: [value] });
  }
  return result;
}

function VersionGroupCheckbox({
  codes,
  toggleCodes,
  label,
  selectedValues,
  onToggle,
}: {
  codes: readonly string[];
  toggleCodes: readonly string[];
  label: string;
  selectedValues: readonly string[];
  onToggle: (codes: readonly string[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const selected = new Set(selectedValues);
  const selectedCount = codes.filter((code) => selected.has(code)).length;
  const checked = codes.length > 0 && selectedCount === codes.length;
  const indeterminate = selectedCount > 0 && selectedCount < codes.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <label className="focus-within:ring-2 focus-within:ring-[var(--accent)] flex cursor-pointer items-center gap-2 rounded-sm px-1">
    <input
      ref={ref}
      aria-checked={indeterminate ? "mixed" : checked}
      checked={checked}
      className="size-4 accent-[var(--accent)]"
      disabled={toggleCodes.length === 0}
      type="checkbox"
      onChange={() => onToggle(toggleCodes)}
    />
    <span>{label}</span>
  </label>;
}

function versionGroup(code: string, type: MinecraftVersionConfig["versions"][number]["type"]) {
  if (type === "april_fools") return "april_fools";
  if (type === "pre_release") return "pre_release";
  if (type === "release_candidate") return "release_candidate";
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
  if (group === "pre_release") return t("minecraftVersionPicker.preReleaseGroup");
  if (group === "release_candidate") return t("minecraftVersionPicker.releaseCandidateGroup");
  if (group === "legacy") return t("minecraftVersionPicker.legacyGroup");
  if (group === "snapshot") return t("minecraftVersionPicker.snapshotGroup");
  if (group === "other") return t("minecraftVersionPicker.otherGroup");
  if (group.startsWith("snapshot:")) return t("minecraftVersionPicker.snapshotYearGroup", { year: group.slice("snapshot:".length) });
  return t("minecraftVersionPicker.releaseGroup", { version: group.slice("release:".length) });
}

function publicVersionGroupLabel(group: string) {
  if (group.startsWith("release:")) return `${group.slice("release:".length)}.X`;
  if (group.startsWith("snapshot:")) return `${group.slice("snapshot:".length)} 快照`;
  const labels: Record<string, string> = {
    april_fools: "愚人节版本",
    pre_release: "预发布版",
    release_candidate: "候选发布版",
    legacy: "旧版",
    snapshot: "快照版",
    other: "其他版本",
  };
  return labels[group] ?? group;
}
