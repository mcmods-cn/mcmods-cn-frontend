"use client";

import Image from "next/image";
import { type DragEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { normalizeContentLanguage } from "../_lib/content-language";
import {
  loadAllModContentSectionResources,
  modContentResourceAssetURL,
  type ModContentSection,
  type ModContentSectionResource,
  updateModContentLayout,
} from "../_lib/mod-content-api";
import { modExportAssetURL } from "../_lib/mod-export-api";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";

type AdvancementNodeLayout = {
  parentResourcePublicId: string;
  x: number;
  y: number;
};

type AdvancementLayouts = Record<string, AdvancementNodeLayout>;

type DraggedAdvancement = {
  resourcePublicId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

const advancementColumnWidth = 280;
const advancementRowHeight = 132;
const advancementNodeWidth = 240;
const advancementNodeHeight = 96;

export function ModContentLayoutEditorPage({ siteId, sectionId }: { siteId: string; sectionId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const tokenRef = useRef(token);
  const [initialLocale] = useState(locale);
  const [section, setSection] = useState<ModContentSection>();
  const [categories, setCategories] = useState<ModContentSection[]>([]);
  const [resources, setResources] = useState<ModContentSectionResource[]>([]);
  const [advancementLayouts, setAdvancementLayouts] = useState<AdvancementLayouts>({});
  const [draggedResource, setDraggedResource] = useState("");
  const [draggedAdvancement, setDraggedAdvancement] = useState<DraggedAdvancement>();
  const [linkParent, setLinkParent] = useState("");
  const [categoryLocale, setCategoryLocale] = useState<string>(locale);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState(sectionId);
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
      setError("");
    });
    void loadAllModContentSectionResources(siteId, sectionId, { locale: initialLocale }, tokenRef.current)
      .then((page) => {
        if (cancelled) return;
        setSection(page.section);
        setCategories(page.categories || []);
        setResources(page.items);
        setAdvancementLayouts(createAdvancementLayouts(page.items));
        setNewCategoryParent(page.section.publicId);
        setLoadedComplete(true);
        setBusy(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(errorText(cause));
        setBusy(false);
      });
    return () => { cancelled = true; };
  }, [initialLocale, sectionId, siteId, token]);

  const isAdvancement = section?.templateCode === "advancement";
  const depthByID = useMemo(
    () => categoryDepths(section?.publicId || sectionId, categories),
    [categories, section?.publicId, sectionId],
  );

  function closeEditor() {
    const fallback = section
      ? `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(section.publicId)}`
      : `/mods/${encodeURIComponent(siteId)}`;
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.assign(fallback);
    }, 120);
  }

  async function save() {
    if (!section || !loadedComplete) {
      setError(t("modContent.sectionActions.incompleteLayout"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const normalizedResources = normalizeResourceOrdinals(resources);
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
        resources: normalizedResources.map((resource) => ({
          resourcePublicId: resource.resourcePublicId,
          sectionPublicId: resource.sectionPublicId || section.publicId,
          ordinal: resource.ordinal,
          advancement: isAdvancement ? advancementLayouts[resource.resourcePublicId] : undefined,
        })),
        reason: reason.trim() || t("modContent.sectionActions.layoutReason"),
        baseRevisionId: section.publishedRevisionId,
      }, token);
      window.opener?.postMessage({
        type: "mcmods:content-layout-saved",
        siteId,
        sectionId: section.publicId,
        result,
      }, window.location.origin);
      closeEditor();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  if (!section && busy) {
    return <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6 text-[var(--foreground)]">
      <p className="text-[var(--muted)]">{t("common.loading")}</p>
    </main>;
  }

  return <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
    <div className="mx-auto max-w-[1700px]">
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] pb-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--accent)]">{t("modContent.sectionActions.separateWindow")}</p>
          <h1 className="mt-1 text-3xl font-black">{t("modContent.sectionActions.arrangeTitle")}</h1>
          {section ? <p className="mt-2 text-sm text-[var(--muted)]">{localizedSectionName(section, locale)} · {section.versionPublicId}</p> : null}
        </div>
        <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={closeEditor}>{t("common.cancel")}</button>
        <button className="button-primary focus-ring" disabled={busy || !loadedComplete} type="button" onClick={() => void save()}>{t("modContent.sectionActions.submitLayout")}</button>
      </header>

      {error ? <p className="mt-5 rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{error}</p> : null}
      {section ? <>
        <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
          {t(isAdvancement ? "modContent.sectionActions.advancementArrangeHint" : "modContent.sectionActions.arrangeHint")}
        </p>
        {isAdvancement
          ? <AdvancementLayoutEditor
            defaultLocale={section.defaultLocale}
            dragged={draggedAdvancement}
            layouts={advancementLayouts}
            linkParent={linkParent}
            locale={locale}
            resources={resources}
            onDrag={setDraggedAdvancement}
            onLayoutsChange={setAdvancementLayouts}
            onLinkParentChange={setLinkParent}
            onError={setError}
          />
          : <CategoryLayoutEditor
            categories={categories}
            categoryLocale={categoryLocale}
            defaultLocale={section.defaultLocale}
            depthByID={depthByID}
            draggedResource={draggedResource}
            locale={locale}
            newCategoryName={newCategoryName}
            newCategoryParent={newCategoryParent}
            resources={resources}
            root={section}
            onCategoriesChange={setCategories}
            onCategoryLocaleChange={setCategoryLocale}
            onDraggedResourceChange={setDraggedResource}
            onNewCategoryNameChange={setNewCategoryName}
            onNewCategoryParentChange={setNewCategoryParent}
            onResourcesChange={setResources}
          />}
        <label className="mt-6 grid gap-2 text-sm font-bold">
          <span>{t("modContent.reason")}</span>
          <input className="field" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <footer className="mt-6 flex justify-end gap-2 border-t border-[var(--line)] pt-5">
          <button className="button-secondary" disabled={busy} type="button" onClick={closeEditor}>{t("common.cancel")}</button>
          <button className="button-primary" disabled={busy || !loadedComplete} type="button" onClick={() => void save()}>{t("modContent.sectionActions.submitLayout")}</button>
        </footer>
      </> : null}
    </div>
  </main>;
}

