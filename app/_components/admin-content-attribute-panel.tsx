"use client";

import { useEffect, useState } from "react";
import {
  loadAdminContentAttributeTemplates,
  saveAdminContentAttributeTemplate,
  type AdminContentAttributeTemplate,
} from "../_lib/admin-content-attribute-api";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";
import type {
  ModContentEntryField,
  ModContentEntryFieldFormat,
  ModContentEntryFieldType,
  ModContentEntryType,
  ModContentTemplateDefinition,
} from "../_lib/mod-content-api";

type FieldInputKind =
  | "integer" | "float" | "health" | "armor" | "range" | "text" | "boolean" | "text-list"
  | "entity" | "entity-list" | "tag" | "tag-list" | "enchantment" | "enchantment-list"
  | "item" | "item-list" | "resource" | "resource-list" | "json";

type FieldTypeOption = {
  value: FieldInputKind;
  type: ModContentEntryFieldType;
  format: ModContentEntryFieldFormat;
  referenceKind?: string;
};

type PageLocalizationDraft = { name: string; description: string };
type SupportedLocale = (typeof supportedLocales)[number];

const fieldTypeOptions: FieldTypeOption[] = [
  { value: "integer", type: "number", format: "integer" },
  { value: "float", type: "number", format: "float" },
  { value: "health", type: "number", format: "health" },
  { value: "armor", type: "number", format: "armor" },
  { value: "range", type: "range", format: "range" },
  { value: "text", type: "text", format: "text" },
  { value: "boolean", type: "boolean", format: "boolean" },
  { value: "text-list", type: "list", format: "text-list" },
  { value: "entity", type: "reference", format: "entity", referenceKind: "minecraft.entity_type" },
  { value: "entity-list", type: "reference-list", format: "entity", referenceKind: "minecraft.entity_type" },
  { value: "tag", type: "reference", format: "tag", referenceKind: "tag" },
  { value: "tag-list", type: "reference-list", format: "tag", referenceKind: "tag" },
  { value: "enchantment", type: "reference", format: "enchantment", referenceKind: "enchantment" },
  { value: "enchantment-list", type: "reference-list", format: "enchantment", referenceKind: "enchantment" },
  { value: "item", type: "reference", format: "item", referenceKind: "minecraft.item" },
  { value: "item-list", type: "reference-list", format: "item", referenceKind: "minecraft.item" },
  { value: "resource", type: "reference", format: "resource", referenceKind: "minecraft.item" },
  { value: "resource-list", type: "reference-list", format: "resource", referenceKind: "minecraft.item" },
  { value: "json", type: "json", format: "json" },
];

