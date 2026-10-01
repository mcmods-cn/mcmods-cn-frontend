"use client";

import Image from "next/image";
import {
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { advancementConnectedGroups } from "../_lib/advancement-graph";
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
import { clusterSimilarResources } from "../_lib/similar-resource-groups";
import { LoginRequiredState } from "./page-feedback";

type AdvancementNodeLayout = {
  parentResourcePublicId: string;
  groupId: string;
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
  startPositions: Record<string, { x: number; y: number }>;
};

type AdvancementGroupSelection = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
};

type AdvancementPortSide = "input" | "output";

type DraggedAdvancementLink = {
  resourcePublicId: string;
  side: AdvancementPortSide;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
};

const advancementColumnWidth = 280;
const advancementRowHeight = 132;
const advancementNodeWidth = 240;
const advancementNodeHeight = 96;

export function ModContentLayoutEditorPage(props: { siteId: string; sectionId: string }) {
  const { user } = useAuthSnapshot();
  return <ModContentLayoutEditorWorkspace key={JSON.stringify([props.siteId, props.sectionId, user?.id])} {...props} />;
}

function ModContentLayoutEditorWorkspace({ siteId, sectionId }: { siteId: string; sectionId: string }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const tokenRef = useRef(token);
  const [initialLocale] = useState(locale);
  const [section, setSection] = useState<ModContentSection>();
  const [categories, setCategories] = useState<ModContentSection[]>([]);
  const [resources, setResources] = useState<ModContentSectionResource[]>([]);
  const [advancementLayouts, setAdvancementLayouts] = useState<AdvancementLayouts>({});
  const [advancementHistory, setAdvancementHistory] = useState<AdvancementLayouts[]>([]);
  const [draggedResource, setDraggedResource] = useState("");
  const [draggedAdvancement, setDraggedAdvancement] = useState<DraggedAdvancement>();
  const [categoryLocale, setCategoryLocale] = useState<string>(locale);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState(sectionId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(true);
  const [loadedComplete, setLoadedComplete] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    void loadAllModContentSectionResources(siteId, sectionId, { locale: initialLocale }, tokenRef.current)
      .then((page) => {
        if (cancelled) return;
        setSection(page.section);
        setCategories(page.categories || []);
        setResources(page.items);
        setAdvancementLayouts(createAdvancementLayouts(page.items));
        setAdvancementHistory([]);
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
  }, [initialLocale, ready, reload, sectionId, siteId, token]);

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

  function commitAdvancementLayouts(next: AdvancementLayouts, previous = advancementLayouts) {
    if (sameAdvancementLayouts(next, previous)) {
      setAdvancementLayouts(next);
      return;
    }
    setAdvancementHistory((history) => [...history, cloneAdvancementLayouts(previous)].slice(-50));
    setAdvancementLayouts(next);
    setError("");
  }

  function undoAdvancementLayout() {
    const previous = advancementHistory.at(-1);
    if (!previous) return;
    setAdvancementLayouts(cloneAdvancementLayouts(previous));
    setAdvancementHistory((history) => history.slice(0, -1));
    setDraggedAdvancement(undefined);
    setError("");
  }

  async function save() {
    if (busy) return;
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
        displayMode: section.displayMode,
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
          similarGroupId: resource.similarGroupId || undefined,
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

  if (ready && !token) return <LoginRequiredState nextPath={`/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(sectionId)}/arrange`} />;
  if (!ready || (!section && busy)) {
    return <main className="grid min-h-screen place-items-center bg-[var(--background)] p-6 text-[var(--foreground)]">
      <p className="text-[var(--muted)]">{t("common.loading")}</p>
    </main>;
  }

  if (!loadedComplete) return <main className="grid min-h-screen place-items-center p-6"><section role="alert"><p>{error || t("modContent.sectionActions.incompleteLayout")}</p><button className="button-secondary focus-ring mt-4" type="button" onClick={() => { setError(""); setBusy(true); setReload((current) => current + 1); }}>{t("common.retry")}</button></section></main>;
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
            canUndo={advancementHistory.length > 0}
            defaultLocale={section.defaultLocale}
            dragged={draggedAdvancement}
            layouts={advancementLayouts}
            locale={locale}
            resources={resources}
            onDrag={setDraggedAdvancement}
            onLayoutsCommit={commitAdvancementLayouts}
            onLayoutsPreview={setAdvancementLayouts}
            onUndo={undoAdvancementLayout}
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
  const [selectedResourceIDs, setSelectedResourceIDs] = useState<Set<string>>(new Set());
  const [batchTargetSectionID, setBatchTargetSectionID] = useState(root.publicId);
  const [keywordByCategory, setKeywordByCategory] = useState<Record<string, string>>({});
  const [draggedCategoryID, setDraggedCategoryID] = useState("");
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
    const existing = category.localizations.find((item) => normalizeContentLanguage(item.locale) === normalizedLocale);
    const values = category.localizations.filter((item) => normalizeContentLanguage(item.locale) !== normalizedLocale);
    updateCategory(category.publicId, { localizations: [...values, { ...existing, locale: categoryLocale, name: value, summary: existing?.summary || "", contentMarkdown: existing?.contentMarkdown || "" }] });
  }

  function reparentCategory(categoryID: string, parentID: string) {
    if (!categoryID || categoryID === parentID) return;
    if (descendantsOf(categoryID, categories).has(parentID)) return;
    const next = normalizeCategoryOrdinals(categories.map((item) => item.publicId === categoryID
      ? { ...item, parentPublicId: parentID }
      : item));
    if ([...categoryDepths(root.publicId, next).values()].some((depth) => depth > 4)) return;
    onCategoriesChange(next);
    setDraggedCategoryID("");
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

  function dropResource(targetSectionID: string) {
    if (!draggedResource) return;
    const moving = resources.find((item) => item.resourcePublicId === draggedResource);
    if (!moving) return;
    const without = resources.filter((item) => item.resourcePublicId !== draggedResource);
    const targetItems = without.filter((item) => item.sectionPublicId === targetSectionID).sort((a, b) => a.ordinal - b.ordinal).map((item) => ({ ...item }));
    targetItems.push({ ...moving, sectionPublicId: targetSectionID });
    targetItems.forEach((item, itemIndex) => { item.ordinal = itemIndex; });
    onResourcesChange(normalizeSimilarResourceGroups(normalizeResourceOrdinals([
      ...without.filter((item) => item.sectionPublicId !== targetSectionID),
      ...targetItems,
    ])));
    onDraggedResourceChange("");
  }

  function groupResources(targetResourceID: string) {
    if (!draggedResource || draggedResource === targetResourceID) return;
    const source = resources.find((item) => item.resourcePublicId === draggedResource);
    const target = resources.find((item) => item.resourcePublicId === targetResourceID);
    if (!source || !target) return;
    const groupID = target.similarGroupId || `new_${crypto.randomUUID()}`;
    const targetSectionID = target.sectionPublicId || root.publicId;
    const next = resources.map((item) => item.resourcePublicId === source.resourcePublicId
      ? { ...item, sectionPublicId: targetSectionID, ordinal: target.ordinal + 1, similarGroupId: groupID }
      : item.resourcePublicId === target.resourcePublicId ? { ...item, similarGroupId: groupID } : item);
    onResourcesChange(normalizeSimilarResourceGroups(normalizeResourceOrdinals(next)));
    onDraggedResourceChange("");
  }

  function dissolveSimilarGroup(groupID: string) {
    onResourcesChange(resources.map((item) => item.similarGroupId === groupID ? { ...item, similarGroupId: "" } : item));
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
    onResourcesChange(normalizeSimilarResourceGroups(normalizeResourceOrdinals(resources.map((item) => item.resourcePublicId === resourceID
      ? { ...item, sectionPublicId: targetSectionID, ordinal: targetOrdinal }
      : item))));
  }

  function moveResourcesToCategory(resourceIDs: ReadonlySet<string>, targetSectionID: string) {
    if (!resourceIDs.size) return;
    const moving = resources.filter((item) => resourceIDs.has(item.resourcePublicId));
    if (!moving.length) return;
    const remaining = resources.filter((item) => !resourceIDs.has(item.resourcePublicId));
    const targetItems = remaining
      .filter((item) => (item.sectionPublicId || root.publicId) === targetSectionID)
      .sort((left, right) => left.ordinal - right.ordinal);
    onResourcesChange(normalizeSimilarResourceGroups(normalizeResourceOrdinals([
      ...remaining.filter((item) => (item.sectionPublicId || root.publicId) !== targetSectionID),
      ...targetItems,
      ...moving.map((item, index) => ({ ...item, sectionPublicId: targetSectionID, ordinal: targetItems.length + index })),
    ])));
    setSelectedResourceIDs(new Set());
  }

  function classifyByKeyword(targetSectionID: string) {
    const keyword = (keywordByCategory[targetSectionID] || "").trim().toLocaleLowerCase(locale);
    if (!keyword) return;
    const matches = new Set(resources.filter((resource) => resourceSearchNames(resource, locale, defaultLocale)
      .some((name) => name.toLocaleLowerCase(locale).includes(keyword))).map((resource) => resource.resourcePublicId));
    moveResourcesToCategory(matches, targetSectionID);
  }

  return <>
    <div className="mt-5 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)] p-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.language")}</span><select className="field" value={categoryLocale} onChange={(event) => onCategoryLocaleChange(event.target.value)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.newCategoryName")}</span><input className="field" value={newCategoryName} onChange={(event) => onNewCategoryNameChange(event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-bold"><span>{t("modContent.sectionActions.parentCategory")}</span><select className="field" value={newCategoryParent} onChange={(event) => onNewCategoryParentChange(event.target.value)}><option value={root.publicId}>{t("modContent.sectionActions.rootCategory")}</option>{categories.filter((item) => (depthByID.get(item.publicId) || 0) < 4).map((item) => <option key={item.publicId} value={item.publicId}>{categoryName(item, categoryLocale)}</option>)}</select></label>
      <button className="button-primary lg:col-span-3" disabled={!newCategoryName.trim()} type="button" onClick={addCategory}>{t("modContent.sectionActions.createCategory")}</button>
    </div>
    <CategoryRelationshipEditor
      categories={categories}
      draggedCategoryID={draggedCategoryID}
      locale={categoryLocale}
      root={root}
      onDragChange={setDraggedCategoryID}
      onReparent={reparentCategory}
    />
    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <strong className="mr-auto self-center text-sm">{t("modContent.sectionActions.selectedResources", { count: selectedResourceIDs.size })}</strong>
      <button className="button-secondary px-3 py-2 text-sm" type="button" onClick={() => setSelectedResourceIDs(new Set(resources.map((resource) => resource.resourcePublicId)))}>{t("modContent.sectionActions.selectAllResources")}</button>
      <button className="button-secondary px-3 py-2 text-sm" disabled={!selectedResourceIDs.size} type="button" onClick={() => setSelectedResourceIDs(new Set())}>{t("modContent.sectionActions.clearResourceSelection")}</button>
      <select className="field w-auto min-w-48 py-2 text-sm" value={batchTargetSectionID} onChange={(event) => setBatchTargetSectionID(event.target.value)}>{orderedSections.map((category, index) => <option key={category.publicId} value={category.publicId}>{index === 0 ? t("modContent.sectionActions.rootCategory") : categoryName(category, categoryLocale)}</option>)}</select>
      <button className="button-primary px-3 py-2 text-sm" disabled={!selectedResourceIDs.size} type="button" onClick={() => moveResourcesToCategory(selectedResourceIDs, batchTargetSectionID)}>{t("modContent.sectionActions.moveSelectedResources")}</button>
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
            {!isRoot ? <><select aria-label={t("modContent.sectionActions.parentCategory")} className="field w-auto py-2 text-sm" value={category.parentPublicId} onChange={(event) => reparentCategory(category.publicId, event.target.value)}>{possibleParents.map((item) => <option key={item.publicId} value={item.publicId}>{item.publicId === root.publicId ? t("modContent.sectionActions.rootCategory") : categoryName(item, categoryLocale)}</option>)}</select><button className="button-secondary px-3" type="button" onClick={() => moveCategory(category, -1)}>↑</button><button className="button-secondary px-3" type="button" onClick={() => moveCategory(category, 1)}>↓</button><button className="button-secondary px-3 text-[var(--red)]" type="button" onClick={() => deleteCategory(category)}>{t("common.delete")}</button></> : null}
          </header>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input aria-label={t("modContent.sectionActions.keywordClassification")} className="field min-w-0 flex-1 py-2 text-sm" placeholder={t("modContent.sectionActions.keywordPlaceholder")} value={keywordByCategory[category.publicId] || ""} onChange={(event) => setKeywordByCategory((current) => ({ ...current, [category.publicId]: event.target.value }))} />
            <button className="button-secondary shrink-0 px-3 py-2 text-sm" disabled={!(keywordByCategory[category.publicId] || "").trim()} type="button" onClick={() => classifyByKeyword(category.publicId)}>{t("modContent.sectionActions.keywordClassification")}</button>
          </div>
          <div className="mt-3 flex min-h-20 flex-wrap content-start gap-2 rounded-lg border border-dashed border-[var(--line)] p-2">
            {clusterSimilarResources(entries, (resource) => resource.similarGroupId).map((cluster) => {
              const groupID = cluster.length > 1 ? cluster[0].similarGroupId || "" : "";
              const chips = cluster.map((resource) => {
                const index = entries.findIndex((item) => item.resourcePublicId === resource.resourcePublicId);
                return <ResourceChip
                  categories={orderedSections}
                  defaultLocale={defaultLocale}
                  dragged={draggedResource === resource.resourcePublicId}
                  key={resource.resourcePublicId}
                  locale={locale}
                  resource={resource}
                  selected={selectedResourceIDs.has(resource.resourcePublicId)}
                  canMoveDown={index < entries.length - 1}
                  canMoveUp={index > 0}
                  onCategoryChange={(targetSectionID) => moveResourceToCategory(resource.resourcePublicId, targetSectionID)}
                  onDragStart={(event) => { onDraggedResourceChange(resource.resourcePublicId); event.dataTransfer.effectAllowed = "move"; }}
                  onMove={(delta) => moveResource(resource.resourcePublicId, delta)}
                  onSelectedChange={(selected) => setSelectedResourceIDs((current) => {
                    const next = new Set(current);
                    if (selected) next.add(resource.resourcePublicId); else next.delete(resource.resourcePublicId);
                    return next;
                  })}
                  onDrop={(event) => { event.preventDefault(); event.stopPropagation(); groupResources(resource.resourcePublicId); }}
                />;
              });
              if (!groupID) return chips[0];
              return <section className="min-w-0 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)]/30 p-2" key={groupID}>
                <header className="mb-2 flex items-center justify-between gap-3 px-1 text-xs font-black text-[var(--accent)]">
                  <span>{t("modContent.sectionActions.similarResourceGroup")}</span>
                  <button className="focus-ring rounded px-2 py-1 hover:bg-[var(--panel)]" type="button" onClick={() => dissolveSimilarGroup(groupID)}>{t("modContent.sectionActions.dissolveSimilarGroup")}</button>
                </header>
                <div className="grid gap-2">{chips}</div>
              </section>;
            })}
            {!entries.length ? <span className="m-auto text-sm text-[var(--muted)]">{t("modContent.sectionActions.dropHere")}</span> : null}
          </div>
        </section>;
      })}
    </div>
  </>;
}