function CategoryLayoutEditor({
  root,
  categories,
  resources,
  locale,
  defaultLocale,
  categoryLocale,
  newCategoryName,
  newCategoryParent,
  draggedResource,
  depthByID,
  onCategoriesChange,
  onResourcesChange,
  onCategoryLocaleChange,
  onNewCategoryNameChange,
  onNewCategoryParentChange,
  onDraggedResourceChange,
}: {
  root: ModContentSection;
  categories: ModContentSection[];
  resources: ModContentSectionResource[];
  locale: string;
  defaultLocale: string;
  categoryLocale: string;
  newCategoryName: string;
  newCategoryParent: string;
  draggedResource: string;
  depthByID: Map<string, number>;
  onCategoriesChange: (value: ModContentSection[]) => void;
  onResourcesChange: (value: ModContentSectionResource[]) => void;
  onCategoryLocaleChange: (value: string) => void;
  onNewCategoryNameChange: (value: string) => void;
  onNewCategoryParentChange: (value: string) => void;
  onDraggedResourceChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const orderedSections = [root, ...flattenCategoryTree(root.publicId, categories)];

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const publicId = `new_${crypto.randomUUID()}`;
    const siblings = categories.filter((item) => item.parentPublicId === newCategoryParent);
    onCategoriesChange([...categories, {
      ...root,
      publicId,
      parentPublicId: newCategoryParent,
      defaultLocale: categoryLocale,
      ordinal: siblings.length,
      localizations: [{ locale: categoryLocale, name, summary: "", contentMarkdown: "" }],
      resourceCount: 0,
      publishedRevisionId: undefined,
    }]);
    onNewCategoryNameChange("");
  }

  function deleteCategory(category: ModContentSection) {
    const parentID = category.parentPublicId || root.publicId;
    onCategoriesChange(normalizeCategoryOrdinals(categories
      .filter((item) => item.publicId !== category.publicId)
      .map((item) => item.parentPublicId === category.publicId ? { ...item, parentPublicId: parentID } : item)));
    onResourcesChange(normalizeResourceOrdinals(resources.map((item) => item.sectionPublicId === category.publicId ? { ...item, sectionPublicId: parentID } : item)));
  }

  function updateCategory(categoryID: string, updates: Partial<ModContentSection>) {
    onCategoriesChange(categories.map((item) => item.publicId === categoryID ? { ...item, ...updates } : item));
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
    onCategoriesChange(normalizeCategoryOrdinals(categories.map((item) => item.publicId === category.publicId
      ? { ...item, ordinal: target.ordinal }
      : item.publicId === target.publicId ? { ...item, ordinal: category.ordinal } : item)));
  }

  function dropResource(targetSectionID: string, beforeResourceID = "") {
    if (!draggedResource) return;
    if (beforeResourceID === draggedResource) {
      onDraggedResourceChange("");
      return;
    }
    const moving = resources.find((item) => item.resourcePublicId === draggedResource);
    if (!moving) return;
    const without = resources.filter((item) => item.resourcePublicId !== draggedResource);
    const targetItems = without.filter((item) => item.sectionPublicId === targetSectionID).sort((a, b) => a.ordinal - b.ordinal).map((item) => ({ ...item }));
    const foundIndex = beforeResourceID ? targetItems.findIndex((item) => item.resourcePublicId === beforeResourceID) : -1;
    const index = foundIndex >= 0 ? foundIndex : targetItems.length;
    targetItems.splice(index, 0, { ...moving, sectionPublicId: targetSectionID });
    targetItems.forEach((item, itemIndex) => { item.ordinal = itemIndex; });
    onResourcesChange(normalizeResourceOrdinals([
      ...without.filter((item) => item.sectionPublicId !== targetSectionID),
      ...targetItems,
    ]));
    onDraggedResourceChange("");
  }

  function moveResource(resourceID: string, delta: number) {
    const resource = resources.find((item) => item.resourcePublicId === resourceID);
    if (!resource) return;
    const sectionID = resource.sectionPublicId || root.publicId;
    const siblings = resources.filter((item) => (item.sectionPublicId || root.publicId) === sectionID).sort((a, b) => a.ordinal - b.ordinal);
    const index = siblings.findIndex((item) => item.resourcePublicId === resourceID);
    const target = siblings[index + delta];
    if (!target) return;
    onResourcesChange(normalizeResourceOrdinals(resources.map((item) => item.resourcePublicId === resourceID
      ? { ...item, ordinal: target.ordinal }
      : item.resourcePublicId === target.resourcePublicId ? { ...item, ordinal: resource.ordinal } : item)));
  }

  function moveResourceToCategory(resourceID: string, targetSectionID: string) {
    const targetOrdinal = resources.filter((item) => (item.sectionPublicId || root.publicId) === targetSectionID).length;
    onResourcesChange(normalizeResourceOrdinals(resources.map((item) => item.resourcePublicId === resourceID
      ? { ...item, sectionPublicId: targetSectionID, ordinal: targetOrdinal }
      : item)));
  }

  return <>
    <div className="mt-5 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)] p-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.language")}</span><select className="field" value={categoryLocale} onChange={(event) => onCategoryLocaleChange(event.target.value)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.newCategoryName")}</span><input className="field" value={newCategoryName} onChange={(event) => onNewCategoryNameChange(event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.parentCategory")}</span><select className="field" value={newCategoryParent} onChange={(event) => onNewCategoryParentChange(event.target.value)}><option value={root.publicId}>{t("modContent.sectionActions.rootCategory")}</option>{categories.filter((item) => (depthByID.get(item.publicId) || 0) < 4).map((item) => <option key={item.publicId} value={item.publicId}>{categoryName(item, categoryLocale)}</option>)}</select></label>
      <button className="button-primary lg:col-span-3" disabled={!newCategoryName.trim()} type="button" onClick={addCategory}>{t("modContent.sectionActions.createCategory")}</button>
    </div>
    <div className="mt-5 grid gap-3">
      {orderedSections.map((category) => {
        const entries = resources.filter((item) => (item.sectionPublicId || root.publicId) === category.publicId).sort((a, b) => a.ordinal - b.ordinal);
        const isRoot = category.publicId === root.publicId;
        const descendantIDs = isRoot ? new Set<string>() : descendantsOf(category.publicId, categories);
        const possibleParents = [root, ...categories].filter((item) => item.publicId !== category.publicId && !descendantIDs.has(item.publicId) && (depthByID.get(item.publicId) || 0) < 4);
        return <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3" key={category.publicId} style={{ marginInlineStart: `${isRoot ? 0 : Math.min(4, depthByID.get(category.publicId) || 1) * 18}px` }} onDragOver={(event) => event.preventDefault()} onDrop={() => dropResource(category.publicId)}>
          <header className="flex flex-wrap items-center gap-2">
            {isRoot ? <strong className="min-w-0 flex-1">{t("modContent.sectionActions.rootCategory")}</strong> : <input aria-label={`${t("modContent.sectionActions.name")}: ${categoryName(category, categoryLocale)}`} className="field min-w-44 flex-1 py-2 font-bold" value={categoryName(category, categoryLocale)} onChange={(event) => updateCategoryName(category, event.target.value)} />}
            {!isRoot ? <><select aria-label={t("modContent.sectionActions.parentCategory")} className="field w-auto py-2 text-sm" value={category.parentPublicId} onChange={(event) => onCategoriesChange(normalizeCategoryOrdinals(categories.map((item) => item.publicId === category.publicId ? { ...item, parentPublicId: event.target.value } : item)))}>{possibleParents.map((item) => <option key={item.publicId} value={item.publicId}>{item.publicId === root.publicId ? t("modContent.sectionActions.rootCategory") : categoryName(item, categoryLocale)}</option>)}</select><button className="button-secondary px-3" type="button" onClick={() => moveCategory(category, -1)}>↑</button><button className="button-secondary px-3" type="button" onClick={() => moveCategory(category, 1)}>↓</button><button className="button-secondary px-3 text-[var(--red)]" type="button" onClick={() => deleteCategory(category)}>{t("common.delete")}</button></> : null}
          </header>
          <div className="mt-3 flex min-h-20 flex-wrap content-start gap-2 rounded-lg border border-dashed border-[var(--line)] p-2">
            {entries.map((resource, index) => <ResourceChip
              categories={orderedSections}
              defaultLocale={defaultLocale}
              dragged={draggedResource === resource.resourcePublicId}
              key={resource.resourcePublicId}
              locale={locale}
              resource={resource}
              canMoveDown={index < entries.length - 1}
              canMoveUp={index > 0}
              onCategoryChange={(targetSectionID) => moveResourceToCategory(resource.resourcePublicId, targetSectionID)}
              onDragStart={(event) => { onDraggedResourceChange(resource.resourcePublicId); event.dataTransfer.effectAllowed = "move"; }}
              onMove={(delta) => moveResource(resource.resourcePublicId, delta)}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); dropResource(category.publicId, resource.resourcePublicId); }}
            />)}
            {!entries.length ? <span className="m-auto text-sm text-[var(--muted)]">{t("modContent.sectionActions.dropHere")}</span> : null}
          </div>
        </section>;
      })}
    </div>
  </>;
}