export function AdminContentAttributePanel({ token }: { token: string }) {
  const { locale, t, getBaseTranslation } = useI18n();
  const [items, setItems] = useState<AdminContentAttributeTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedTypeCode, setSelectedTypeCode] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ModContentTemplateDefinition>();
  const [pageLocalizations, setPageLocalizations] = useState<Record<string, PageLocalizationDraft>>({});
  const [selectedEditingLocale, setSelectedEditingLocale] = useState<string>(locale);
  const [persistedTypes, setPersistedTypes] = useState<Set<string>>(new Set());
  const [persistedFields, setPersistedFields] = useState<Set<string>>(new Set());
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [newFieldCode, setNewFieldCode] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldInputKind>("integer");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(search = query) {
    setLoading(true);
    setError("");
    try {
      const loaded = await loadAdminContentAttributeTemplates(token);
      const next = filterTemplates(loaded, search, locale, t);
      setItems(next);
      const selected = next.find((item) => item.templatePublicId === selectedTemplateId) ?? next[0];
      if (selected) selectTemplate(selected);
      else {
        setSelectedTemplateId("");
        setDraft(undefined);
      }
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadAdminContentAttributeTemplates(token)
      .then((next) => {
        if (cancelled) return;
        setItems(next);
        if (next[0]) selectTemplate(next[0]);
      })
      .catch((reason) => { if (!cancelled) setError(errorText(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectTemplate(item: AdminContentAttributeTemplate) {
    const definition = structuredClone(item.definition);
    const editableTypes = (definition.entryTypes || []).filter((entryType) => entryType.code !== "default");
    const contentKey = templatePageContentKeys[item.templateI18nKey];
    setSelectedTemplateId(item.templatePublicId);
    setDraft(definition);
    setPageLocalizations(Object.fromEntries(supportedLocales.map((language) => {
      const nameKey = contentKey ? `mods.detail.dataCategories.${contentKey}` : "";
      const descriptionKey = contentKey ? `mods.detail.dataDescriptions.${contentKey}` : "";
      const defaultName = nameKey ? getBaseTranslation(language.code, nameKey) : item.templateCode;
      const defaultDescription = descriptionKey ? getBaseTranslation(language.code, descriptionKey) : "";
      return [language.code, {
        name: item.pageNames[language.code] || (defaultName === nameKey ? item.templateCode : defaultName),
        description: item.pageDescriptions[language.code] || (defaultDescription === descriptionKey ? "" : defaultDescription),
      }];
    })));
    setPersistedTypes(new Set(editableTypes.map((entryType) => entryType.code)));
    setPersistedFields(new Set(editableTypes.flatMap((entryType) => entryType.groups.flatMap((group) => group.fields.map((field) => `${entryType.code}\u0000${field.code}`)))));
    setSelectedTypeCode(editableTypes.find((entryType) => entryType.code === selectedTypeCode)?.code || editableTypes[0]?.code || "");
    setMessage("");
    setError("");
  }

  const selectedItem = items.find((item) => item.templatePublicId === selectedTemplateId);
  const entryTypes = (draft?.entryTypes || []).filter((entryType) => entryType.code !== "default");
  const selectedType = entryTypes.find((entryType) => entryType.code === selectedTypeCode);
  const selectedEditingLanguage = supportedLocales.find((language) => language.code === selectedEditingLocale) || supportedLocales[0];
  const selectedPageLocalization = pageLocalizations[selectedEditingLanguage.code] || { name: "", description: "" };

  function updateSelectedType(update: (entryType: ModContentEntryType) => ModContentEntryType) {
    if (!draft || !selectedType) return;
    setDraft({
      ...draft,
      entryTypes: (draft.entryTypes || []).map((entryType) => entryType.code === selectedType.code ? update(entryType) : entryType),
    });
  }

  function addType() {
    if (!draft) return;
    const code = newTypeCode.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(code) || (draft.entryTypes || []).some((entryType) => entryType.code === code)) {
      setError(t("admin.resourceAttributes.invalidOrDuplicateId"));
      return;
    }
    const names = localizedName(newTypeName.trim() || code, selectedEditingLanguage.code);
    const entryType: ModContentEntryType = {
      code,
      kindCodes: [...(draft.resourceKinds || [])],
      names,
      groups: [{ code, names: { ...names }, fields: [] }],
    };
    setDraft({ ...draft, entryTypes: [...(draft.entryTypes || []), entryType] });
    setSelectedTypeCode(code);
    setNewTypeCode("");
    setNewTypeName("");
    setError("");
  }

  function addField() {
    if (!selectedType) return;
    const code = newFieldCode.trim();
    const existingCodes = new Set(selectedType.groups.flatMap((group) => group.fields.map((field) => field.code)));
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(code) || existingCodes.has(code)) {
      setError(t("admin.resourceAttributes.invalidOrDuplicateId"));
      return;
    }
    const option = fieldTypeOptions.find((item) => item.value === newFieldType) || fieldTypeOptions[0];
    const field = fieldForType(code, localizedName(newFieldName.trim() || code, selectedEditingLanguage.code), option);
    updateSelectedType((entryType) => {
      const groups = entryType.groups.length ? entryType.groups : [{ code: entryType.code, names: { ...entryType.names }, fields: [] }];
      return { ...entryType, groups: groups.map((group, index) => index === 0 ? { ...group, fields: [...group.fields, field] } : group) };
    });
    setNewFieldCode("");
    setNewFieldName("");
    setNewFieldType("integer");
    setError("");
  }

  async function save() {
    if (!draft || !selectedItem) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await saveAdminContentAttributeTemplate(selectedItem.templatePublicId, {
        definition: draft,
        localizations: supportedLocales.map((language) => ({
          locale: language.code,
          name: pageLocalizations[language.code]?.name.trim() || "",
          summary: pageLocalizations[language.code]?.description.trim() || "",
          contentMarkdown: "",
        })),
      }, token);
      const nextItem = { ...selectedItem, ...result };
      setItems((current) => current.map((item) => item.templatePublicId === nextItem.templatePublicId ? nextItem : item));
      selectTemplate(nextItem);
      setMessage(t("admin.resourceAttributes.saved"));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  }

  return <section className="grid gap-5">
    <header>
      <h2 className="text-2xl font-black">{t("admin.resourceAttributes.title")}</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">{t("admin.resourceAttributes.description")}</p>
    </header>

    <form className="flex flex-wrap gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4" onSubmit={(event) => { event.preventDefault(); void load(query); }}>
      <input className="field min-w-64 flex-1" placeholder={t("admin.resourceAttributes.searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
      <button className="button-secondary focus-ring" type="submit">{t("common.search")}</button>
    </form>

    {error ? <p className="rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{error}</p> : null}
    {message ? <p className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 font-bold text-[var(--accent)]">{message}</p> : null}

    <div className="grid min-h-[38rem] gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <h3 className="border-b border-[var(--line)] px-4 py-3 font-black">{t("admin.resourceAttributes.dataPages")}</h3>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {loading ? <p className="p-3 text-sm text-[var(--muted)]">{t("common.loading")}</p> : <div className="grid gap-1">
            {items.map((item) => <button
              className={`focus-ring rounded-lg px-3 py-2 text-left text-sm ${selectedTemplateId === item.templatePublicId ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--panel-subtle)]"}`}
              key={item.templatePublicId}
              type="button"
              onClick={() => selectTemplate(item)}
            >
              <strong className="block truncate">{templatePageName(item, locale, t)}</strong>
              <span className="mt-0.5 block truncate font-mono text-xs opacity-75">{item.templateCode}</span>
            </button>)}
          </div>}
        </div>
      </aside>

      {!draft || !selectedItem ? <div className="grid place-items-center rounded-xl border border-dashed border-[var(--line)] p-8 text-[var(--muted)]">{t("admin.resourceAttributes.selectPage")}</div> : <div className="min-w-0 space-y-5">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[var(--accent)]">{t("admin.resourceAttributes.globalScope")}</p>
              <h3 className="mt-1 text-xl font-black">{pageLocalizations[locale]?.name || templatePageName(selectedItem, locale, t)}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                <code>{selectedItem.templateCode}</code>
                <span className="mx-2">·</span>
                {t("admin.resourceAttributes.resourceKinds")}: {(draft.resourceKinds || []).join(", ")}
              </p>
            </div>
            <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-black">{t("admin.resourceAttributes.pageLocalization")}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("admin.resourceAttributes.pageLocalizationHint")}</p>
            </div>
            <label className="grid w-full gap-1 text-xs font-bold text-[var(--muted)] sm:w-72">
              {t("admin.resourceAttributes.editingLanguage")}
              <select className="field text-[var(--foreground)]" value={selectedEditingLanguage.code} onChange={(event) => setSelectedEditingLocale(event.target.value)}>
                {supportedLocales.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
            <legend className="px-1 text-sm font-black">{selectedEditingLanguage.label}</legend>
            <label className="grid gap-1 text-xs font-bold text-[var(--muted)]">
              {t("admin.resourceAttributes.pageName")}
              <input className="field text-[var(--foreground)]" maxLength={512} value={selectedPageLocalization.name} onChange={(event) => setPageLocalizations((current) => ({ ...current, [selectedEditingLanguage.code]: { ...selectedPageLocalization, name: event.target.value } }))} />
            </label>
            <label className="mt-3 grid gap-1 text-xs font-bold text-[var(--muted)]">
              {t("admin.resourceAttributes.pageDescription")}
              <textarea className="field min-h-28 resize-y text-[var(--foreground)]" maxLength={4096} value={selectedPageLocalization.description} onChange={(event) => setPageLocalizations((current) => ({ ...current, [selectedEditingLanguage.code]: { ...selectedPageLocalization, description: event.target.value } }))} />
            </label>
          </fieldset>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <h3 className="font-black">{t("admin.resourceAttributes.attributeTypes")}</h3>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{entryTypes.map((entryType) => <button className={`focus-ring shrink-0 rounded-lg px-3 py-2 font-bold ${selectedTypeCode === entryType.code ? "bg-[var(--accent)] text-white" : "bg-[var(--panel-subtle)]"}`} key={entryType.code} type="button" onClick={() => setSelectedTypeCode(entryType.code)}>{localizedValue(entryType.names, locale) || entryType.code}</button>)}</div>
          <div className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]">
            <input className="field font-mono" maxLength={64} placeholder={t("admin.resourceAttributes.typeId")} value={newTypeCode} onChange={(event) => setNewTypeCode(event.target.value)} />
            <input className="field" maxLength={160} placeholder={t("admin.resourceAttributes.typeName")} value={newTypeName} onChange={(event) => setNewTypeName(event.target.value)} />
            <button className="button-secondary focus-ring" type="button" onClick={addType}>{t("admin.resourceAttributes.addType")}</button>
          </div>
        </section>

        {selectedType ? <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div><h3 className="text-lg font-black">{localizedValue(selectedType.names, locale) || selectedType.code}</h3><code className="text-xs text-[var(--muted)]">{selectedType.code}</code></div>
          <LocalizedNameEditor language={selectedEditingLanguage} names={selectedType.names} onChange={(names) => updateSelectedType((entryType) => ({ ...entryType, names, groups: entryType.groups.map((group, index) => index === 0 ? { ...group, names: { ...names } } : group) }))} />
          <div className="space-y-3">{selectedType.groups.flatMap((group) => group.fields).map((field) => <FieldEditor
            field={field}
            key={field.code}
            language={selectedEditingLanguage}
            locked={persistedFields.has(`${selectedType.code}\u0000${field.code}`)}
            onChange={(next) => updateSelectedType((entryType) => ({ ...entryType, groups: entryType.groups.map((group) => ({ ...group, fields: group.fields.map((item) => item.code === field.code ? next : item) })) }))}
          />)}</div>
          <div className="grid gap-3 border-t border-[var(--line)] pt-4 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,220px)_auto]">
            <input className="field font-mono" maxLength={64} placeholder={t("admin.resourceAttributes.fieldId")} value={newFieldCode} onChange={(event) => setNewFieldCode(event.target.value)} />
            <input className="field" maxLength={160} placeholder={t("admin.resourceAttributes.fieldName")} value={newFieldName} onChange={(event) => setNewFieldName(event.target.value)} />
            <select className="field" value={newFieldType} onChange={(event) => setNewFieldType(event.target.value as FieldInputKind)}>{fieldTypeOptions.map((option) => <option key={option.value} value={option.value}>{t(`admin.resourceAttributes.fieldTypes.${option.value}`)}</option>)}</select>
            <button className="button-secondary focus-ring" type="button" onClick={addField}>{t("admin.resourceAttributes.addField")}</button>
          </div>
          {persistedTypes.has(selectedType.code) ? <p className="text-xs text-[var(--muted)]">{t("admin.resourceAttributes.immutableHint")}</p> : null}
        </section> : null}
      </div>}
    </div>
  </section>;
}

function FieldEditor({ field, language, locked, onChange }: { field: ModContentEntryField; language: SupportedLocale; locked: boolean; onChange: (field: ModContentEntryField) => void }) {
  const { t } = useI18n();
  const inputKind = inputKindForField(field);
  const storageSignature = fieldStorageSignature(field);
  return <article className="rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,180px)_minmax(0,220px)_minmax(0,1fr)]">
      <label className="grid gap-1 text-xs font-bold text-[var(--muted)]">{t("admin.resourceAttributes.fieldId")}<input className="field font-mono text-[var(--foreground)]" disabled value={field.code} /></label>
      <label className="grid gap-1 text-xs font-bold text-[var(--muted)]">{t("admin.resourceAttributes.fieldType")}<select className="field text-[var(--foreground)]" value={inputKind} onChange={(event) => onChange(applyFieldType(field, fieldTypeOptions.find((option) => option.value === event.target.value) || fieldTypeOptions[0]))}>
        {fieldTypeOptions.map((option) => <option disabled={locked && fieldStorageSignature(option) !== storageSignature} key={option.value} value={option.value}>{t(`admin.resourceAttributes.fieldTypes.${option.value}`)}</option>)}
      </select></label>
      {(field.type === "reference" || field.type === "reference-list") && field.format === "resource" ? <label className="grid gap-1 text-xs font-bold text-[var(--muted)]">{t("admin.resourceAttributes.resourceKind")}<input className="field font-mono text-[var(--foreground)]" disabled={locked} value={field.referenceKind || ""} onChange={(event) => onChange({ ...field, referenceKind: event.target.value.trim().toLowerCase() })} /></label> : null}
      {(field.type === "reference" || field.type === "reference-list") && field.format === "tag" ? <label className="grid gap-1 text-xs font-bold text-[var(--muted)]">{t("admin.resourceAttributes.tagRegistry")}<input className="field font-mono text-[var(--foreground)]" disabled={locked} placeholder="minecraft:item" value={field.referenceRegistry || ""} onChange={(event) => onChange({ ...field, referenceRegistry: event.target.value.trim().toLowerCase() })} /></label> : null}
    </div>
    <div className="mt-4"><LocalizedNameEditor language={language} names={field.names} onChange={(names) => onChange({ ...field, names })} /></div>
    <label className="mt-4 grid gap-1 text-xs font-bold text-[var(--muted)]">{t("admin.resourceAttributes.importPaths")}<textarea className="field min-h-24 font-mono text-xs text-[var(--foreground)]" value={(field.paths || []).map((path) => path.join(".")).join("\n")} onChange={(event) => onChange({ ...field, paths: parseImportPaths(event.target.value, field.code) })} /></label>
  </article>;
}

function LocalizedNameEditor({ language, names, onChange }: { language: SupportedLocale; names: Record<string, string>; onChange: (names: Record<string, string>) => void }) {
  return <label className="grid gap-1 text-xs font-bold text-[var(--muted)]">{language.label}<input className="field text-[var(--foreground)]" maxLength={160} value={names[language.code] || ""} onChange={(event) => onChange({ ...names, [language.code]: event.target.value })} /></label>;
}

function fieldForType(code: string, names: Record<string, string>, option: FieldTypeOption): ModContentEntryField {
  return applyFieldType({ code, names, type: option.type, paths: [[code]] }, option);
}

function applyFieldType(field: ModContentEntryField, option: FieldTypeOption): ModContentEntryField {
  const next: ModContentEntryField = { ...field, type: option.type, format: option.format };
  if (option.referenceKind) next.referenceKind = option.referenceKind;
  else {
    delete next.referenceKind;
    delete next.referenceRegistry;
  }
  if (option.format !== "tag") delete next.referenceRegistry;
  if (option.format === "tag" && !next.referenceRegistry) next.referenceRegistry = "minecraft:item";
  return next;
}

function inputKindForField(field: ModContentEntryField): FieldInputKind {
  const suffix = field.type === "reference-list" ? "-list" : "";
  if (field.type === "reference" || field.type === "reference-list") {
    const format = field.format || (field.referenceKind === "tag" ? "tag" : field.referenceKind === "enchantment" ? "enchantment" : field.referenceKind === "minecraft.entity_type" ? "entity" : field.referenceKind === "minecraft.item" ? "item" : "resource");
    return `${format}${suffix}` as FieldInputKind;
  }
  if (field.type === "number") return (field.format || "float") as FieldInputKind;
  if (field.type === "list") return "text-list";
  return (field.format || field.type) as FieldInputKind;
}

function fieldStorageSignature(field: Pick<ModContentEntryField, "type" | "referenceKind" | "referenceRegistry"> | FieldTypeOption) {
  return [field.type, field.referenceKind || ""].join("\u0000");
}

function parseImportPaths(value: string, fieldCode: string) {
  const paths = value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => line.split(".").map((segment) => segment.trim()).filter(Boolean)).filter((path) => path.length);
  return paths.length ? paths.slice(0, 8) : [[fieldCode]];
}

function localizedName(value: string, locale: string) {
  return { [locale]: value };
}

function localizedValue(values: Record<string, string>, locale: string) {
  return values[locale] || values[locale.split("-")[0]] || values["zh-CN"] || values["en-US"] || Object.values(values).find(Boolean) || "";
}

const templatePageContentKeys: Record<string, string> = {
  itemBlock: "itemsBlocks",
  fluid: "fluids",
  dimension: "dimensions",
  biome: "biomes",
  entity: "entities",
  enchantment: "enchantments",
  mobEffect: "buffs",
  multiblock: "multiblocks",
  naturalGeneration: "naturalGeneration",
  worldStructure: "worldStructures",
  keyMapping: "keybinds",
  command: "commands",
  advancement: "achievements",
  lootTable: "lootTables",
  gameSetting: "gameSettings",
  skill: "skills",
  element: "elements",
  chemical: "industrialMedia",
};

function templatePageName(
  template: AdminContentAttributeTemplate,
  locale: string,
  t: (key: string) => string,
) {
  const localized = localizedValue(template.pageNames, locale);
  if (localized) return localized;
  const contentKey = templatePageContentKeys[template.templateI18nKey];
  return contentKey ? t(`mods.detail.dataCategories.${contentKey}`) : template.templateCode;
}

function filterTemplates(
  templates: AdminContentAttributeTemplate[],
  query: string,
  locale: string,
  t: (key: string) => string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  if (!normalizedQuery) return templates;
  return templates.filter((template) => [
    templatePageName(template, locale, t),
    template.templateCode,
    template.templateI18nKey,
    ...(template.definition.resourceKinds || []),
  ].some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery)));
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