function CategoryRelationshipEditor({ root, categories, locale, draggedCategoryID, onDragChange, onReparent }: {
  root: ModContentSection;
  categories: ModContentSection[];
  locale: string;
  draggedCategoryID: string;
  onDragChange: (value: string) => void;
  onReparent: (categoryID: string, parentID: string) => void;
}) {
  const { t } = useI18n();
  const childrenByParent = new Map<string, ModContentSection[]>();
  for (const category of categories) {
    childrenByParent.set(category.parentPublicId, [...(childrenByParent.get(category.parentPublicId) || []), category]);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.ordinal - right.ordinal || left.publicId.localeCompare(right.publicId));
  }

  const renderChildren = (parentID: string, depth: number): ReactNode => (childrenByParent.get(parentID) || []).map((category) => {
    const childCount = childrenByParent.get(category.publicId)?.length || 0;
    return <div className="relative ml-5 border-l border-[var(--line)] pl-5" key={category.publicId}>
      <span aria-hidden="true" className="absolute left-0 top-6 w-5 border-t border-[var(--line)]" />
      <article
        className={`my-2 flex min-w-56 cursor-grab items-center gap-3 rounded-lg border px-3 py-2 active:cursor-grabbing ${draggedCategoryID === category.publicId ? "border-[var(--accent)] bg-[var(--accent-soft)] opacity-60" : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]"}`}
        draggable
        onDragEnd={() => onDragChange("")}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={(event) => { onDragChange(category.publicId); event.dataTransfer.effectAllowed = "move"; }}
        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onReparent(draggedCategoryID, category.publicId); }}
      >
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] font-black text-[var(--accent)]">{depth + 1}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate">{categoryName(category, locale)}</strong><small className="text-[var(--muted)]">{t("modContent.sectionActions.childCategoryCount", { count: childCount })}</small></span>
      </article>
      {renderChildren(category.publicId, depth + 1)}
    </div>;
  });

  return <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
    <header><h2 className="font-black">{t("modContent.sectionActions.categoryRelationshipTitle")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("modContent.sectionActions.categoryRelationshipHint")}</p></header>
    <div className="mt-4 overflow-x-auto pb-2">
      <div className="min-w-max">
        <article
          className="flex min-w-72 items-center gap-3 rounded-lg border-2 border-[var(--accent)] bg-[var(--panel)] px-4 py-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); onReparent(draggedCategoryID, root.publicId); }}
        >
          <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] font-black text-white">0</span>
          <span><strong className="block">{t("modContent.sectionActions.rootCategory")}</strong><small className="text-[var(--muted)]">{t("modContent.sectionActions.dropCategoryHere")}</small></span>
        </article>
        <div className="mt-1">{renderChildren(root.publicId, 0)}</div>
      </div>
    </div>
  </section>;
}

