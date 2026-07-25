"use client";

import Image from "next/image";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { normalizeContentLanguage } from "../_lib/content-language";
import {
  createModContentResource,
  loadModContentSectionResources,
  loadModContentTemplates,
  type ModContentSection,
  type ModContentSectionResource,
  updateModContentLayout,
} from "../_lib/mod-content-api";
import { modExportAssetURL } from "../_lib/mod-export-api";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";

export function ModContentSectionActions({ siteId, section, categories, onChanged }: {
  siteId: string;
  section: ModContentSection;
  categories: ModContentSection[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"" | "arrange" | "add">("");
  const [message, setMessage] = useState("");
  return <>
    <button className="button-secondary focus-ring" type="button" onClick={() => setMode("arrange")}>{t("modContent.sectionActions.arrange")}</button>
    <button className="button-primary focus-ring" type="button" onClick={() => setMode("add")}>{t("modContent.sectionActions.add")}</button>
    {message ? <span className="w-full text-sm font-bold text-[var(--accent)]">{message}</span> : null}
    {mode === "arrange" ? <LayoutDialog categories={categories} section={section} siteId={siteId} onClose={() => setMode("")} onSaved={(value) => { setMessage(value); onChanged(); }} /> : null}
    {mode === "add" ? <AddResourceDialog categories={categories} section={section} siteId={siteId} onClose={() => setMode("")} onSaved={(value) => { setMessage(value); onChanged(); }} /> : null}
  </>;
}

function AddResourceDialog({ siteId, section, categories, onClose, onSaved }: {
  siteId: string;
  section: ModContentSection;
  categories: ModContentSection[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [kindCodes, setKindCodes] = useState<string[]>([]);
  const [kindCode, setKindCode] = useState("");
  const [canonicalId, setCanonicalId] = useState("");
  const [sectionPublicId, setSectionPublicId] = useState(section.publicId);
  const [editLocale, setEditLocale] = useState<string>(locale);
  const [localizations, setLocalizations] = useState<Array<{ locale: string; name: string; summary: string; contentMarkdown: string }>>([]);
  const [definition, setDefinition] = useState("{}");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadModContentTemplates(siteId, token).then((templates) => {
      if (cancelled) return;
      const template = templates.find((item) => item.publicId === section.templatePublicId);
      const values = Array.isArray(template?.definition.resourceKinds)
        ? template.definition.resourceKinds.filter((value): value is string => typeof value === "string")
        : [];
      setKindCodes(values);
      setKindCode(values[0] || "");
    }).catch((cause) => { if (!cancelled) setError(errorText(cause)); });
    return () => { cancelled = true; };
  }, [section.templatePublicId, siteId, token]);

  async function submit() {
    const localized = resourceLocalization(localizations, editLocale);
    if (!kindCode || !canonicalId.trim() || !localized.name.trim()) {
      setError(t("modContent.sectionActions.required"));
      return;
    }
    let parsedDefinition: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(definition || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      parsedDefinition = value as Record<string, unknown>;
    } catch {
      setError(t("modContent.sectionActions.invalidJson"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await createModContentResource(siteId, {
        kindCode,
        canonicalId: canonicalId.trim(),
        versionPublicId: section.versionPublicId,
        sectionPublicId,
        defaultLocale: localizations.find((item) => item.name.trim())?.locale || editLocale,
        definition: parsedDefinition,
        localizations: localizations.filter((item) => item.name.trim()),
        reason: reason.trim() || t("modContent.sectionActions.addReason"),
      }, token);
      onSaved(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  const availableCategories = [section, ...categories];
  return <Modal title={t("modContent.sectionActions.addTitle")} onClose={onClose}>
    <p className="text-sm leading-6 text-[var(--muted)]">{t("modContent.sectionActions.addHint")}</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold"><span>{t("resourceEditor.kind")}</span>{kindCodes.length ? <select className="field" value={kindCode} onChange={(event) => setKindCode(event.target.value)}>{kindCodes.map((value) => <option key={value} value={value}>{value}</option>)}</select> : <input className="field font-mono" value={kindCode} placeholder="mod.resource_kind" onChange={(event) => setKindCode(event.target.value)} />}</label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.resourceId")}</span><input className="field font-mono" value={canonicalId} placeholder="examplemod:resource_id" onChange={(event) => setCanonicalId(event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.sectionActions.category")}</span><select className="field" value={sectionPublicId} onChange={(event) => setSectionPublicId(event.target.value)}>{availableCategories.map((category) => <option key={category.publicId} value={category.publicId}>{category.publicId === section.publicId ? t("modContent.sectionActions.rootCategory") : categoryName(category, locale)}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.language")}</span><select className="field" value={editLocale} onChange={(event) => setEditLocale(event.target.value)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.name")}</span><input className="field" value={resourceLocalization(localizations, editLocale).name} onChange={(event) => setLocalizations(updateResourceLocalization(localizations, editLocale, { name: event.target.value }))} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.sectionActions.summary")}</span><textarea className="field min-h-20" value={resourceLocalization(localizations, editLocale).summary} onChange={(event) => setLocalizations(updateResourceLocalization(localizations, editLocale, { summary: event.target.value }))} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.sectionActions.content")}</span><textarea className="field min-h-36 font-mono text-sm" value={resourceLocalization(localizations, editLocale).contentMarkdown} onChange={(event) => setLocalizations(updateResourceLocalization(localizations, editLocale, { contentMarkdown: event.target.value }))} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.sectionActions.definition")}</span><textarea className="field min-h-28 font-mono text-xs" value={definition} onChange={(event) => setDefinition(event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2"><span>{t("modContent.reason")}</span><input className="field" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </div>
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{error}</p> : null}
    <div className="mt-5 flex justify-end gap-2"><button className="button-secondary" type="button" onClick={onClose}>{t("common.cancel")}</button><button className="button-primary" disabled={busy} type="button" onClick={() => void submit()}>{busy ? t("common.loading") : t("modContent.sectionActions.submitAdd")}</button></div>
  </Modal>;
}

function LayoutDialog({ siteId, section, categories: initialCategories, onClose, onSaved }: {
  siteId: string;
  section: ModContentSection;
  categories: ModContentSection[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [categories, setCategories] = useState<ModContentSection[]>(initialCategories);
  const [resources, setResources] = useState<ModContentSectionResource[]>([]);
  const [draggedResource, setDraggedResource] = useState("");
  const [categoryLocale, setCategoryLocale] = useState<string>(locale);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState(section.publicId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadModContentSectionResources(siteId, section.publicId, { locale, limit: 20000, offset: 0 }, token)
      .then((page) => {
        if (cancelled) return;
        setCategories(page.categories || []);
        setResources(page.items);
        setBusy(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(errorText(cause));
        setBusy(false);
      });
    return () => { cancelled = true; };
  }, [locale, section.publicId, siteId, token]);

  const depthByID = useMemo(() => categoryDepths(section.publicId, categories), [categories, section.publicId]);
  const orderedSections = [section, ...flattenCategoryTree(section.publicId, categories)];

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const publicId = `new_${crypto.randomUUID()}`;
    const siblings = categories.filter((item) => item.parentPublicId === newCategoryParent);
    setCategories((current) => [...current, {
      ...section,
      publicId,
      parentPublicId: newCategoryParent,
      defaultLocale: categoryLocale,
      ordinal: siblings.length,
      localizations: [{ locale: categoryLocale, name, summary: "", contentMarkdown: "" }],
      resourceCount: 0,
      publishedRevisionId: undefined,
    }]);
    setNewCategoryName("");
  }

  function deleteCategory(category: ModContentSection) {
    const parentID = category.parentPublicId || section.publicId;
    setCategories((current) => normalizeCategoryOrdinals(current
      .filter((item) => item.publicId !== category.publicId)
      .map((item) => item.parentPublicId === category.publicId ? { ...item, parentPublicId: parentID } : item)));
    setResources((current) => normalizeResourceOrdinals(current.map((item) => item.sectionPublicId === category.publicId ? { ...item, sectionPublicId: parentID } : item)));
  }

  function updateCategory(categoryID: string, updates: Partial<ModContentSection>) {
    setCategories((current) => current.map((item) => item.publicId === categoryID ? { ...item, ...updates } : item));
  }

  function updateCategoryName(category: ModContentSection, value: string) {
    const normalizedLocale = normalizeContentLanguage(categoryLocale);
    const values = category.localizations.filter((item) => normalizeContentLanguage(item.locale) !== normalizedLocale);
    updateCategory(category.publicId, { localizations: [...values, { locale: categoryLocale, name: value, summary: "", contentMarkdown: "" }] });
  }

  function moveCategory(category: ModContentSection, delta: number) {
    const siblings = categories.filter((item) => item.parentPublicId === category.parentPublicId).sort((a, b) => a.ordinal - b.ordinal);
    const index = siblings.findIndex((item) => item.publicId === category.publicId);
    const target = siblings[index + delta];
    if (!target) return;
    setCategories((current) => normalizeCategoryOrdinals(current.map((item) => item.publicId === category.publicId ? { ...item, ordinal: target.ordinal } : item.publicId === target.publicId ? { ...item, ordinal: category.ordinal } : item)));
  }

  function dropResource(targetSectionID: string, beforeResourceID = "") {
    if (!draggedResource) return;
    if (beforeResourceID === draggedResource) {
      setDraggedResource("");
      return;
    }
    setResources((current) => {
      const moving = current.find((item) => item.resourcePublicId === draggedResource);
      if (!moving) return current;
      const without = current.filter((item) => item.resourcePublicId !== draggedResource);
      const targetItems = without.filter((item) => item.sectionPublicId === targetSectionID).sort((a, b) => a.ordinal - b.ordinal).map((item) => ({ ...item }));
      const index = beforeResourceID ? Math.max(0, targetItems.findIndex((item) => item.resourcePublicId === beforeResourceID)) : targetItems.length;
      targetItems.splice(index, 0, { ...moving, sectionPublicId: targetSectionID });
      targetItems.forEach((item, itemIndex) => { item.ordinal = itemIndex; });
      const other = without.filter((item) => item.sectionPublicId !== targetSectionID);
      return normalizeResourceOrdinals([...other, ...targetItems]);
    });
    setDraggedResource("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await updateModContentLayout(siteId, section.publicId, {
        versionPublicId: section.versionPublicId,
        rootSectionPublicId: section.publicId,
        categories: normalizeCategoryOrdinals(categories).map((category) => ({
          publicId: category.publicId,
          parentPublicId: category.parentPublicId,
          defaultLocale: category.defaultLocale || locale,
          ordinal: category.ordinal,
          localizations: category.localizations,
        })),
        resources: normalizeResourceOrdinals(resources).map((resource) => ({
          resourcePublicId: resource.resourcePublicId,
          sectionPublicId: resource.sectionPublicId || section.publicId,
          ordinal: resource.ordinal,
        })),
        reason: reason.trim() || t("modContent.sectionActions.layoutReason"),
        baseRevisionId: section.publishedRevisionId,
      }, token);
      onSaved(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return <Modal wide title={t("modContent.sectionActions.arrangeTitle")} onClose={onClose}>
    <p className="text-sm leading-6 text-[var(--muted)]">{t("modContent.sectionActions.arrangeHint")}</p>
    <div className="mt-5 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)] p-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.language")}</span><select className="field" value={categoryLocale} onChange={(event) => setCategoryLocale(event.target.value)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.newCategoryName")}</span><input className="field" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.parentCategory")}</span><select className="field" value={newCategoryParent} onChange={(event) => setNewCategoryParent(event.target.value)}><option value={section.publicId}>{t("modContent.sectionActions.rootCategory")}</option>{categories.filter((item) => (depthByID.get(item.publicId) || 0) < 4).map((item) => <option key={item.publicId} value={item.publicId}>{categoryName(item, categoryLocale)}</option>)}</select></label>
      <button className="button-primary lg:col-span-3" disabled={!newCategoryName.trim()} type="button" onClick={addCategory}>{t("modContent.sectionActions.createCategory")}</button>
    </div>
    {busy && !resources.length ? <p className="mt-8 text-center text-[var(--muted)]">{t("common.loading")}</p> : <div className="mt-5 grid max-h-[58vh] gap-3 overflow-y-auto pr-1">
      {orderedSections.map((category) => {
        const entries = resources.filter((item) => (item.sectionPublicId || section.publicId) === category.publicId).sort((a, b) => a.ordinal - b.ordinal);
        const isRoot = category.publicId === section.publicId;
        const descendantIDs = isRoot ? new Set<string>() : descendantsOf(category.publicId, categories);
        const possibleParents = [section, ...categories].filter((item) => item.publicId !== category.publicId && !descendantIDs.has(item.publicId) && (depthByID.get(item.publicId) || 0) < 4);
        return <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3" key={category.publicId} style={{ marginInlineStart: `${isRoot ? 0 : Math.min(4, depthByID.get(category.publicId) || 1) * 18}px` }} onDragOver={(event) => event.preventDefault()} onDrop={() => dropResource(category.publicId)}>
          <header className="flex flex-wrap items-center gap-2">
            {isRoot ? <strong className="min-w-0 flex-1">{t("modContent.sectionActions.rootCategory")}</strong> : <input className="field min-w-44 flex-1 py-2 font-bold" value={categoryName(category, categoryLocale)} onChange={(event) => updateCategoryName(category, event.target.value)} />}
            {!isRoot ? <><select aria-label={t("modContent.sectionActions.parentCategory")} className="field w-auto py-2 text-sm" value={category.parentPublicId} onChange={(event) => setCategories((current) => normalizeCategoryOrdinals(current.map((item) => item.publicId === category.publicId ? { ...item, parentPublicId: event.target.value } : item)))}>{possibleParents.map((item) => <option key={item.publicId} value={item.publicId}>{item.publicId === section.publicId ? t("modContent.sectionActions.rootCategory") : categoryName(item, categoryLocale)}</option>)}</select><button className="button-secondary px-3" type="button" onClick={() => moveCategory(category, -1)}>↑</button><button className="button-secondary px-3" type="button" onClick={() => moveCategory(category, 1)}>↓</button><button className="button-secondary px-3 text-[var(--red)]" type="button" onClick={() => deleteCategory(category)}>{t("common.delete")}</button></> : null}
          </header>
          <div className="mt-3 flex min-h-20 flex-wrap content-start gap-2 rounded-lg border border-dashed border-[var(--line)] p-2">
            {entries.map((resource) => <ResourceChip dragged={draggedResource === resource.resourcePublicId} key={resource.resourcePublicId} locale={locale} resource={resource} onDragStart={(event) => { setDraggedResource(resource.resourcePublicId); event.dataTransfer.effectAllowed = "move"; }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); dropResource(category.publicId, resource.resourcePublicId); }} />)}
            {!entries.length ? <span className="m-auto text-sm text-[var(--muted)]">{t("modContent.sectionActions.dropHere")}</span> : null}
          </div>
        </section>;
      })}
    </div>}
    <label className="mt-5 grid gap-2 text-sm font-bold"><span>{t("modContent.reason")}</span><input className="field" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{error}</p> : null}
    <div className="mt-5 flex justify-end gap-2"><button className="button-secondary" type="button" onClick={onClose}>{t("common.cancel")}</button><button className="button-primary" disabled={busy} type="button" onClick={() => void save()}>{t("modContent.sectionActions.submitLayout")}</button></div>
  </Modal>;
}

