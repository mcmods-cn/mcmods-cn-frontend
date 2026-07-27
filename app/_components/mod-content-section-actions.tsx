"use client";

import Image from "next/image";
import Link from "next/link";
import { type DragEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { normalizeContentLanguage } from "../_lib/content-language";
import { loadAllModContentSectionResources, modContentResourceAssetURL, type ModContentMutationResult, type ModContentSection, type ModContentSectionResource, updateModContentLayout } from "../_lib/mod-content-api";
import { modExportAssetURL } from "../_lib/mod-export-api";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";

export function ModContentSectionActions({ siteId, section, categories, onChanged }: {
  siteId: string;
  section: ModContentSection;
  categories: ModContentSection[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"" | "arrange">("");
  const [result, setResult] = useState<ModContentMutationResult>();
  return <>
    <button className="button-secondary focus-ring" type="button" onClick={() => {
      setResult(undefined);
      setMode("arrange");
    }}>{t("modContent.sectionActions.arrange")}</button>
    <Link className="button-primary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/resources/new?version=${encodeURIComponent(section.versionPublicId)}&section=${encodeURIComponent(section.publicId)}`}>{t("modContent.sectionActions.add")}</Link>
    {result ? <span className="w-full rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-bold text-[var(--accent)]" role="status">
      {t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved")}
      {result.reviewStatus === "pending" ? <code className="ms-2 text-xs">{result.changeRequestId}</code> : null}
    </span> : null}
    {mode === "arrange" ? <LayoutDialog categories={categories} section={section} siteId={siteId} onClose={() => setMode("")} onSaved={(value) => {
      setResult(value);
      if (value.reviewStatus === "approved") onChanged();
    }} /> : null}
  </>;
}

function LayoutDialog({ siteId, section, categories: initialCategories, onClose, onSaved }: {
  siteId: string;
  section: ModContentSection;
  categories: ModContentSection[];
  onClose: () => void;
  onSaved: (result: ModContentMutationResult) => void;
}) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const authenticated = Boolean(token);
  const tokenRef = useRef(token);
  const [initialLocale] = useState(locale);
  const [categories, setCategories] = useState<ModContentSection[]>(initialCategories);
  const [resources, setResources] = useState<ModContentSectionResource[]>([]);
  const [draggedResource, setDraggedResource] = useState("");
  const [categoryLocale, setCategoryLocale] = useState<string>(locale);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState(section.publicId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(true);
  const [loadedComplete, setLoadedComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBusy(true);
      setLoadedComplete(false);
    });
    void loadAllModContentSectionResources(siteId, section.publicId, { locale: initialLocale }, tokenRef.current)
      .then((page) => {
        if (cancelled) return;
        setCategories(page.categories || []);
        setResources(page.items);
        setLoadedComplete(true);
        setBusy(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(errorText(cause));
        setBusy(false);
      });
    return () => { cancelled = true; };
  }, [authenticated, initialLocale, section.publicId, siteId]);

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

  function moveResource(resourceID: string, delta: number) {
    setResources((current) => {
      const resource = current.find((item) => item.resourcePublicId === resourceID);
      if (!resource) return current;
      const sectionID = resource.sectionPublicId || section.publicId;
      const siblings = current.filter((item) => (item.sectionPublicId || section.publicId) === sectionID).sort((a, b) => a.ordinal - b.ordinal);
      const index = siblings.findIndex((item) => item.resourcePublicId === resourceID);
      const target = siblings[index + delta];
      if (!target) return current;
      return normalizeResourceOrdinals(current.map((item) => item.resourcePublicId === resourceID
        ? { ...item, ordinal: target.ordinal }
        : item.resourcePublicId === target.resourcePublicId
          ? { ...item, ordinal: resource.ordinal }
          : item));
    });
  }

  function moveResourceToCategory(resourceID: string, targetSectionID: string) {
    setResources((current) => {
      const moving = current.find((item) => item.resourcePublicId === resourceID);
      if (!moving) return current;
      const targetOrdinal = current.filter((item) => (item.sectionPublicId || section.publicId) === targetSectionID).length;
      return normalizeResourceOrdinals(current.map((item) => item.resourcePublicId === resourceID
        ? { ...item, sectionPublicId: targetSectionID, ordinal: targetOrdinal }
        : item));
    });
  }

  async function save() {
    if (!loadedComplete) {
      setError(t("modContent.sectionActions.incompleteLayout"));
      return;
    }
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
      onSaved(result);
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return <Modal busy={busy} wide title={t("modContent.sectionActions.arrangeTitle")} onClose={onClose}>
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
            {isRoot ? <strong className="min-w-0 flex-1">{t("modContent.sectionActions.rootCategory")}</strong> : <input aria-label={`${t("modContent.sectionActions.name")}: ${categoryName(category, categoryLocale)}`} className="field min-w-44 flex-1 py-2 font-bold" value={categoryName(category, categoryLocale)} onChange={(event) => updateCategoryName(category, event.target.value)} />}
            {!isRoot ? <><select aria-label={t("modContent.sectionActions.parentCategory")} className="field w-auto py-2 text-sm" value={category.parentPublicId} onChange={(event) => setCategories((current) => normalizeCategoryOrdinals(current.map((item) => item.publicId === category.publicId ? { ...item, parentPublicId: event.target.value } : item)))}>{possibleParents.map((item) => <option key={item.publicId} value={item.publicId}>{item.publicId === section.publicId ? t("modContent.sectionActions.rootCategory") : categoryName(item, categoryLocale)}</option>)}</select><button className="button-secondary px-3" type="button" onClick={() => moveCategory(category, -1)}>↑</button><button className="button-secondary px-3" type="button" onClick={() => moveCategory(category, 1)}>↓</button><button className="button-secondary px-3 text-[var(--red)]" type="button" onClick={() => deleteCategory(category)}>{t("common.delete")}</button></> : null}
          </header>
          <div className="mt-3 flex min-h-20 flex-wrap content-start gap-2 rounded-lg border border-dashed border-[var(--line)] p-2">
            {entries.map((resource, index) => <ResourceChip
              categories={orderedSections}
              defaultLocale={section.defaultLocale}
              dragged={draggedResource === resource.resourcePublicId}
              key={resource.resourcePublicId}
              locale={locale}
              resource={resource}
              canMoveDown={index < entries.length - 1}
              canMoveUp={index > 0}
              onCategoryChange={(targetSectionID) => moveResourceToCategory(resource.resourcePublicId, targetSectionID)}
              onDragStart={(event) => { setDraggedResource(resource.resourcePublicId); event.dataTransfer.effectAllowed = "move"; }}
              onMove={(delta) => moveResource(resource.resourcePublicId, delta)}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); dropResource(category.publicId, resource.resourcePublicId); }}
            />)}
            {!entries.length ? <span className="m-auto text-sm text-[var(--muted)]">{t("modContent.sectionActions.dropHere")}</span> : null}
          </div>
        </section>;
      })}
    </div>}
    <label className="mt-5 grid gap-2 text-sm font-bold"><span>{t("modContent.reason")}</span><input className="field" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{error}</p> : null}
    <div className="mt-5 flex justify-end gap-2"><button className="button-secondary" disabled={busy} type="button" onClick={onClose}>{t("common.cancel")}</button><button className="button-primary" disabled={busy || !loadedComplete} type="button" onClick={() => void save()}>{t("modContent.sectionActions.submitLayout")}</button></div>
  </Modal>;
}