function AdvancementLayoutEditor({
  resources,
  layouts,
  locale,
  defaultLocale,
  linkParent,
  dragged,
  onLayoutsChange,
  onLinkParentChange,
  onDrag,
  onError,
}: {
  resources: ModContentSectionResource[];
  layouts: AdvancementLayouts;
  locale: string;
  defaultLocale: string;
  linkParent: string;
  dragged?: DraggedAdvancement;
  onLayoutsChange: (value: AdvancementLayouts) => void;
  onLinkParentChange: (value: string) => void;
  onDrag: (value: DraggedAdvancement | undefined) => void;
  onError: (value: string) => void;
}) {
  const { t } = useI18n();
  const positions = resources.map((resource) => ({ resource, layout: layouts[resource.resourcePublicId] })).filter((item) => item.layout);
  const minX = Math.min(0, ...positions.map((item) => item.layout.x));
  const minY = Math.min(0, ...positions.map((item) => item.layout.y));
  const offsetX = -minX + 0.25;
  const offsetY = -minY + 0.25;
  const pointByID = new Map(positions.map((item) => [item.resource.resourcePublicId, {
    x: (item.layout.x + offsetX) * advancementColumnWidth + 24,
    y: (item.layout.y + offsetY) * advancementRowHeight + 24,
  }]));
  const width = Math.max(1100, ...[...pointByID.values()].map((point) => point.x + advancementNodeWidth + 80));
  const height = Math.max(620, ...[...pointByID.values()].map((point) => point.y + advancementNodeHeight + 80));

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, resourcePublicId: string) {
    if (event.button !== 0) return;
    const layout = layouts[resourcePublicId];
    if (!layout) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onDrag({
      resourcePublicId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: layout.x,
      startY: layout.y,
    });
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragged || dragged.pointerId !== event.pointerId) return;
    const x = roundGraphCoordinate(dragged.startX + (event.clientX - dragged.startClientX) / advancementColumnWidth);
    const y = roundGraphCoordinate(dragged.startY + (event.clientY - dragged.startClientY) / advancementRowHeight);
    onLayoutsChange({
      ...layouts,
      [dragged.resourcePublicId]: { ...layouts[dragged.resourcePublicId], x, y },
    });
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragged || dragged.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onDrag(undefined);
  }

  function connect(childResourcePublicId: string) {
    if (!linkParent || linkParent === childResourcePublicId || createsAdvancementCycle(layouts, linkParent, childResourcePublicId)) {
      onError(t("modContent.sectionActions.invalidAdvancementLink"));
      return;
    }
    onError("");
    onLayoutsChange({
      ...layouts,
      [childResourcePublicId]: {
        ...layouts[childResourcePublicId],
        parentResourcePublicId: linkParent,
      },
    });
    onLinkParentChange("");
  }

  return <div className="mt-5">
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm">
      <strong>{linkParent ? t("modContent.sectionActions.advancementParentSelected") : t("modContent.sectionActions.advancementLinkIdle")}</strong>
      {linkParent ? <><code className="text-xs text-[var(--muted)]">{resources.find((item) => item.resourcePublicId === linkParent)?.canonicalId}</code><button className="button-secondary px-3 py-1" type="button" onClick={() => onLinkParentChange("")}>{t("common.cancel")}</button></> : null}
    </div>
    <div className="overflow-auto rounded-xl border border-[var(--line)] bg-[#26231e] shadow-inner">
      <div className="relative" style={{ width, height, backgroundImage: "linear-gradient(#ffffff09 1px, transparent 1px), linear-gradient(90deg, #ffffff09 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
        <svg className="pointer-events-none absolute inset-0" height={height} width={width}>
          {positions.map(({ resource, layout }) => {
            const child = pointByID.get(resource.resourcePublicId);
            const parent = pointByID.get(layout.parentResourcePublicId);
            if (!child || !parent) return null;
            const parentX = parent.x + advancementNodeWidth;
            const parentY = parent.y + advancementNodeHeight / 2;
            const childX = child.x;
            const childY = child.y + advancementNodeHeight / 2;
            const middleX = (parentX + childX) / 2;
            return <path d={`M ${parentX} ${parentY} C ${middleX} ${parentY}, ${middleX} ${childY}, ${childX} ${childY}`} fill="none" key={resource.resourcePublicId} stroke="#66d9ad" strokeWidth="3" />;
          })}
        </svg>
        {positions.map(({ resource, layout }) => {
          const point = pointByID.get(resource.resourcePublicId)!;
          const iconURL = resourceIconURL(resource);
          const selected = linkParent === resource.resourcePublicId;
          return <article
            className={`absolute overflow-hidden rounded-lg border-2 bg-[var(--panel)] text-[var(--foreground)] shadow-lg ${selected ? "border-[var(--accent)] ring-4 ring-[var(--accent-soft)]" : "border-[#777064]"}`}
            key={resource.resourcePublicId}
            style={{ left: point.x, top: point.y, width: advancementNodeWidth, minHeight: advancementNodeHeight }}
          >
            <div
              className="flex touch-none cursor-grab items-center gap-2 border-b border-[var(--line)] px-2 py-2 active:cursor-grabbing"
              onPointerDown={(event) => beginDrag(event, resource.resourcePublicId)}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              {iconURL ? <Image unoptimized alt="" className="h-8 w-8 shrink-0 object-contain [image-rendering:pixelated]" height={32} src={iconURL} width={32} /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--panel-subtle)]">?</span>}
              <span className="min-w-0"><strong className="block truncate text-sm">{resourceName(resource, locale, defaultLocale)}</strong><code className="block truncate text-[10px] text-[var(--muted)]">{resource.canonicalId}</code></span>
            </div>
            <div className="flex flex-wrap gap-1 p-2">
              <button className="button-secondary px-2 py-1 text-xs" type="button" onClick={() => onLinkParentChange(selected ? "" : resource.resourcePublicId)}>
                {t(selected ? "common.cancel" : "modContent.sectionActions.selectAdvancementParent")}
              </button>
              {linkParent && !selected ? <button className="button-primary px-2 py-1 text-xs" type="button" onClick={() => connect(resource.resourcePublicId)}>{t("modContent.sectionActions.connectAdvancementHere")}</button> : null}
              {layout.parentResourcePublicId ? <button className="button-secondary px-2 py-1 text-xs text-[var(--red)]" type="button" onClick={() => onLayoutsChange({ ...layouts, [resource.resourcePublicId]: { ...layout, parentResourcePublicId: "" } })}>{t("modContent.sectionActions.unlinkAdvancement")}</button> : null}
            </div>
          </article>;
        })}
      </div>
    </div>
  </div>;
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
    <select aria-label={t("modContent.sectionActions.moveToCategory")} className="field py-1 text-xs" value={resource.sectionPublicId} onChange={(event) => onCategoryChange(event.target.value)}>
      {categories.map((category, index) => <option key={category.publicId} value={category.publicId}>{index === 0 ? t("modContent.sectionActions.rootCategory") : categoryName(category, locale)}</option>)}
    </select>
    <div className="flex gap-1">
      <button aria-label={t("modContent.sectionActions.moveUp")} className="button-secondary px-2 py-1" disabled={!canMoveUp} type="button" onClick={() => onMove(-1)}>↑</button>
      <button aria-label={t("modContent.sectionActions.moveDown")} className="button-secondary px-2 py-1" disabled={!canMoveDown} type="button" onClick={() => onMove(1)}>↓</button>
    </div>
  </div>;
}