function ResourceChip({ resource, locale, dragged, onDragStart, onDrop }: {
  resource: ModContentSectionResource;
  locale: string;
  dragged: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const iconURL = resourceIconURL(resource);
  return <div className={`flex max-w-64 cursor-grab items-center gap-2 rounded-lg border bg-[var(--panel)] px-2 py-1.5 active:cursor-grabbing ${dragged ? "border-[var(--accent)] opacity-50" : "border-[var(--line)]"}`} draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
    {iconURL ? <Image unoptimized alt="" className="h-8 w-8 object-contain [image-rendering:pixelated]" height={32} src={iconURL} width={32} /> : <span className="grid h-8 w-8 place-items-center rounded bg-[var(--panel-subtle)] text-xs">?</span>}
    <span className="min-w-0"><strong className="block truncate text-sm">{resourceName(resource, locale)}</strong><code className="block truncate text-[10px] text-[var(--muted)]">{resource.canonicalId}</code></span>
  </div>;
}

function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  return <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/55 p-3 sm:p-6" role="dialog" aria-modal="true">
    <div className={`mx-auto rounded-2xl border border-[var(--line)] bg-[var(--background)] p-5 shadow-2xl sm:p-7 ${wide ? "max-w-[1500px]" : "max-w-3xl"}`}>
      <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4"><h2 className="text-2xl font-black">{title}</h2><button aria-label={t("common.close")} className="button-secondary" type="button" onClick={onClose}>{t("common.close")}</button></header>
      <div className="pt-5">{children}</div>
    </div>
  </div>;
}

