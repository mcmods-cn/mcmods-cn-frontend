"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { namespaceFromIdentifier } from "../../_lib/catalog-resource-identifiers";
import type { CatalogResourceRef } from "../../_lib/editor-types";
import {
  isLootSetCountFunction,
  lootEntryFamily,
  lootEntryIdentifier,
  lootSetCountFunction,
  lootTablePools,
  type LootEntryFamily,
  type LootTableRecord,
} from "../../_lib/loot-table-model";
import { modContentResourceAssetURL } from "../../_lib/mod-content-api";
import { modExportAssetURL } from "../../_lib/mod-export-api";
import { loadTagPickerPage } from "../../_lib/resource-picker-loaders";
import { useI18n } from "../../_lib/i18n-provider";
import { ResourcePickerDialog } from "./resource-picker-dialog";
import { CatalogResourceIcon } from "./selected-resource-list";

export function LootTableVisualEditor({
  definition,
  token,
  onChange,
  onValidityChange,
}: {
  definition: LootTableRecord;
  token: string;
  onChange: (definition: LootTableRecord) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const { t } = useI18n();
  const pools = lootTablePools(definition);
  const sources = record(definition.resourceSources);
  const [invalidEditors, setInvalidEditors] = useState<Set<string>>(() => new Set());
  const reportEditorValidity = useCallback((editorID: string, valid: boolean) => {
    setInvalidEditors((current) => {
      const next = new Set(current);
      if (valid) next.delete(editorID);
      else next.add(editorID);
      return next;
    });
  }, []);

  useEffect(() => onValidityChange(invalidEditors.size === 0), [invalidEditors, onValidityChange]);
  useEffect(() => () => onValidityChange(true), [onValidityChange]);

  function setField(key: string, value: unknown) {
    const next = { ...definition };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    onChange(next);
  }

  function updatePools(nextPools: LootTableRecord[]) {
    onChange({ ...definition, pools: nextPools, definitionAvailable: true });
  }

  return <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    <header className="border-b border-[var(--line)] bg-[var(--panel-subtle)] p-5">
      <h2 className="text-xl font-black">{t("resourceEditor.lootEditor.title")}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("resourceEditor.lootEditor.description")}</p>
    </header>

    <div className="grid gap-4 border-b border-[var(--line)] p-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">
        <span>{t("resourceEditor.lootEditor.tableType")}</span>
        <input className="field font-mono" list="loot-table-types" value={stringValue(definition.tableType ?? definition.type)} onChange={(event) => setField("tableType", event.target.value.trim() || undefined)} />
        <datalist id="loot-table-types">
          {['minecraft:block', 'minecraft:chest', 'minecraft:entity', 'minecraft:fishing', 'minecraft:gift', 'minecraft:advancement_reward', 'minecraft:barter'].map((value) => <option key={value} value={value} />)}
        </datalist>
      </label>
      <label className="grid gap-2 text-sm font-bold">
        <span>{t("resourceEditor.lootEditor.randomSequence")}</span>
        <input className="field font-mono" placeholder="namespace:path" value={stringValue(definition.randomSequence ?? definition.random_sequence)} onChange={(event) => setField("randomSequence", event.target.value.trim() || undefined)} />
      </label>
    </div>

    <div className="space-y-4 p-5">
      {pools.map((pool, poolIndex) => <LootPoolEditor
        key={`pool:${poolIndex}`}
        pool={pool}
        poolIndex={poolIndex}
        sources={sources}
        token={token}
        onRemove={() => updatePools(pools.filter((_, index) => index !== poolIndex))}
        onMove={(direction) => updatePools(moveItem(pools, poolIndex, direction))}
        onUpdate={(nextPool) => updatePools(replaceItem(pools, poolIndex, nextPool))}
        onValidityChange={reportEditorValidity}
      />)}
      {!pools.length ? <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-[var(--line)] text-sm font-bold text-[var(--muted)]">{t("resourceEditor.lootEditor.noPools")}</div> : null}
      <button className="button-primary focus-ring" type="button" onClick={() => updatePools([...pools, defaultLootPool()])}>+ {t("resourceEditor.lootEditor.addPool")}</button>
    </div>
    <details className="border-t border-[var(--line)] p-5">
      <summary className="cursor-pointer text-sm font-black">{t("resourceEditor.lootEditor.advancedTable")}</summary>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("resourceEditor.lootEditor.advancedHint")}</p>
      <AdvancedJSONEditor
        editorID="loot-table:json"
        value={definition}
        onChange={(value) => onChange(record(value))}
        onValidityChange={reportEditorValidity}
      />
    </details>
  </section>;
}