function ResourceChip({ resource, locale, defaultLocale, categories, dragged, canMoveUp, canMoveDown, onCategoryChange, onDragStart, onMove, onDrop }: {
  resource: ModContentSectionResource;
  locale: string;
  defaultLocale: string;
  categories: ModContentSection[];
  dragged: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onCategoryChange: (sectionID: string) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onMove: (delta: number) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const { t } = useI18n();
  const iconURL = resourceIconURL(resource);
  return <div className={`grid max-w-full gap-2 rounded-lg border bg-[var(--panel)] p-2 sm:grid-cols-[minmax(160px,1fr)_minmax(150px,220px)_auto] ${dragged ? "border-[var(--accent)] opacity-50" : "border-[var(--line)]"}`} draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
    <div className="flex min-w-0 cursor-grab items-center gap-2 active:cursor-grabbing">
      {iconURL ? <Image unoptimized alt="" className="h-8 w-8 object-contain [image-rendering:pixelated]" height={32} src={iconURL} width={32} /> : <span className="grid h-8 w-8 place-items-center rounded bg-[var(--panel-subtle)] text-xs">?</span>}
      <span className="min-w-0"><strong className="block truncate text-sm">{resourceName(resource, locale, defaultLocale)}</strong><code className="block truncate text-[10px] text-[var(--muted)]">{resource.canonicalId}</code></span>
    </div>
    <select
      aria-label={t("modContent.sectionActions.moveToCategory")}
      className="field py-1 text-xs"
      value={resource.sectionPublicId}
      onChange={(event) => onCategoryChange(event.target.value)}
    >
      {categories.map((category, index) => <option key={category.publicId} value={category.publicId}>{index === 0 ? t("modContent.sectionActions.rootCategory") : categoryName(category, locale)}</option>)}
    </select>
    <div className="flex gap-1">
      <button aria-label={t("modContent.sectionActions.moveUp")} className="button-secondary px-2 py-1" disabled={!canMoveUp} type="button" onClick={() => onMove(-1)}>↑</button>
      <button aria-label={t("modContent.sectionActions.moveDown")} className="button-secondary px-2 py-1" disabled={!canMoveDown} type="button" onClick={() => onMove(1)}>↓</button>
    </div>
  </div>;
}

function Modal({ title, onClose, busy = false, wide = false, children }: { title: string; onClose: () => void; busy?: boolean; wide?: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = dialog ? modalFocusableElements(dialog) : [];
    (focusable[0] || dialog)?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      const currentDialog = dialogRef.current;
      if (!currentDialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = modalFocusableElements(currentDialog);
      if (!elements.length) {
        event.preventDefault();
        currentDialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!active || !elements.includes(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);
  return <div
    aria-labelledby={titleId}
    aria-modal="true"
    className="fixed inset-0 z-[120] overflow-y-auto bg-black/55 p-3 sm:p-6"
    ref={dialogRef}
    role="dialog"
    tabIndex={-1}
  >
    <div className={`mx-auto rounded-2xl border border-[var(--line)] bg-[var(--background)] p-5 shadow-2xl sm:p-7 ${wide ? "max-w-[1500px]" : "max-w-3xl"}`}>
      <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4"><h2 className="text-2xl font-black" id={titleId}>{title}</h2><button aria-label={t("common.close")} className="button-secondary" disabled={busy} type="button" onClick={onClose}>{t("common.close")}</button></header>
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

function resourceName(resource: ModContentSectionResource, locale: string, defaultLocale: string) {
  const names = resource.names || {};
  for (const candidate of [locale, defaultLocale, "en-US"]) {
    const normalized = normalizeContentLanguage(candidate);
    const match = Object.entries(names).find(([key]) => normalizeContentLanguage(key) === normalized);
    if (match?.[1]) return match[1];
  }
  return Object.values(names).find(Boolean) || resource.canonicalId || resource.resourcePublicId;
}

function modalFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

function resourceIconURL(resource: ModContentSectionResource) {
  if (resource.iconFileId) return modContentResourceAssetURL(resource.resourcePublicId, resource.versionPublicId, "icon");
  return resource.revisionId && resource.iconPath ? modExportAssetURL(resource.revisionId, resource.iconPath) : "";
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