function normalizeCategoryOrdinals(categories: ModContentSection[]) {
  const grouped = new Map<string, ModContentSection[]>();
  for (const category of categories) grouped.set(category.parentPublicId, [...(grouped.get(category.parentPublicId) || []), category]);
  const ordinals = new Map<string, number>();
  for (const siblings of grouped.values()) {
    siblings.sort((a, b) => a.ordinal - b.ordinal || a.publicId.localeCompare(b.publicId));
    siblings.forEach((item, index) => ordinals.set(item.publicId, index));
  }
  return categories.map((item) => ({ ...item, ordinal: ordinals.get(item.publicId) || 0 }));
}

function normalizeResourceOrdinals(resources: ModContentSectionResource[]) {
  const grouped = new Map<string, ModContentSectionResource[]>();
  for (const resource of resources) grouped.set(resource.sectionPublicId, [...(grouped.get(resource.sectionPublicId) || []), resource]);
  const ordinals = new Map<string, number>();
  for (const entries of grouped.values()) {
    entries.sort((a, b) => a.ordinal - b.ordinal || a.resourcePublicId.localeCompare(b.resourcePublicId));
    entries.forEach((item, index) => ordinals.set(item.resourcePublicId, index));
  }
  return resources.map((item) => ({ ...item, ordinal: ordinals.get(item.resourcePublicId) || 0 }));
}