function LootPoolEditor({
  pool,
  poolIndex,
  sources,
  token,
  onRemove,
  onMove,
  onUpdate,
  onValidityChange,
}: {
  pool: LootTableRecord;
  poolIndex: number;
  sources: LootTableRecord;
  token: string;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onUpdate: (pool: LootTableRecord) => void;
  onValidityChange: (editorID: string, valid: boolean) => void;
}) {
  const { t } = useI18n();
  const entries = arrayRecords(pool.entries);
  const updateEntries = (nextEntries: LootTableRecord[]) => onUpdate({ ...pool, entries: nextEntries });
  return <article className="overflow-hidden rounded-lg border border-[var(--line)]">
    <header className="flex flex-wrap items-center justify-between gap-3 bg-[var(--panel-subtle)] px-4 py-3">
      <div>
        <h3 className="font-black">{t("resourceEditor.lootEditor.pool", { number: poolIndex + 1 })}</h3>
        <span className="text-xs font-bold text-[var(--muted)]">{t("resourceEditor.lootEditor.entryCount", { count: entries.length })}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button aria-label={t("resourceEditor.lootEditor.moveUp")} className="button-secondary focus-ring px-3" disabled={poolIndex === 0} type="button" onClick={() => onMove(-1)}>↑</button>
        <button aria-label={t("resourceEditor.lootEditor.moveDown")} className="button-secondary focus-ring px-3" type="button" onClick={() => onMove(1)}>↓</button>
        <button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={onRemove}>{t("common.delete")}</button>
      </div>
    </header>
    <div className="grid gap-4 border-t border-[var(--line)] p-4 md:grid-cols-2">
      <LootNumberProviderEditor editorID={`pool:${poolIndex}:rolls`} label={t("resourceEditor.lootEditor.rolls")} value={pool.rolls ?? 1} onChange={(value) => onUpdate({ ...pool, rolls: value })} onValidityChange={onValidityChange} />
      <LootNumberProviderEditor editorID={`pool:${poolIndex}:bonus-rolls`} label={t("resourceEditor.lootEditor.bonusRolls")} value={pool.bonus_rolls ?? 0} onChange={(value) => onUpdate({ ...pool, bonus_rolls: value })} onValidityChange={onValidityChange} />
    </div>
    <div className="space-y-3 border-t border-[var(--line)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-black">{t("resourceEditor.lootEditor.entries")}</h4>
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary focus-ring" type="button" onClick={() => updateEntries([...entries, defaultLootEntry("item")])}>+ {t("resourceEditor.lootEditor.addEntry")}</button>
          <button className="button-secondary focus-ring" type="button" onClick={() => updateEntries([...entries, defaultLootEntry("alternatives")])}>+ {t("resourceEditor.lootEditor.addGroup")}</button>
        </div>
      </div>
      {entries.map((entry, entryIndex) => <LootEntryEditor
        depth={0}
        editorID={`pool:${poolIndex}:entry:${entryIndex}`}
        entry={entry}
        entryIndex={entryIndex}
        key={`entry:${entryIndex}:${stringValue(entry.type)}`}
        sources={sources}
        token={token}
        onRemove={() => updateEntries(entries.filter((_, index) => index !== entryIndex))}
        onMove={(direction) => updateEntries(moveItem(entries, entryIndex, direction))}
        onUpdate={(nextEntry) => updateEntries(replaceItem(entries, entryIndex, nextEntry))}
        onValidityChange={onValidityChange}
      />)}
      {!entries.length ? <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-center text-sm text-[var(--muted)]">{t("resourceEditor.lootEditor.noEntries")}</p> : null}
    </div>
    <details className="border-t border-[var(--line)] p-4">
      <summary className="cursor-pointer text-sm font-black">{t("resourceEditor.lootEditor.advancedPool")}</summary>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("resourceEditor.lootEditor.advancedHint")}</p>
      <AdvancedJSONEditor editorID={`pool:${poolIndex}:json`} value={pool} onChange={(value) => onUpdate(record(value))} onValidityChange={onValidityChange} />
    </details>
  </article>;
}