function AdvancementLayoutEditor({
  resources,
  layouts,
  locale,
  defaultLocale,
  dragged,
  canUndo,
  onLayoutsPreview,
  onLayoutsCommit,
  onUndo,
  onDrag,
  onError,
}: {
  resources: ModContentSectionResource[];
  layouts: AdvancementLayouts;
  locale: string;
  defaultLocale: string;
  dragged?: DraggedAdvancement;
  canUndo: boolean;
  onLayoutsPreview: (value: AdvancementLayouts) => void;
  onLayoutsCommit: (value: AdvancementLayouts, previous?: AdvancementLayouts) => void;
  onUndo: () => void;
  onDrag: (value: DraggedAdvancement | undefined) => void;
  onError: (value: string) => void;
}) {
  const { t } = useI18n();
  const [linkDrag, setLinkDrag] = useState<DraggedAdvancementLink>();
  const [keyboardPort, setKeyboardPort] = useState<{ resourcePublicId: string; side: AdvancementPortSide }>();
  const [selectedGroupIDs, setSelectedGroupIDs] = useState<Set<string>>(new Set());
  const [groupSelection, setGroupSelection] = useState<AdvancementGroupSelection>();
  const groupWorkspaceRef = useRef<HTMLDivElement>(null);
  const positions = resources.map((resource) => ({ resource, layout: layouts[resource.resourcePublicId] })).filter((item) => item.layout);
  const groups = advancementLayoutGroups(positions);

  function connect(parentResourcePublicId: string, childResourcePublicId: string) {
    if (!parentResourcePublicId || parentResourcePublicId === childResourcePublicId || createsAdvancementCycle(layouts, parentResourcePublicId, childResourcePublicId)) {
      onError(t("modContent.sectionActions.invalidAdvancementLink"));
      return;
    }
    const next = cloneAdvancementLayouts(layouts);
    const parent = next[parentResourcePublicId];
    const child = next[childResourcePublicId];
    if (parent.groupId !== child.groupId) {
      const offsetX = parent.x + 1 - child.x;
      const offsetY = parent.y - child.y;
      for (const publicID of advancementDescendantIDs(layouts, childResourcePublicId)) {
        next[publicID] = {
          ...next[publicID],
          groupId: parent.groupId,
          x: roundGraphCoordinate(next[publicID].x + offsetX),
          y: roundGraphCoordinate(next[publicID].y + offsetY),
        };
      }
    }
    next[childResourcePublicId] = {
      ...next[childResourcePublicId],
      parentResourcePublicId,
    };
    onError("");
    setKeyboardPort(undefined);
    onLayoutsCommit(next);
  }

  function activateKeyboardPort(resourcePublicId: string, side: AdvancementPortSide) {
    if (!keyboardPort || keyboardPort.side === side) {
      setKeyboardPort(keyboardPort?.resourcePublicId === resourcePublicId && keyboardPort.side === side
        ? undefined
        : { resourcePublicId, side });
      return;
    }
    const parentResourcePublicId = side === "output" ? resourcePublicId : keyboardPort.resourcePublicId;
    const childResourcePublicId = side === "input" ? resourcePublicId : keyboardPort.resourcePublicId;
    connect(parentResourcePublicId, childResourcePublicId);
  }

  function beginLinkDrag(event: ReactPointerEvent<HTMLButtonElement>, resourcePublicId: string, side: AdvancementPortSide) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const startClientX = bounds.left + bounds.width / 2;
    const startClientY = bounds.top + bounds.height / 2;
    event.currentTarget.setPointerCapture(event.pointerId);
    setKeyboardPort(undefined);
    setLinkDrag({
      resourcePublicId,
      side,
      pointerId: event.pointerId,
      startClientX,
      startClientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
    });
  }

  function moveLinkDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
    setLinkDrag({ ...linkDrag, currentClientX: event.clientX, currentClientY: event.clientY });
  }

  function finishLinkDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-advancement-port='true']");
    const targetResourcePublicId = target?.dataset.resourcePublicId || "";
    const targetSide = target?.dataset.portSide as AdvancementPortSide | undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setLinkDrag(undefined);
    if (!targetResourcePublicId || !targetSide || targetSide === linkDrag.side) return;
    const parentResourcePublicId = linkDrag.side === "output" ? linkDrag.resourcePublicId : targetResourcePublicId;
    const childResourcePublicId = linkDrag.side === "input" ? linkDrag.resourcePublicId : targetResourcePublicId;
    connect(parentResourcePublicId, childResourcePublicId);
  }

  function cancelLinkDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!linkDrag || linkDrag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setLinkDrag(undefined);
  }

  function beginGroupSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || linkDrag || (event.target instanceof Element && event.target.closest("article,button,input,select"))) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedGroupIDs(new Set());
    setGroupSelection({ pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, currentClientX: event.clientX, currentClientY: event.clientY });
  }

  function moveGroupSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (!groupSelection || groupSelection.pointerId !== event.pointerId) return;
    const next = { ...groupSelection, currentClientX: event.clientX, currentClientY: event.clientY };
    setGroupSelection(next);
    const selectionBounds = clientSelectionBounds(next);
    const selected = new Set<string>();
    groupWorkspaceRef.current?.querySelectorAll<HTMLElement>("[data-advancement-group-id]").forEach((element) => {
      if (rectanglesIntersect(selectionBounds, element.getBoundingClientRect())) selected.add(element.dataset.advancementGroupId || "");
    });
    selected.delete("");
    setSelectedGroupIDs(selected);
  }

  function finishGroupSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (!groupSelection || groupSelection.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setGroupSelection(undefined);
  }

  return <div className="mt-5">
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm">
      <strong className="min-w-0 flex-1">{t("modContent.sectionActions.advancementNodeLinkHint")}</strong>
      <button
        className="button-secondary focus-ring px-3 py-1.5"
        disabled={!canUndo}
        type="button"
        onClick={() => {
          setKeyboardPort(undefined);
          setLinkDrag(undefined);
          onUndo();
        }}
      >
        {t("modContent.sectionActions.undoAdvancementLayout")}
      </button>
    </div>
    <div ref={groupWorkspaceRef} className="relative space-y-4" onPointerCancel={finishGroupSelection} onPointerDown={beginGroupSelection} onPointerMove={moveGroupSelection} onPointerUp={finishGroupSelection}>
      {groups.map((group) => <AdvancementLayoutBoard
        defaultLocale={defaultLocale}
        dragged={dragged}
        group={group}
        keyboardPort={keyboardPort}
        key={group[0]?.layout.groupId}
        layouts={layouts}
        linkDrag={linkDrag}
        locale={locale}
        selectedGroupIDs={selectedGroupIDs}
        onBeginLinkDrag={beginLinkDrag}
        onCancelLinkDrag={cancelLinkDrag}
        onDrag={onDrag}
        onFinishLinkDrag={finishLinkDrag}
        onKeyboardPort={activateKeyboardPort}
        onLayoutsCommit={onLayoutsCommit}
        onLayoutsPreview={onLayoutsPreview}
        onMoveLinkDrag={moveLinkDrag}
        onUnlink={(childResourcePublicId) => onLayoutsCommit({
          ...layouts,
          [childResourcePublicId]: {
            ...layouts[childResourcePublicId],
            parentResourcePublicId: "",
          },
        })}
      />)}
      {groupSelection ? <div aria-hidden="true" className="pointer-events-none fixed z-[90] border border-[var(--accent)] bg-[var(--accent)]/15" style={clientSelectionStyle(groupSelection)} /> : null}
    </div>
    {linkDrag ? <svg aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] h-screen w-screen">
      <path
        d={advancementScreenLinkPath(linkDrag)}
        fill="none"
        stroke="#66d9ad"
        strokeDasharray="8 6"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg> : null}
  </div>;
}