function categoryDepths(rootID: string, categories: ModContentSection[]) {
  const byID = new Map(categories.map((item) => [item.publicId, item]));
  const result = new Map<string, number>([[rootID, 0]]);
  const resolve = (publicID: string, seen = new Set<string>()): number => {
    if (result.has(publicID)) return result.get(publicID) || 0;
    if (seen.has(publicID)) return 5;
    seen.add(publicID);
    const category = byID.get(publicID);
    const value = category ? resolve(category.parentPublicId, seen) + 1 : 0;
    result.set(publicID, value);
    return value;
  };
  categories.forEach((item) => resolve(item.publicId));
  return result;
}

function descendantsOf(publicID: string, categories: ModContentSection[]) {
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (!result.has(category.publicId) && (category.parentPublicId === publicID || result.has(category.parentPublicId))) {
        result.add(category.publicId);
        changed = true;
      }
    }
  }
  return result;
}

function flattenCategoryTree(rootID: string, categories: ModContentSection[]) {
  const result: ModContentSection[] = [];
  const appendChildren = (parentID: string) => {
    categories
      .filter((item) => item.parentPublicId === parentID)
      .sort((a, b) => a.ordinal - b.ordinal || a.publicId.localeCompare(b.publicId))
      .forEach((item) => {
        result.push(item);
        appendChildren(item.publicId);
      });
  };
  appendChildren(rootID);
  return result;
}