function LootEntryEditor({
  depth,
  editorID,
  entry,
  entryIndex,
  sources,
  token,
  onRemove,
  onMove,
  onUpdate,
  onValidityChange,
}: {
  depth: number;
  editorID: string;
  entry: LootTableRecord;
  entryIndex: number;
  sources: LootTableRecord;
  token: string;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onUpdate: (entry: LootTableRecord) => void;
  onValidityChange: (editorID: string, valid: boolean) => void;
}) {
  const { t } = useI18n();
  const family = lootEntryFamily(entry);
  const children = arrayRecords(entry.children);
  const quantityFunction = lootSetCountFunction(entry);
  const pickerKind = family === "item" ? "minecraft.item" : family === "loot_table" ? "minecraft.loot_table" : "tag";
  const identifier = lootEntryIdentifier(entry, family);

  function changeFamily(nextFamily: LootEntryFamily) {
    onUpdate(changeLootEntryFamily(entry, nextFamily));
  }

  function updateQuantity(value: unknown) {
    const functions = arrayRecords(entry.functions);
    const index = functions.findIndex(isLootSetCountFunction);
    const nextFunction = { ...(index >= 0 ? functions[index] : {}), function: "minecraft:set_count", count: value, add: false };
    onUpdate({ ...entry, functions: index >= 0 ? replaceItem(functions, index, nextFunction) : [...functions, nextFunction] });
  }

  function clearQuantity() {
    const functions = arrayRecords(entry.functions).filter((item) => !isLootSetCountFunction(item));
    const next = { ...entry };
    if (functions.length) next.functions = functions;
    else delete next.functions;
    onUpdate(next);
  }

  function updateChildren(nextChildren: LootTableRecord[]) {
    onUpdate({ ...entry, children: nextChildren });
  }

  return <article className={`rounded-lg border border-[var(--line)] bg-[var(--panel)] ${depth ? "ml-3 border-l-4 border-l-[var(--accent)]" : ""}`}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2">
      <strong className="text-sm">{t("resourceEditor.lootEditor.entry", { number: entryIndex + 1 })}</strong>
      <div className="flex gap-2">
        <button aria-label={t("resourceEditor.lootEditor.moveUp")} className="button-secondary focus-ring px-2 py-1" disabled={entryIndex === 0} type="button" onClick={() => onMove(-1)}>↑</button>
        <button aria-label={t("resourceEditor.lootEditor.moveDown")} className="button-secondary focus-ring px-2 py-1" type="button" onClick={() => onMove(1)}>↓</button>
        <button className="button-secondary focus-ring px-2 py-1 text-[var(--red)]" type="button" onClick={onRemove}>{t("common.delete")}</button>
      </div>
    </header>
    <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-2 text-xs font-bold">
        <span>{t("resourceEditor.lootEditor.entryType")}</span>
        <select className="field" value={family} onChange={(event) => changeFamily(event.target.value as LootEntryFamily)}>
          {(["item", "tag", "loot_table", "empty", "alternatives", "group", "sequence", "dynamic", "custom"] as LootEntryFamily[]).map((value) => <option key={value} value={value}>{t(`resourceEditor.lootEditor.entryTypes.${value}`)}</option>)}
        </select>
      </label>
      {family === "custom" ? <label className="grid gap-2 text-xs font-bold md:col-span-1">
        <span>{t("resourceEditor.lootEditor.customType")}</span>
        <input className="field font-mono" value={stringValue(entry.type)} onChange={(event) => onUpdate({ ...entry, type: event.target.value })} />
      </label> : null}
      {family === "item" || family === "tag" || family === "loot_table" ? <LootResourceSelector
        family={family}
        identifier={identifier}
        pickerKind={pickerKind}
        source={record(sources[identifier])}
        token={token}
        onSelect={(nextIdentifier) => onUpdate(setLootEntryIdentifier(entry, family, nextIdentifier))}
      /> : null}
      {family === "dynamic" ? <label className="grid gap-2 text-xs font-bold md:col-span-1">
        <span>{t("resourceEditor.lootEditor.dynamicName")}</span>
        <input className="field font-mono" value={identifier} onChange={(event) => onUpdate(setLootEntryIdentifier(entry, family, event.target.value))} />
      </label> : null}
      {!isCompositeFamily(family) && family !== "empty" ? <>
        <label className="grid gap-2 text-xs font-bold">
          <span>{t("resourceEditor.lootEditor.weight")}</span>
          <input className="field" inputMode="decimal" type="number" value={finiteNumber(entry.weight, 1)} onChange={(event) => onUpdate({ ...entry, weight: finiteNumber(event.target.value, 0) })} />
        </label>
        <label className="grid gap-2 text-xs font-bold">
          <span>{t("resourceEditor.lootEditor.quality")}</span>
          <input className="field" inputMode="decimal" type="number" value={finiteNumber(entry.quality, 0)} onChange={(event) => onUpdate({ ...entry, quality: finiteNumber(event.target.value, 0) })} />
        </label>
      </> : null}
    </div>
    {(family === "item" || family === "tag") ? <div className="border-t border-[var(--line)] p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1"><LootNumberProviderEditor editorID={`${editorID}:quantity`} label={t("resourceEditor.lootEditor.quantity")} value={quantityFunction?.count ?? 1} onChange={updateQuantity} onValidityChange={onValidityChange} /></div>
        {quantityFunction ? <button className="button-secondary focus-ring" type="button" onClick={clearQuantity}>{t("resourceEditor.lootEditor.clearQuantity")}</button> : null}
      </div>
    </div> : null}
    {isCompositeFamily(family) ? <div className="space-y-3 border-t border-[var(--line)] p-3">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm">{t("resourceEditor.lootEditor.children")}</strong>
        {depth < 6 ? <button className="button-secondary focus-ring" type="button" onClick={() => updateChildren([...children, defaultLootEntry("item")])}>+ {t("resourceEditor.lootEditor.addChild")}</button> : null}
      </div>
      {children.map((child, childIndex) => <LootEntryEditor
        depth={depth + 1}
        editorID={`${editorID}:child:${childIndex}`}
        entry={child}
        entryIndex={childIndex}
        key={`child:${childIndex}:${stringValue(child.type)}`}
        sources={sources}
        token={token}
        onRemove={() => updateChildren(children.filter((_, index) => index !== childIndex))}
        onMove={(direction) => updateChildren(moveItem(children, childIndex, direction))}
        onUpdate={(nextChild) => updateChildren(replaceItem(children, childIndex, nextChild))}
        onValidityChange={onValidityChange}
      />)}
    </div> : null}
    <details className="border-t border-[var(--line)] p-3">
      <summary className="cursor-pointer text-xs font-black">{t("resourceEditor.lootEditor.advancedEntry")}</summary>
      <AdvancedJSONEditor editorID={`${editorID}:json`} value={entry} onChange={(value) => onUpdate(record(value))} onValidityChange={onValidityChange} />
    </details>
  </article>;
}