type AdvancementPosition = {
  resource: ModContentSectionResource;
  layout: AdvancementNodeLayout;
};

function AdvancementLayoutBoard({
  group,
  layouts,
  locale,
  defaultLocale,
  dragged,
  linkDrag,
  keyboardPort,
  selectedGroupIDs,
  onLayoutsPreview,
  onLayoutsCommit,
  onDrag,
  onBeginLinkDrag,
  onMoveLinkDrag,
  onFinishLinkDrag,
  onCancelLinkDrag,
  onKeyboardPort,
  onUnlink,
}: {
  group: AdvancementPosition[];
  layouts: AdvancementLayouts;
  locale: string;
  defaultLocale: string;
  dragged?: DraggedAdvancement;
  linkDrag?: DraggedAdvancementLink;
  keyboardPort?: { resourcePublicId: string; side: AdvancementPortSide };
  selectedGroupIDs: ReadonlySet<string>;
  onLayoutsPreview: (value: AdvancementLayouts) => void;
  onLayoutsCommit: (value: AdvancementLayouts, previous?: AdvancementLayouts) => void;
  onDrag: (value: DraggedAdvancement | undefined) => void;
  onBeginLinkDrag: (event: ReactPointerEvent<HTMLButtonElement>, resourcePublicId: string, side: AdvancementPortSide) => void;
  onMoveLinkDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onFinishLinkDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCancelLinkDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyboardPort: (resourcePublicId: string, side: AdvancementPortSide) => void;
  onUnlink: (childResourcePublicId: string) => void;
}) {
  const { t } = useI18n();
  const groupId = group[0]?.layout.groupId || "";
  const minX = Math.min(0, ...group.map((item) => item.layout.x));
  const minY = Math.min(0, ...group.map((item) => item.layout.y));
  const offsetX = -minX + 0.25;
  const offsetY = -minY + 0.25;
  const pointByID = new Map(group.map((item) => [item.resource.resourcePublicId, {
    x: (item.layout.x + offsetX) * advancementColumnWidth + 24,
    y: (item.layout.y + offsetY) * advancementRowHeight + 24,
  }]));
  const width = Math.max(900, ...[...pointByID.values()].map((point) => point.x + advancementNodeWidth + 80));
  const height = Math.max(240, ...[...pointByID.values()].map((point) => point.y + advancementNodeHeight + 60));

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, resourcePublicId: string) {
    if (event.button !== 0 || linkDrag) return;
    const layout = layouts[resourcePublicId];
    if (!layout) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const selectedLayouts = selectedGroupIDs.has(groupId)
      ? Object.entries(layouts).filter(([, candidate]) => selectedGroupIDs.has(candidate.groupId))
      : [[resourcePublicId, layout] as const];
    onDrag({
      resourcePublicId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: layout.x,
      startY: layout.y,
      startPositions: Object.fromEntries(selectedLayouts.map(([publicID, candidate]) => [publicID, { x: candidate.x, y: candidate.y }])),
    });
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragged || dragged.pointerId !== event.pointerId) return;
    const deltaX = (event.clientX - dragged.startClientX) / advancementColumnWidth;
    const deltaY = (event.clientY - dragged.startClientY) / advancementRowHeight;
    const next = cloneAdvancementLayouts(layouts);
    for (const [publicID, start] of Object.entries(dragged.startPositions)) {
      next[publicID] = { ...next[publicID], x: roundGraphCoordinate(start.x + deltaX), y: roundGraphCoordinate(start.y + deltaY) };
    }
    onLayoutsPreview(next);
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragged || dragged.pointerId !== event.pointerId) return;
    const previous = cloneAdvancementLayouts(layouts);
    for (const [publicID, start] of Object.entries(dragged.startPositions)) previous[publicID] = { ...previous[publicID], ...start };
    let next = cloneAdvancementLayouts(layouts);
    const targetGroupID = document.elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>("[data-advancement-group-id]")?.dataset.advancementGroupId || "")
      .find((candidate) => candidate && candidate !== groupId) || groupId;
    if (Object.keys(dragged.startPositions).length === 1 && targetGroupID && targetGroupID !== groupId) {
      const targetLayouts = Object.values(layouts).filter((layout) => layout.groupId === targetGroupID);
      for (const [publicID, layout] of Object.entries(next)) {
        if (layout.parentResourcePublicId === dragged.resourcePublicId && layout.groupId !== targetGroupID) {
          next[publicID] = { ...layout, parentResourcePublicId: "" };
        }
      }
      const parentLayout = next[next[dragged.resourcePublicId].parentResourcePublicId];
      next = {
        ...next,
        [dragged.resourcePublicId]: {
          ...next[dragged.resourcePublicId],
          parentResourcePublicId: parentLayout?.groupId === targetGroupID ? next[dragged.resourcePublicId].parentResourcePublicId : "",
          groupId: targetGroupID,
          x: roundGraphCoordinate(Math.max(-1, ...targetLayouts.map((layout) => layout.x)) + 1),
          y: roundGraphCoordinate(targetLayouts.length % 5),
        },
      };
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onDrag(undefined);
    onLayoutsCommit(next, previous);
  }

  function cancelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragged || dragged.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const next = cloneAdvancementLayouts(layouts);
    for (const [publicID, start] of Object.entries(dragged.startPositions)) next[publicID] = { ...next[publicID], ...start };
    onLayoutsPreview(next);
    onDrag(undefined);
  }

  function unlinkByKeyboard(event: ReactKeyboardEvent<SVGPathElement>, childResourcePublicId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onUnlink(childResourcePublicId);
  }

  return <div className={`overflow-auto rounded-xl border bg-[#26231e] shadow-inner ${selectedGroupIDs.has(groupId) ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/40" : "border-[#4a4335]"}`} data-advancement-group-id={groupId}>
    <div className="relative" style={{ width, height, backgroundImage: "linear-gradient(#ffffff09 1px, transparent 1px), linear-gradient(90deg, #ffffff09 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      <svg className="pointer-events-none absolute inset-0" height={height} width={width}>
        {group.map(({ resource, layout }) => {
          const child = pointByID.get(resource.resourcePublicId);
          const parent = pointByID.get(layout.parentResourcePublicId);
          if (!child || !parent) return null;
          const path = advancementBoardLinkPath(parent, child);
          const parentName = resourceName(group.find((item) => item.resource.resourcePublicId === layout.parentResourcePublicId)!.resource, locale, defaultLocale);
          const childName = resourceName(resource, locale, defaultLocale);
          const label = t("modContent.sectionActions.removeAdvancementLink", { parent: parentName, child: childName });
          return <g className="group" key={resource.resourcePublicId}>
            <title>{label}</title>
            <path
              aria-label={label}
              className="cursor-pointer stroke-transparent outline-none"
              d={path}
              fill="none"
              pointerEvents="stroke"
              role="button"
              strokeWidth="18"
              tabIndex={0}
              onClick={() => onUnlink(resource.resourcePublicId)}
              onKeyDown={(event) => unlinkByKeyboard(event, resource.resourcePublicId)}
            />
            <path
              className="transition-colors group-hover:stroke-[var(--red)] group-focus-within:stroke-[var(--red)]"
              d={path}
              fill="none"
              pointerEvents="none"
              stroke="#66d9ad"
              strokeLinecap="round"
              strokeWidth="3"
            />
          </g>;
        })}
      </svg>
      {group.map(({ resource }) => {
        const point = pointByID.get(resource.resourcePublicId)!;
        const iconURL = resourceIconURL(resource);
        const name = resourceName(resource, locale, defaultLocale);
        return <article
          className="absolute rounded-lg border-2 border-[#777064] bg-[var(--panel)] text-[var(--foreground)] shadow-lg"
          key={resource.resourcePublicId}
          style={{ left: point.x, top: point.y, width: advancementNodeWidth, minHeight: advancementNodeHeight }}
        >
          <AdvancementPort
            active={keyboardPort?.resourcePublicId === resource.resourcePublicId && keyboardPort.side === "input"}
            label={t("modContent.sectionActions.advancementInputNode", { name })}
            resourcePublicId={resource.resourcePublicId}
            side="input"
            onBeginLinkDrag={onBeginLinkDrag}
            onCancelLinkDrag={onCancelLinkDrag}
            onFinishLinkDrag={onFinishLinkDrag}
            onKeyboardPort={onKeyboardPort}
            onMoveLinkDrag={onMoveLinkDrag}
          />
          <div
            className="flex min-h-[92px] touch-none cursor-grab items-center gap-3 overflow-hidden rounded-md px-3 py-3 active:cursor-grabbing"
            onPointerDown={(event) => beginDrag(event, resource.resourcePublicId)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
          >
            {iconURL ? <Image unoptimized alt="" className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]" height={40} src={iconURL} width={40} /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[var(--panel-subtle)]">?</span>}
            <span className="min-w-0"><strong className="block truncate text-sm">{name}</strong><code className="mt-1 block truncate text-[10px] text-[var(--muted)]">{resource.canonicalId}</code></span>
          </div>
          <AdvancementPort
            active={keyboardPort?.resourcePublicId === resource.resourcePublicId && keyboardPort.side === "output"}
            label={t("modContent.sectionActions.advancementOutputNode", { name })}
            resourcePublicId={resource.resourcePublicId}
            side="output"
            onBeginLinkDrag={onBeginLinkDrag}
            onCancelLinkDrag={onCancelLinkDrag}
            onFinishLinkDrag={onFinishLinkDrag}
            onKeyboardPort={onKeyboardPort}
            onMoveLinkDrag={onMoveLinkDrag}
          />
        </article>;
      })}
    </div>
  </div>;
}

function AdvancementPort({
  resourcePublicId,
  side,
  label,
  active,
  onBeginLinkDrag,
  onMoveLinkDrag,
  onFinishLinkDrag,
  onCancelLinkDrag,
  onKeyboardPort,
}: {
  resourcePublicId: string;
  side: AdvancementPortSide;
  label: string;
  active: boolean;
  onBeginLinkDrag: (event: ReactPointerEvent<HTMLButtonElement>, resourcePublicId: string, side: AdvancementPortSide) => void;
  onMoveLinkDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onFinishLinkDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCancelLinkDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyboardPort: (resourcePublicId: string, side: AdvancementPortSide) => void;
}) {
  return <button
    aria-label={label}
    aria-pressed={active}
    className={`focus-ring absolute top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 touch-none place-items-center rounded-full border-2 shadow-md transition-colors ${side === "input" ? "-left-4" : "-right-4"} ${active ? "border-white bg-[var(--accent)] ring-4 ring-[var(--accent-soft)]" : "border-[#d7d0c2] bg-[#26231e] hover:border-[var(--accent)] hover:bg-[var(--accent)]"}`}
    data-advancement-port="true"
    data-port-side={side}
    data-resource-public-id={resourcePublicId}
    title={label}
    type="button"
    onClick={(event) => {
      if (event.detail === 0) onKeyboardPort(resourcePublicId, side);
    }}
    onPointerCancel={onCancelLinkDrag}
    onPointerDown={(event) => onBeginLinkDrag(event, resourcePublicId, side)}
    onPointerMove={onMoveLinkDrag}
    onPointerUp={onFinishLinkDrag}
  >
    <span className="h-3 w-3 rounded-full bg-[#66d9ad]" />
  </button>;
}

function ResourceChip({ resource, locale, defaultLocale, categories, dragged, selected, canMoveUp, canMoveDown, onCategoryChange, onDragStart, onMove, onDrop, onSelectedChange }: {
  resource: ModContentSectionResource;
  locale: string;
  defaultLocale: string;
  categories: ModContentSection[];
  dragged: boolean;
  selected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onCategoryChange: (sectionID: string) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onMove: (delta: number) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onSelectedChange: (selected: boolean) => void;
}) {
  const { t } = useI18n();
  const iconURL = resourceIconURL(resource);
  return <div className={`grid max-w-full gap-2 rounded-lg border bg-[var(--panel)] p-2 sm:grid-cols-[auto_minmax(160px,1fr)_minmax(150px,220px)_auto] ${dragged ? "border-[var(--accent)] opacity-50" : selected ? "border-[var(--accent)]" : "border-[var(--line)]"}`} draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
    <input aria-label={t("modContent.sectionActions.selectResource")} checked={selected} className="h-5 w-5 self-center" type="checkbox" onChange={(event) => onSelectedChange(event.target.checked)} />
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
    const definition = record(resource.definition);
    const parentCanonicalID = stringValue(definition.parentId) || stringValue(definition.parent);
    layouts[resource.resourcePublicId] = {
      parentResourcePublicId: publicIDByCanonicalID.get(parentCanonicalID) || "",
      groupId: stringValue(definition.layoutGroupId),
      x: finiteCoordinate(display.x, index % 5),
      y: finiteCoordinate(display.y, Math.floor(index / 5)),
    };
  });
  const positions = resources.map((resource) => ({ resource, layout: layouts[resource.resourcePublicId] }));
  for (const group of advancementConnectedGroups(positions, (item) => item.resource.resourcePublicId, (item) => item.layout.parentResourcePublicId)) {
    const storedGroupID = group.map((item) => item.layout.groupId).find(Boolean);
    const derivedGroupID = `advancement:${group.map((item) => item.resource.resourcePublicId).sort()[0]}`;
    for (const item of group) {
      if (!item.layout.groupId) item.layout.groupId = storedGroupID || derivedGroupID;
    }
  }
  return layouts;
}