function categoryName(category: ModContentSection, locale: string) {
  const normalized = normalizeContentLanguage(locale);
  return category.localizations.find((item) => normalizeContentLanguage(item.locale) === normalized)?.name
    || category.localizations.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(category.defaultLocale))?.name
    || category.localizations[0]?.name
    || category.publicId;
}

function resourceName(resource: ModContentSectionResource, locale: string) {
  const normalized = normalizeContentLanguage(locale);
  const match = Object.entries(resource.names || {}).find(([key]) => normalizeContentLanguage(key) === normalized);
  return match?.[1] || Object.values(resource.names || {}).find(Boolean) || resource.canonicalId || resource.resourcePublicId;
}

function resourceLocalization(values: Array<{ locale: string; name: string; summary: string; contentMarkdown: string }>, locale: string) {
  return values.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(locale))
    || { locale, name: "", summary: "", contentMarkdown: "" };
}

function updateResourceLocalization(
  values: Array<{ locale: string; name: string; summary: string; contentMarkdown: string }>,
  locale: string,
  patch: Partial<{ name: string; summary: string; contentMarkdown: string }>,
) {
  const normalized = normalizeContentLanguage(locale);
  return [
    ...values.filter((item) => normalizeContentLanguage(item.locale) !== normalized),
    { ...resourceLocalization(values, locale), locale, ...patch },
  ];
}

function resourceIconURL(resource: ModContentSectionResource) {
  if (resource.revisionId && resource.iconPath) return modExportAssetURL(resource.revisionId, resource.iconPath);
  return resource.iconFileId ? `${API_BASE_URL}/api/v1/catalog/resources/${encodeURIComponent(resource.resourcePublicId)}/icon` : "";
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