function LootResourceSelector({
  family,
  identifier,
  pickerKind,
  source,
  token,
  onSelect,
}: {
  family: "item" | "tag" | "loot_table";
  identifier: string;
  pickerKind: string;
  source: LootTableRecord;
  token: string;
  onSelect: (identifier: string) => void;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pickedResource, setPickedResource] = useState<CatalogResourceRef>();
  const currentResource = useMemo(
    () => pickedResource?.id === identifier ? pickedResource : catalogResourceFromSource(identifier, pickerKind, source),
    [identifier, pickedResource, pickerKind, source],
  );
  const tagPicker = family === "tag";
  const displayName = currentResource ? localizedResourceName(currentResource, locale) : identifier;
  return <div className="grid gap-2 text-xs font-bold md:col-span-1 xl:col-span-2">
    <span>{t("resourceEditor.lootEditor.resource")}</span>
    <div className="flex min-w-0 gap-2">
      <button className="field focus-ring flex min-w-0 flex-1 items-center gap-3 text-left" type="button" onClick={() => setOpen(true)}>
        {currentResource ? <CatalogResourceIcon className="h-9 w-9" resource={currentResource} /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[var(--panel-subtle)]">?</span>}
        <span className="min-w-0 flex-1"><strong className="block truncate">{displayName || t("resourceEditor.unset")}</strong>{identifier ? <code className="block truncate text-[10px] font-normal text-[var(--muted)]">{tagPicker ? `#${identifier}` : identifier}</code> : null}</span>
        <span className="shrink-0 text-[var(--accent)]">{t("common.select")}</span>
      </button>
      {identifier ? <button aria-label={t("common.delete")} className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => { setPickedResource(undefined); onSelect(""); }}>×</button> : null}
    </div>
    <ResourcePickerDialog
      allowUnresolved
      initialKind={tagPicker ? "" : pickerKind}
      initialRegistry={tagPicker ? "minecraft:item" : ""}
      loadPage={tagPicker ? loadTagPickerPage : undefined}
      multiple={false}
      open={open}
      token={token}
      unresolvedKind={pickerKind}
      unresolvedRegistry={tagPicker ? "minecraft:item" : ""}
      value={currentResource ? [currentResource] : []}
      labels={{
        title: t("resourceEditor.lootEditor.selectResource"),
        description: t("resourceEditor.lootEditor.selectorDescription"),
        searchPlaceholder: t("common.search"),
        empty: t("resourceEditor.referencePicker.empty"),
        selected: t("resourceEditor.referencePicker.selected"),
        notFound: t(tagPicker ? "resourceEditor.referencePicker.tagNotFound" : "resourceEditor.referencePicker.resourceNotFound"),
        manualPrompt: t(tagPicker ? "resourceEditor.referencePicker.tagPrompt" : "resourceEditor.referencePicker.resourcePrompt"),
        manualPlaceholder: tagPicker ? "minecraft:tag_name" : "namespace:resource_id",
        insert: t("resourceEditor.referencePicker.insert"),
      }}
      onClose={() => setOpen(false)}
      onConfirm={(resources) => {
        const resource = resources[0];
        const nextIdentifier = (resource?.rawIdentifier || resource?.id || "").replace(/^#/, "");
        setPickedResource(resource);
        onSelect(nextIdentifier);
        setOpen(false);
      }}
    />
  </div>;
}

function LootNumberProviderEditor({
  editorID,
  label,
  value,
  onChange,
  onValidityChange,
}: {
  editorID: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onValidityChange: (editorID: string, valid: boolean) => void;
}) {
  const { t } = useI18n();
  const inferredMode = lootNumberProviderMode(value);
  const [advanced, setAdvanced] = useState(inferredMode === "advanced");
  const mode = advanced ? "advanced" : inferredMode;
  const provider = record(value);
  return <div className="grid gap-2 text-xs font-bold">
    <span>{label}</span>
    <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
      <select className="field" value={mode} onChange={(event) => {
        const nextMode = event.target.value;
        setAdvanced(nextMode === "advanced");
        if (nextMode === "constant") onChange(finiteNumber(value, 1));
        if (nextMode === "uniform") onChange({ type: "minecraft:uniform", min: finiteNumber(provider.min, 0), max: finiteNumber(provider.max, 1) });
        if (nextMode === "binomial") onChange({ type: "minecraft:binomial", n: finiteNumber(provider.n, 1), p: finiteNumber(provider.p, 0.5) });
      }}>
        <option value="constant">{t("resourceEditor.lootEditor.providerTypes.constant")}</option>
        <option value="uniform">{t("resourceEditor.lootEditor.providerTypes.uniform")}</option>
        <option value="binomial">{t("resourceEditor.lootEditor.providerTypes.binomial")}</option>
        <option value="advanced">{t("resourceEditor.lootEditor.providerTypes.advanced")}</option>
      </select>
      {mode === "constant" ? <input className="field" inputMode="decimal" type="number" value={finiteNumber(value, 1)} onChange={(event) => onChange(finiteNumber(event.target.value, 0))} /> : null}
      {mode === "uniform" ? <div className="grid grid-cols-2 gap-2"><input aria-label={t("resourceEditor.lootEditor.minimum")} className="field" inputMode="decimal" type="number" value={finiteNumber(provider.min, 0)} onChange={(event) => onChange({ ...provider, type: "minecraft:uniform", min: finiteNumber(event.target.value, 0) })} /><input aria-label={t("resourceEditor.lootEditor.maximum")} className="field" inputMode="decimal" type="number" value={finiteNumber(provider.max, 1)} onChange={(event) => onChange({ ...provider, type: "minecraft:uniform", max: finiteNumber(event.target.value, 0) })} /></div> : null}
      {mode === "binomial" ? <div className="grid grid-cols-2 gap-2"><input aria-label={t("resourceEditor.lootEditor.trials")} className="field" inputMode="numeric" type="number" value={finiteNumber(provider.n, 1)} onChange={(event) => onChange({ ...provider, type: "minecraft:binomial", n: finiteNumber(event.target.value, 0) })} /><input aria-label={t("resourceEditor.lootEditor.probability")} className="field" inputMode="decimal" max={1} min={0} step="any" type="number" value={finiteNumber(provider.p, 0.5)} onChange={(event) => onChange({ ...provider, type: "minecraft:binomial", p: finiteNumber(event.target.value, 0) })} /></div> : null}
    </div>
    {mode === "advanced" ? <AdvancedJSONEditor editorID={editorID} value={value} recordOnly={false} onChange={onChange} onValidityChange={onValidityChange} /> : null}
  </div>;
}

function AdvancedJSONEditor({
  editorID,
  value,
  recordOnly = true,
  onChange,
  onValidityChange,
}: {
  editorID: string;
  value: unknown;
  recordOnly?: boolean;
  onChange: (value: unknown) => void;
  onValidityChange: (editorID: string, valid: boolean) => void;
}) {
  const { t } = useI18n();
  const external = JSON.stringify(value, null, 2) ?? "null";
  const [draft, setDraft] = useState(external);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(external);
      setInvalid(false);
      onValidityChange(editorID, true);
    }
  }, [editorID, external, onValidityChange]);
  useEffect(() => () => onValidityChange(editorID, true), [editorID, onValidityChange]);
  return <div className="mt-3">
    <textarea ref={inputRef} aria-invalid={invalid} className="field min-h-40 font-mono text-xs" value={draft} onChange={(event) => {
      const next = event.target.value;
      setDraft(next);
      try {
        const parsed: unknown = JSON.parse(next);
        const isRecord = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
        if (!isRecord && (recordOnly || typeof parsed !== "number" || !Number.isFinite(parsed))) throw new Error("Invalid loot JSON value");
        setInvalid(false);
        onValidityChange(editorID, true);
        onChange(parsed);
      } catch {
        setInvalid(true);
        onValidityChange(editorID, false);
      }
    }} />
    {invalid ? <p className="mt-2 text-xs font-bold text-[var(--red)]">{t("resourceEditor.lootEditor.invalidJson")}</p> : null}
  </div>;
}