function advancementLayoutGroups(positions: AdvancementPosition[]) {
  const grouped = new Map<string, AdvancementPosition[]>();
  for (const position of positions) {
    grouped.set(position.layout.groupId, [...(grouped.get(position.layout.groupId) || []), position]);
  }
  return [...grouped.values()].sort((left, right) => (left[0]?.layout.groupId || "").localeCompare(right[0]?.layout.groupId || ""));
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

function advancementDescendantIDs(layouts: AdvancementLayouts, rootPublicID: string) {
  const result = new Set<string>([rootPublicID]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [publicID, layout] of Object.entries(layouts)) {
      if (!result.has(publicID) && result.has(layout.parentResourcePublicId)) {
        result.add(publicID);
        changed = true;
      }
    }
  }
  return result;
}

function cloneAdvancementLayouts(layouts: AdvancementLayouts): AdvancementLayouts {
  return Object.fromEntries(Object.entries(layouts).map(([publicID, layout]) => [publicID, { ...layout }]));
}

function sameAdvancementLayouts(left: AdvancementLayouts, right: AdvancementLayouts) {
  const leftIDs = Object.keys(left);
  const rightIDs = Object.keys(right);
  return leftIDs.length === rightIDs.length && leftIDs.every((publicID) => {
    const leftLayout = left[publicID];
    const rightLayout = right[publicID];
    return rightLayout
      && leftLayout.parentResourcePublicId === rightLayout.parentResourcePublicId
      && leftLayout.groupId === rightLayout.groupId
      && leftLayout.x === rightLayout.x
      && leftLayout.y === rightLayout.y;
  });
}