function createAdvancementLayouts(resources: ModContentSectionResource[]): AdvancementLayouts {
  const publicIDByCanonicalID = new Map(resources.map((resource) => [resource.canonicalId || "", resource.resourcePublicId]));
  const layouts: AdvancementLayouts = {};
  resources.forEach((resource, index) => {
    const display = record(record(resource.definition).display);
    const parentCanonicalID = stringValue(record(resource.definition).parent);
    layouts[resource.resourcePublicId] = {
      parentResourcePublicId: publicIDByCanonicalID.get(parentCanonicalID) || "",
      x: finiteCoordinate(display.x, index % 5),
      y: finiteCoordinate(display.y, Math.floor(index / 5)),
    };
  });
  return layouts;
}

function createsAdvancementCycle(layouts: AdvancementLayouts, parentResourcePublicId: string, childResourcePublicId: string) {
  let current = parentResourcePublicId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    if (current === childResourcePublicId) return true;
    visited.add(current);
    current = layouts[current]?.parentResourcePublicId || "";
  }
  return false;
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

function localizedSectionName(section: ModContentSection, locale: string) {
  const normalized = normalizeContentLanguage(locale);
  return section.localizations.find((item) => normalizeContentLanguage(item.locale) === normalized)?.name
    || section.localizations.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(section.defaultLocale))?.name
    || section.localizations[0]?.name
    || section.templateCode;
}

function resourceIconURL(resource: ModContentSectionResource) {
  if (resource.iconFileId) return modContentResourceAssetURL(resource.resourcePublicId, resource.versionPublicId, "icon");
  return resource.revisionId && resource.iconPath ? modExportAssetURL(resource.revisionId, resource.iconPath) : "";
}

function finiteCoordinate(value: unknown, fallback: number) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function roundGraphCoordinate(value: number) {
  return Math.round(Math.max(-100, Math.min(100, value)) * 10) / 10;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