function defaultLootPool(): LootTableRecord {
  return { rolls: 1, bonus_rolls: 0, entries: [] };
}

function defaultLootEntry(family: LootEntryFamily): LootTableRecord {
  if (isCompositeFamily(family)) return { type: `minecraft:${family}`, children: [] };
  if (family === "empty") return { type: "minecraft:empty", weight: 1 };
  if (family === "loot_table") return { type: "minecraft:loot_table", value: "", weight: 1 };
  if (family === "tag") return { type: "minecraft:tag", name: "", expand: false, weight: 1 };
  if (family === "dynamic") return { type: "minecraft:dynamic", name: "minecraft:contents", weight: 1 };
  return { type: "minecraft:item", name: "", weight: 1 };
}

function changeLootEntryFamily(entry: LootTableRecord, family: LootEntryFamily): LootTableRecord {
  if (family === "custom") return { ...entry, type: lootEntryFamily(entry) === "custom" ? stringValue(entry.type) : "example:custom" };
  const next: LootTableRecord = { ...entry, type: `minecraft:${family}` };
  delete next.entry_kind;
  if (isCompositeFamily(family)) {
    delete next.name;
    delete next.value;
    next.children = arrayRecords(entry.children);
  } else {
    delete next.children;
    if (family === "loot_table") {
      next.value = stringValue(entry.value ?? entry.name);
      delete next.name;
    } else if (family === "empty") {
      delete next.name;
      delete next.value;
    } else {
      next.name = stringValue(entry.name ?? entry.value);
      delete next.value;
    }
  }
  if (family === "tag" && next.expand === undefined) next.expand = false;
  return next;
}