function advancementBoardLinkPath(parent: { x: number; y: number }, child: { x: number; y: number }) {
  const parentX = parent.x + advancementNodeWidth;
  const parentY = parent.y + advancementNodeHeight / 2;
  const childX = child.x;
  const childY = child.y + advancementNodeHeight / 2;
  const middleX = (parentX + childX) / 2;
  return `M ${parentX} ${parentY} C ${middleX} ${parentY}, ${middleX} ${childY}, ${childX} ${childY}`;
}

function advancementScreenLinkPath(link: DraggedAdvancementLink) {
  const direction = link.side === "output" ? 1 : -1;
  const distance = Math.max(60, Math.abs(link.currentClientX - link.startClientX) / 2);
  return `M ${link.startClientX} ${link.startClientY} C ${link.startClientX + direction * distance} ${link.startClientY}, ${link.currentClientX - direction * distance} ${link.currentClientY}, ${link.currentClientX} ${link.currentClientY}`;
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

function normalizeSimilarResourceGroups(resources: ModContentSectionResource[]) {
  const members = new Map<string, ModContentSectionResource[]>();
  for (const resource of resources) {
    if (resource.similarGroupId) members.set(resource.similarGroupId, [...(members.get(resource.similarGroupId) || []), resource]);
  }
  const invalid = new Set([...members].filter(([, group]) => group.length < 2 || new Set(group.map((item) => item.sectionPublicId)).size > 1).map(([groupID]) => groupID));
  return resources.map((resource) => resource.similarGroupId && invalid.has(resource.similarGroupId)
    ? { ...resource, similarGroupId: "" }
    : resource);
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

function clientSelectionBounds(selection: AdvancementGroupSelection) {
  const left = Math.min(selection.startClientX, selection.currentClientX);
  const top = Math.min(selection.startClientY, selection.currentClientY);
  return {
    left,
    top,
    right: Math.max(selection.startClientX, selection.currentClientX),
    bottom: Math.max(selection.startClientY, selection.currentClientY),
  };
}

function clientSelectionStyle(selection: AdvancementGroupSelection) {
  const bounds = clientSelectionBounds(selection);
  return { left: bounds.left, top: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
}

function rectanglesIntersect(left: { left: number; top: number; right: number; bottom: number }, right: DOMRect) {
  return left.left <= right.right && left.right >= right.left && left.top <= right.bottom && left.bottom >= right.top;
}

function resourceSearchNames(resource: ModContentSectionResource, locale: string, defaultLocale: string) {
  return [...new Set([
    resourceName(resource, locale, defaultLocale),
    ...Object.values(resource.names || {}),
    resource.canonicalId,
  ].filter((name): name is string => Boolean(name)))];
}

function localizedSectionName(section: ModContentSection, locale: string) {
  const normalized = normalizeContentLanguage(locale);
  return section.localizations.find((item) => normalizeContentLanguage(item.locale) === normalized)?.name
    || section.localizations.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(section.defaultLocale))?.name
    || section.localizations[0]?.name
    || section.templateCode;
}

function resourceIconURL(resource: ModContentSectionResource) {
  if (resource.iconFileId) return modContentResourceAssetURL(resource.resourcePublicId, resource.versionPublicId, "icon-small");
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