function setLootEntryIdentifier(entry: LootTableRecord, family: LootEntryFamily, identifier: string): LootTableRecord {
  const next = { ...entry };
  if (family === "loot_table") next.value = identifier;
  else next.name = identifier;
  return next;
}

function isCompositeFamily(family: LootEntryFamily) {
  return family === "alternatives" || family === "group" || family === "sequence";
}

function lootNumberProviderMode(value: unknown): "constant" | "uniform" | "binomial" | "advanced" {
  if (typeof value === "number" || typeof value === "string" && Number.isFinite(Number(value))) return "constant";
  const type = stringValue(record(value).type).replace(/^.*:/, "");
  if (type === "uniform" || type === "binomial") return type;
  return "advanced";
}

function catalogResourceFromSource(identifier: string, kind: string, source: LootTableRecord): CatalogResourceRef | undefined {
  if (!identifier) return undefined;
  const sourceRevisionID = stringValue(source.sourceRevisionId);
  const iconPath = stringValue(source.iconPath);
  const publicID = stringValue(source.publicId);
  const versionPublicID = stringValue(source.sourceVersionPublicId);
  const iconUrl = sourceRevisionID && iconPath
    ? modExportAssetURL(sourceRevisionID, iconPath)
    : publicID && versionPublicID ? modContentResourceAssetURL(publicID, versionPublicID, "icon") : undefined;
  return {
    publicId: publicID || `unresolved:${kind}:${identifier.toLowerCase()}`,
    id: identifier,
    registry: stringValue(source.sourceRegistry) || namespaceFromIdentifier(identifier),
    kind,
    names: stringRecord(source.names),
    iconUrl,
    unresolved: !publicID,
    rawIdentifier: !publicID ? identifier : undefined,
  };
}

function localizedResourceName(resource: CatalogResourceRef, locale: string) {
  return resource.resolvedName || resource.names[locale] || resource.names["zh-CN"] || resource.names["en-US"] || resource.id;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function replaceItem<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function record(value: unknown): LootTableRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as LootTableRecord : {};
}

function arrayRecords(value: unknown): LootTableRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}
