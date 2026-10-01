"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { normalizeContentLanguage, toEditableContentLanguage } from "../_lib/content-language";
import {
  catalogRegistryForKind,
  namespaceFromIdentifier,
  normalizeCatalogResourceKind,
} from "../_lib/catalog-resource-identifiers";
import type { LocalizationVersion } from "../_lib/editor-types";
import {
  archiveModContentResource,
  createModContentResource,
  loadModContentResource,
  loadModContentSections,
  loadModContentTemplates,
  modContentResourceAssetURL,
	type ModContentEntryField,
  type ModContentEntryType,
  type ModContentLocalization,
  type ModContentSection,
  type ModContentTemplate,
  updateModContentResource,
} from "../_lib/mod-content-api";
import { modExportAssetURL } from "../_lib/mod-export-api";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { useAutoDraft } from "../_lib/use-auto-draft";
import { supportedLocales, type Locale, useI18n } from "../_lib/i18n-provider";
import { ContentLanguageSwitcher, contentLanguageTabId } from "./editor/content-language-switcher";
import { EditorShell } from "./editor/editor-shell";
import { ResourcePickerDialog } from "./editor/resource-picker-dialog";
import { LootTableVisualEditor } from "./editor/loot-table-visual-editor";
import { ToolsPlayground } from "./tools-playground";
import type { CatalogResourceRef } from "../_lib/editor-types";
import { loadTagPickerPage } from "../_lib/resource-picker-loaders";
import { SquareImageCropDialog, type SquareCropOutput } from "./square-image-crop-dialog";
import { LoginRequiredState, PageFeedback } from "./page-feedback";
import { DraftAutosaveStatus } from "./draft-autosave-status";

type EditorMode = "create" | "edit";
type LocalizedFields = { name: string; contentMarkdown: string };
type EditorLocalization = LocalizationVersion<LocalizedFields>;
type DefinitionFieldKind = "number" | "range" | "text" | "boolean" | "list" | "json" | "reference" | "reference-list";
type DefinitionPath = readonly string[];
type DefinitionField = {
  editable: boolean;
  label?: string;
  labelKey: string;
  kind: DefinitionFieldKind;
  format?: ModContentEntryField["format"];
  paths: readonly DefinitionPath[];
  referenceKind?: string;
  referenceRegistry?: string;
};
type DefinitionGroup = {
  description?: string;
  descriptionKey: string;
  fields: DefinitionField[];
  title?: string;
  titleKey: string;
};
type ModResourceAutoDraft = {
  activeVersionId: string;
  canonicalId: string;
  defaultLocale: string;
  definition: Record<string, unknown>;
  entryTypeCode: string;
  iconFilePublicId: string;
  iconSmallFilePublicId: string;
  kindCode: string;
  localizations: EditorLocalization[];
  reason: string;
  renderFilePublicId: string;
  selectedSectionId: string;
};

export function ModContentResourceEditor(props: Parameters<typeof ModContentResourceEditorWorkspace>[0]) {
  const { user } = useAuthSnapshot();
  return <ModContentResourceEditorWorkspace key={JSON.stringify([props.mode, props.siteId, props.resourceId, props.versionId, props.sectionId, user?.id])} {...props} />;
}

function ModContentResourceEditorWorkspace({
  mode,
  siteId,
  resourceId = "",
  versionId = "",
  sectionId = "",
}: {
  mode: EditorMode;
  siteId: string;
  resourceId?: string;
  versionId?: string;
  sectionId?: string;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const authenticated = Boolean(token);
  const tokenRef = useRef(token);
  const [initialLocale] = useState<Locale>(() => toEditableContentLanguage(locale) ?? "zh-CN");
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialLocale);
  const [defaultLocale, setDefaultLocale] = useState<string>(initialLocale);
  const localizationPanelId = useId();
  const [localizations, setLocalizations] = useState<EditorLocalization[]>([emptyLocalization(initialLocale)]);
  const [kindCode, setKindCode] = useState("");
  const [template, setTemplate] = useState<ModContentTemplate>();
  const [entryTypeCode, setEntryTypeCode] = useState("default");
  const [canonicalId, setCanonicalId] = useState("");
  const [definition, setDefinition] = useState<Record<string, unknown>>({});
  const [baselineDefinition, setBaselineDefinition] = useState<Record<string, unknown>>({});
  const [activeVersionId, setActiveVersionId] = useState(versionId);
  const [rootSection, setRootSection] = useState<ModContentSection>();
  const [categories, setCategories] = useState<ModContentSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(sectionId);
  const [publishedRevisionId, setPublishedRevisionId] = useState<string>();
  const [iconSmallFilePublicId, setIconSmallFilePublicId] = useState("");
  const [iconFilePublicId, setIconFilePublicId] = useState("");
  const [renderFilePublicId, setRenderFilePublicId] = useState("");
  const [iconPreview, setIconPreview] = useState("");
  const [renderPreview, setRenderPreview] = useState("");
  const [importedIconPreview, setImportedIconPreview] = useState("");
  const [importedRenderPreview, setImportedRenderPreview] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState<"icon" | "render" | "">("");
  const [cropRequest, setCropRequest] = useState<{ file: File }>();
  const [uploadingMarkdownAsset, setUploadingMarkdownAsset] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invalidDefinitionFields, setInvalidDefinitionFields] = useState<Set<string>>(() => new Set());
  const [submittedPending, setSubmittedPending] = useState(false);
  const missingCreateTarget = mode === "create" && (!versionId || !sectionId);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (!ready || missingCreateTarget) return;
    const requestToken = tokenRef.current;
    if (!requestToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const [sections, templates, resource] = await Promise.all([
          loadModContentSections(siteId, requestToken),
          loadModContentTemplates(siteId, requestToken),
          mode === "edit" ? loadModContentResource(siteId, resourceId, requestToken) : Promise.resolve(undefined),
        ]);
        if (cancelled) return;

        const requestedVersionId = versionId
          || (resource?.versions.find((item) => item.hasDetail)?.publicId ?? "");
        const resourceVersion = resource?.versions.find((item) => item.publicId === requestedVersionId)
          || resource?.versions.find((item) => item.hasDetail);
        const resourceDetail = resource?.details.find((item) => item.versionPublicId === resourceVersion?.publicId);
        const resolvedVersionId = resourceVersion?.publicId || requestedVersionId;
        const resolvedRoot = resolveRootSection(
          sections,
          resourceDetail?.sectionPublicId || sectionId,
          resolvedVersionId,
        );
        const resolvedCategories = resolvedRoot ? sectionsForRoot(sections, resolvedRoot) : [];

        setActiveVersionId(resolvedVersionId || resolvedRoot?.versionPublicId || "");
        setRootSection(resolvedRoot);
        setCategories(resolvedCategories);
        setSelectedSectionId(
          resourceDetail?.sectionPublicId
          || sectionId
          || resolvedRoot?.publicId
          || "",
        );

        const resolvedTemplate = templates.find((item) => item.publicId === resolvedRoot?.templatePublicId);
        const effectiveTemplate = resolvedTemplate
          ? { ...resolvedTemplate, definition: resolvedRoot?.definition || resolvedTemplate.definition }
          : undefined;
        setTemplate(effectiveTemplate);
        const suggestedKinds = Array.isArray(effectiveTemplate?.definition.resourceKinds)
          ? effectiveTemplate.definition.resourceKinds.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          : [];
        if (resource && resourceDetail && resourceVersion) {
          const storedDefinition = cloneRecord(resourceDetail.definition);
          setKindCode(resource.kindCode);
          setEntryTypeCode(resourceDetail.entryTypeCode || inferredEntryTypeCode(effectiveTemplate?.definition.entryTypes, resource.kindCode));
          setCanonicalId(resource.canonicalId);
          setDefinition({});
          setBaselineDefinition(storedDefinition);
          setDefaultLocale(normalizeContentLanguage(resourceDetail.defaultLocale) || initialLocale);
          setSelectedLocale(bestLocalizationLocale(resourceDetail.localizations, initialLocale, resourceDetail.defaultLocale));
          setLocalizations(resourceDetail.localizations.length
            ? resourceDetail.localizations.map(editorLocalization)
            : [emptyLocalization(asEditableLocale(resourceDetail.defaultLocale, initialLocale))]);
          setPublishedRevisionId(resourceDetail.publishedRevisionId);
          setIconSmallFilePublicId(resourceDetail.iconSmallFilePublicId || "");
          const manualIconId = resourceDetail.iconFilePublicId || resourceVersion.iconFileId || "";
          const manualRenderId = resourceDetail.renderFilePublicId || resourceVersion.renderFileId || "";
          const importedIcon = resourceVersion.revisionId && resourceVersion.iconPath
            ? modExportAssetURL(resourceVersion.revisionId, resourceVersion.iconPath)
            : resourceVersion.iconUrl || "";
          const importedRender = resourceVersion.revisionId && resourceVersion.previewPath
            ? modExportAssetURL(resourceVersion.revisionId, resourceVersion.previewPath)
            : "";
          setIconFilePublicId(manualIconId);
          setRenderFilePublicId(manualRenderId);
          setImportedIconPreview(importedIcon);
          setImportedRenderPreview(importedRender);
          setIconPreview(manualIconId
            ? modContentResourceAssetURL(resourceId, resourceVersion.publicId, "icon")
            : importedIcon);
          setRenderPreview(manualRenderId
            ? modContentResourceAssetURL(resourceId, resourceVersion.publicId, "render")
            : importedRender);
        } else {
          const initialKind = suggestedKinds[0] || "";
          setKindCode(initialKind);
          setEntryTypeCode(inferredEntryTypeCode(effectiveTemplate?.definition.entryTypes, initialKind));
          setDefaultLocale(initialLocale);
          setSelectedLocale(initialLocale);
          setLocalizations([emptyLocalization(initialLocale)]);
          setBaselineDefinition({});
        }
        setLoaded(true);
      } catch (cause) {
        if (!cancelled) setError(errorText(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated, initialLocale, missingCreateTarget, mode, ready, reload, resourceId, sectionId, siteId, versionId]);

  useEffect(() => () => {
    if (iconPreview.startsWith("blob:")) URL.revokeObjectURL(iconPreview);
  }, [iconPreview]);
  useEffect(() => () => {
    if (renderPreview.startsWith("blob:")) URL.revokeObjectURL(renderPreview);
  }, [renderPreview]);

  const fields = localizationFields(localizations, selectedLocale);
  const entryTypes = useMemo(
    () => compatibleEntryTypes(template?.definition.entryTypes),
    [template],
  );
  const selectedEntryType = entryTypes.find((item) => item.code === entryTypeCode)
    || entryTypes[0];
  const effectiveEntryTypeCode = selectedEntryType?.code || entryTypeCode;
  const effectiveDefinition = useMemo(
    () => mergeDefinitions(baselineDefinition, definition),
    [baselineDefinition, definition],
  );
  const templateKindCodes = template?.definition.resourceKinds || [];
  const definitionGroups = useMemo(
    () => selectedEntryType
      ? groupsForEntryType(selectedEntryType, locale)
      : [],
    [locale, selectedEntryType],
  );
  const handleStructuredDefinitionChange = useCallback((value: Record<string, unknown>) => {
    setDefinition(definitionOverrides(baselineDefinition, value));
  }, [baselineDefinition]);
  const handleDefinitionFieldValidity = useCallback((fieldId: string, valid: boolean) => {
    setInvalidDefinitionFields((current) => {
      const next = new Set(current);
      if (valid) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }, []);
  const handleLootTableValidity = useCallback((valid: boolean) => {
    handleDefinitionFieldValidity("loot-table-visual-editor", valid);
  }, [handleDefinitionFieldValidity]);
  const backHref = rootSection
    ? `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(rootSection.publicId)}`
    : `/mods/${encodeURIComponent(siteId)}`;
  const detailHref = resourceId
    ? `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(activeVersionId)}&section=${encodeURIComponent(rootSection?.publicId || sectionId)}`
    : backHref;
  const draftValue: ModResourceAutoDraft = {
    activeVersionId, canonicalId, defaultLocale, definition, entryTypeCode,
    iconFilePublicId, iconSmallFilePublicId, kindCode, localizations, reason,
    renderFilePublicId, selectedSectionId,
  };
  const autoDraft = useAutoDraft({
    draftKey: `mod-resource:${siteId}:${mode}:${resourceId || `${versionId}:${sectionId}`}`,
    projectKey: `mod:${siteId}`,
    editUrl: resourceEditorEditURL(mode, siteId, resourceId, activeVersionId, selectedSectionId),
    enabled: ready && Boolean(token) && loaded && !loading && !missingCreateTarget,
    kind: "mod_resource",
    title: fields.name.trim() || canonicalId.trim() || t(mode === "create" ? "modContent.sectionActions.addTitle" : "modContent.resourceEdit.title"),
    token,
    value: draftValue,
    onRestore: (payload) => {
      setActiveVersionId(payload.activeVersionId);
      setCanonicalId(payload.canonicalId);
      setDefaultLocale(payload.defaultLocale);
      setDefinition(payload.definition);
      setEntryTypeCode(payload.entryTypeCode);
      setIconFilePublicId(payload.iconFilePublicId);
      setIconSmallFilePublicId(payload.iconSmallFilePublicId);
      setKindCode(payload.kindCode);
      setLocalizations(payload.localizations);
      setReason(payload.reason);
      setRenderFilePublicId(payload.renderFilePublicId);
      setSelectedSectionId(payload.selectedSectionId);
      setSelectedLocale(asEditableLocale(payload.defaultLocale, initialLocale));
    },
  });
  const canSubmit = Boolean(
    token
    && loaded
    && kindCode.trim()
    && effectiveEntryTypeCode.trim()
    && canonicalId.trim()
    && activeVersionId
    && selectedSectionId
    && !uploadingAsset
    && !uploadingMarkdownAsset
    && !busy
    && !deleting
    && !submittedPending
    && invalidDefinitionFields.size === 0
    && localizationFields(localizations, defaultLocale).name.trim(),
  );

  function updateLocalization(patch: Partial<LocalizedFields>) {
    setLocalizations((current) => upsertLocalization(current, selectedLocale, patch));
  }

  function chooseDefaultLocale(next: Locale) {
    setDefaultLocale(next);
    setLocalizations((current) => findLocalization(current, next) ? current : [...current, emptyLocalization(next)]);
  }

  function requestAssetUpload(assetKind: "icon" | "render", file: File) {
    if (uploadingAsset || busy) return;
    if (!file.type.startsWith("image/")) {
      setError(t("resourceEditor.imageOnly"));
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      setError(t("resourceEditor.imageTooLarge"));
      return;
    }
    setError("");
    if (assetKind === "render") {
      if (file.type !== "image/png") {
        setError(t("resourceEditor.renderPNGOnly"));
        return;
      }
      void uploadRenderAsset(file);
      return;
    }
    setCropRequest({ file });
  }

  async function uploadCroppedIcon(output: SquareCropOutput) {
    if (!token || uploadingAsset || busy) return;
    setUploadingAsset("icon");
    setError("");
    try {
      const icon32 = output.files.get(32);
      const icon128 = output.files.get(128);
      if (!icon32 || !icon128) throw new Error(t("resourceEditor.cropFailed"));
      const [smallUploaded, uploaded] = await Promise.all([
        uploadUserFileToOSS(icon32, token, `mod_resource:${siteId}:${kindCode.trim() || "resource"}:icon_32`),
        uploadUserFileToOSS(icon128, token, `mod_resource:${siteId}:${kindCode.trim() || "resource"}:icon_128`),
      ]);
      setIconSmallFilePublicId(smallUploaded.id);
      setIconFilePublicId(uploaded.id);
      setIconPreview(output.previewUrl);
    } catch (cause) {
      URL.revokeObjectURL(output.previewUrl);
      setError(errorText(cause));
    } finally {
      setUploadingAsset("");
    }
  }

  async function uploadRenderAsset(file: File) {
    if (!token || uploadingAsset || busy) return;
    setUploadingAsset("render");
    setError("");
    const previewURL = URL.createObjectURL(file);
    try {
      const uploaded = await uploadUserFileToOSS(
        file,
        token,
        `mod_resource:${siteId}:${kindCode.trim() || "resource"}:render`,
      );
      setRenderFilePublicId(uploaded.id);
      setRenderPreview(previewURL);
    } catch (cause) {
      URL.revokeObjectURL(previewURL);
      setError(errorText(cause));
    } finally {
      setUploadingAsset("");
    }
  }

  async function save() {
    if (!canSubmit || !token) {
      setError(t("resourceEditor.validationRequired"));
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        kindCode: kindCode.trim(),
        canonicalId: canonicalId.trim(),
        versionPublicId: activeVersionId,
        ...(selectedSectionId ? { sectionPublicId: selectedSectionId } : {}),
        entryTypeCode: effectiveEntryTypeCode,
        defaultLocale,
        definition,
        iconSmallFilePublicId,
        iconFilePublicId,
        renderFilePublicId,
        localizations: localizationPayload(localizations),
        reason: reason.trim() || t(mode === "create" ? "modContent.sectionActions.addReason" : "modContent.resourceEdit.reason"),
      };
      const result = mode === "create"
        ? await createModContentResource(siteId, payload, token)
        : await updateModContentResource(siteId, resourceId, {
          ...payload,
          resourcePublicId: resourceId,
          baseRevisionId: publishedRevisionId,
        }, token);
      const nextResourceId = mode === "create" ? result.publicId : resourceId;
      const targetUrl = `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(nextResourceId)}?version=${encodeURIComponent(activeVersionId)}&section=${encodeURIComponent(rootSection?.publicId || sectionId)}`;
      await autoDraft.completeDraft({
        projectKey: `mod:${siteId}`,
        projectTitle: siteId,
        targetUrl,
        reviewStatus: result.reviewStatus,
        changeRequestId: result.changeRequestId,
      }).catch(() => undefined);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      if (result.reviewStatus === "pending") setSubmittedPending(true);
      if (result.reviewStatus === "approved") {
        router.push(targetUrl);
        router.refresh();
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!loaded || mode !== "edit" || !token || !resourceId || !activeVersionId || busy || deleting || submittedPending) return;
    if (!window.confirm(t("resourceEditor.archiveConfirm"))) return;
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const result = await archiveModContentResource(siteId, resourceId, activeVersionId, token);
      await autoDraft.completeDraft({
        projectKey: `mod:${siteId}`,
        projectTitle: siteId,
        targetUrl: backHref,
        reviewStatus: result.reviewStatus,
        changeRequestId: result.changeRequestId,
      }).catch(() => undefined);
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      if (result.reviewStatus === "pending") setSubmittedPending(true);
      else {
        router.push(backHref);
        router.refresh();
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setDeleting(false);
    }
  }

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!user || !token) return <LoginRequiredState nextPath={mode === "edit" ? `/mods/${siteId}/resources/${resourceId}/edit` : `/mods/${siteId}/resources/new`} description={t("catalogEditor.loginRequired")} />;
  if (missingCreateTarget) return <PageFeedback title={t("modContent.resourceEdit.missingTarget")} />;
  if (loading) return <PageFeedback title={t("common.loading")} />;
  if (!loaded) return <><PageFeedback title={t("common.error")} description={error} tone="danger" /><div className="pb-8 text-center"><button className="button-secondary focus-ring" type="button" onClick={() => { setError(""); setLoading(true); setReload((value) => value + 1); }}>{t("common.retry")}</button></div></>;

  return <EditorShell
    aside={<EditorAside
      activeVersionId={activeVersionId}
      defaultLocale={defaultLocale}
      reason={reason}
      onDefaultLocale={chooseDefaultLocale}
      onReason={setReason}
    />}
    backHref={backHref}
    busy={busy || Boolean(uploadingAsset) || uploadingMarkdownAsset}
    canDelete={mode === "edit" && !submittedPending}
    canSubmit={canSubmit}
    cancelHref={mode === "edit" ? detailHref : backHref}
    deleting={deleting}
    description={t(mode === "create" ? "modContent.sectionActions.addHint" : "modContent.resourceEdit.hint")}
    languageSwitcher={<ContentLanguageSwitcher disabled={busy || deleting || Boolean(uploadingAsset) || uploadingMarkdownAsset} panelId={localizationPanelId} value={selectedLocale} versions={localizations} onChange={setSelectedLocale} />}
    mode={mode}
    statusMessage={<>
      <DraftAutosaveStatus error={autoDraft.error} savedAt={autoDraft.savedAt} status={autoDraft.status} />
      {error ? <p className="rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{error}</p> : null}
      {message ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 font-bold">{message}</p> : null}
    </>}
    title={t(mode === "create" ? "modContent.sectionActions.addTitle" : "modContent.resourceEdit.title")}
    onDelete={archive}
    onSubmit={save}
  >
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <h2 className="text-xl font-black">{t("catalogEditor.invariantFields")}</h2>
      <div className="mt-4 grid gap-4">
        <label className="grid gap-2 font-bold">
          <span>{t("resourceEditor.entryType")}</span>
          <select className="field" value={selectedEntryType?.code || entryTypeCode} onChange={(event) => {
            const nextCode = event.target.value;
            const nextType = entryTypes.find((item) => item.code === nextCode);
            if (selectedEntryType && nextType) {
              const migrated = migrateEntryTypeDefinition(effectiveDefinition, selectedEntryType, nextType);
              setDefinition(definitionOverrides(baselineDefinition, migrated));
            }
            setEntryTypeCode(nextCode);
            setInvalidDefinitionFields(new Set());
          }}>
            {entryTypes.map((item) => <option key={item.code} value={item.code}>{localizedSchemaName(item.names, locale, item.code)}</option>)}
          </select>
          <small className="font-normal text-[var(--muted)]">{t("resourceEditor.identityKind")}: {localizedResourceKind(kindCode, locale)}</small>
          {mode === "create" && templateKindCodes.length > 1
            ? <select aria-label={t("resourceEditor.identityKind")} className="field" value={kindCode} onChange={(event) => {
              setKindCode(event.target.value);
            }}>
              {templateKindCodes.map((item) => <option key={item} value={item}>{localizedResourceKind(item, locale)}</option>)}
            </select>
            : null}
        </label>
        <label className="grid gap-2 font-bold">
          <span>{t("modContent.sectionActions.resourceId")}</span>
          <input className="field font-mono" disabled={mode === "edit"} placeholder="examplemod:resource_id" value={canonicalId} onChange={(event) => setCanonicalId(event.target.value)} />
        </label>
        <label className="grid gap-2 font-bold md:col-span-2">
          <span>{t("modContent.sectionActions.category")}</span>
          <select className="field" disabled={!categories.length} value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)}>
            {categories.map((category, index) => <option key={category.publicId} value={category.publicId}>{index === 0 ? t("modContent.sectionActions.rootCategory") : localizedSectionName(category, locale)}</option>)}
          </select>
        </label>
      </div>
    </section>

    <section
      aria-labelledby={contentLanguageTabId(localizationPanelId, selectedLocale)}
      className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"
      id={localizationPanelId}
      role="tabpanel"
      tabIndex={0}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-black">{t("catalogEditor.localizedFields")}</h2>
        <code className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold">{selectedLocale}</code>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 font-bold">
          <span>{t("modContent.sectionActions.name")}</span>
          <input className="field" value={fields.name} onChange={(event) => updateLocalization({ name: event.target.value })} />
        </label>
      </div>
    </section>

    <ResourceAssetPanel
      iconPreview={iconPreview}
      iconCanClear={Boolean(iconFilePublicId)}
      renderPreview={renderPreview}
      renderCanClear={Boolean(renderFilePublicId)}
      uploading={uploadingAsset}
      onClear={(assetKind) => {
        if (assetKind === "icon") {
          setIconSmallFilePublicId("");
          setIconFilePublicId("");
          setIconPreview(importedIconPreview);
        } else {
          setRenderFilePublicId("");
          setRenderPreview(importedRenderPreview);
        }
      }}
      onUpload={requestAssetUpload}
    />

    {kindCode === "minecraft.loot_table" ? <LootTableVisualEditor
      definition={effectiveDefinition}
      token={token}
      onChange={handleStructuredDefinitionChange}
      onValidityChange={handleLootTableValidity}
    /> : null}

    {definitionGroups.map((group) => <DefinitionGroupEditor
      definition={effectiveDefinition}
      group={group}
      key={group.titleKey}
      token={token}
      onChange={handleStructuredDefinitionChange}
      onValidityChange={handleDefinitionFieldValidity}
    />)}

    {kindCode !== "minecraft.loot_table" ? <DefinitionJSONViewer
      definition={effectiveDefinition}
    /> : null}

    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <ToolsPlayground
        embedded
        editorTitle={`${t("modContent.sectionActions.content")} (${selectedLocale})`}
        key={selectedLocale}
        uploadSource={`mod_text:${siteId}:${resourceId || "staging"}`}
        value={fields.contentMarkdown}
        onBusyChange={setUploadingMarkdownAsset}
        onChange={(contentMarkdown) => updateLocalization({ contentMarkdown })}
      />
    </section>
    <SquareImageCropDialog
      file={cropRequest?.file}
      minimumSize={128}
      outputSizes={[32, 128]}
      onCancel={() => setCropRequest(undefined)}
      onConfirm={(output) => {
        setCropRequest(undefined);
        void uploadCroppedIcon(output);
      }}
    />
  </EditorShell>;
}

function ResourceAssetPanel({
  iconCanClear,
  iconPreview,
  renderCanClear,
  renderPreview,
  uploading,
  onClear,
  onUpload,
}: {
  iconCanClear: boolean;
  iconPreview: string;
  renderCanClear: boolean;
  renderPreview: string;
  uploading: "icon" | "render" | "";
  onClear: (kind: "icon" | "render") => void;
  onUpload: (kind: "icon" | "render", file: File) => void;
}) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <h2 className="text-xl font-black">{t("resourceEditor.assetsTitle")}</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("resourceEditor.assetsDescription")}</p>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <AssetUploadCard
        emptyText={t("resourceEditor.iconEmpty")}
        canClear={iconCanClear}
        disabled={Boolean(uploading)}
        kind="icon"
        label={t("resourceEditor.icon")}
        preview={iconPreview}
        uploading={uploading === "icon"}
        onClear={onClear}
        onUpload={onUpload}
      />
      <AssetUploadCard
        emptyText={t("resourceEditor.renderEmpty")}
        canClear={renderCanClear}
        disabled={Boolean(uploading)}
        kind="render"
        label={t("resourceEditor.render")}
        preview={renderPreview}
        uploading={uploading === "render"}
        onClear={onClear}
        onUpload={onUpload}
      />
    </div>
  </section>;
}

function AssetUploadCard({
  canClear,
  disabled,
  emptyText,
  kind,
  label,
  preview,
  uploading,
  onClear,
  onUpload,
}: {
  canClear: boolean;
  disabled: boolean;
  emptyText: string;
  kind: "icon" | "render";
  label: string;
  preview: string;
  uploading: boolean;
  onClear: (kind: "icon" | "render") => void;
  onUpload: (kind: "icon" | "render", file: File) => void;
}) {
  const { t } = useI18n();
  return <div className="flex min-h-36 items-center gap-4 rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel-subtle)] p-4">
    {preview
      ? <Image unoptimized alt="" className="h-24 w-24 shrink-0 object-contain [image-rendering:pixelated]" height={96} src={preview} width={96} />
      : <span className="grid h-24 w-24 shrink-0 place-items-center rounded bg-[var(--panel)] px-2 text-center text-xs font-bold text-[var(--muted)]">{emptyText}</span>}
    <div className="min-w-0">
      <strong className="block">{label}</strong>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className={`button-secondary focus-ring cursor-pointer ${disabled ? "pointer-events-none opacity-60" : ""}`}>
          <span>{uploading ? t("resourceEditor.uploading") : t("resourceEditor.upload")}</span>
          <input
            accept={kind === "render" ? "image/png" : "image/png,image/webp,image/jpeg"}
            className="sr-only"
            disabled={disabled}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onUpload(kind, file);
            }}
          />
        </label>
        {canClear ? <button className="button-secondary focus-ring text-[var(--red)]" disabled={disabled} type="button" onClick={() => onClear(kind)}>{t("common.delete")}</button> : null}
      </div>
    </div>
  </div>;
}

function DefinitionGroupEditor({
  definition,
  group,
  token,
  onChange,
  onValidityChange,
}: {
  definition: Record<string, unknown>;
  group: DefinitionGroup;
  token: string;
  onChange: (value: Record<string, unknown>) => void;
  onValidityChange: (fieldId: string, valid: boolean) => void;
}) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <h2 className="text-xl font-black">{group.title || t(group.titleKey)}</h2>
    {group.description || group.descriptionKey ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{group.description || t(group.descriptionKey)}</p> : null}
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {group.fields.map((field) => <DefinitionFieldEditor
        definition={definition}
        field={field}
        fieldId={`${group.titleKey}:${field.labelKey}`}
        key={`${group.titleKey}:${field.labelKey}`}
        token={token}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />)}
    </div>
  </section>;
}

function DefinitionJSONViewer({ definition }: { definition: Record<string, unknown> }) {
  const { t } = useI18n();
  return <details className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <summary className="cursor-pointer font-black">{t("modContent.sectionActions.definition")}</summary>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("catalogEditor.invariantHint")}</p>
    <textarea
      className="field mt-4 min-h-72 font-mono text-xs"
      readOnly
      value={JSON.stringify(definition, null, 2)}
    />
  </details>;
}

function DefinitionFieldEditor({
  definition,
  field,
  fieldId,
  token,
  onChange,
  onValidityChange,
}: {
  definition: Record<string, unknown>;
  field: DefinitionField;
  fieldId: string;
  token: string;
  onChange: (value: Record<string, unknown>) => void;
  onValidityChange: (fieldId: string, valid: boolean) => void;
}) {
  const { t } = useI18n();
  const value = definitionValue(definition, field.paths);
  const path = existingDefinitionPath(definition, field.paths) || field.paths[0];
  const text = field.kind === "list"
    ? Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : ""
    : field.kind === "json"
      ? value === undefined || value === null ? "" : JSON.stringify(value, null, 2) || ""
      : value === undefined || value === null ? "" : String(value);
  const [draftState, setDraftState] = useState({ external: text, value: text });
  if ((field.kind === "reference" || field.kind === "reference-list") && field.referenceKind) {
    return <ReferenceListFieldEditor
      definition={definition}
      field={field}
      path={path}
      token={token}
      values={Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : typeof value === "string" && value ? [value] : []}
      readOnly={!field.editable}
      onChange={onChange}
      onValidityChange={() => onValidityChange(fieldId, true)}
    />;
  }
  if (field.kind === "range") {
    const values = Array.isArray(value) ? value : [];
    return <RangeFieldEditor
      label={field.label || t(field.labelKey)}
      readOnly={!field.editable}
      maximum={typeof values[1] === "number" ? values[1] : undefined}
      minimum={typeof values[0] === "number" ? values[0] : undefined}
      onChange={(minimum, maximum, valid) => {
        onValidityChange(fieldId, valid);
        if (!valid) return;
        onChange(setDefinitionValue(definition, path, minimum === undefined || maximum === undefined ? undefined : [minimum, maximum]));
      }}
    />;
  }
  const draft = draftState.external === text ? draftState.value : text;
  const integerNumber = field.format === "integer" || field.format === "health" || field.format === "armor";
  const numberInvalid = field.kind === "number" && draft.trim() !== "" && (!Number.isFinite(Number(draft)) || (integerNumber && !Number.isInteger(Number(draft))));
  let jsonInvalid = false;
  if (field.kind === "json" && draft.trim() !== "") {
    try {
      JSON.parse(draft);
    } catch {
      jsonInvalid = true;
    }
  }
  if (field.kind === "boolean") {
    const normalized = typeof value === "boolean" ? String(value) : "";
    return <label className="grid gap-2 text-sm font-bold">
      <span>{field.label || t(field.labelKey)}</span>
      <select className="field" value={normalized} onChange={(event) => {
        onValidityChange(fieldId, true);
        onChange(setDefinitionValue(definition, path, event.target.value === "" ? undefined : event.target.value === "true"));
      }} disabled={!field.editable}>
        <option value="">{t("resourceEditor.unset")}</option>
        <option value="true">{t("common.yes")}</option>
        <option value="false">{t("common.no")}</option>
      </select>
    </label>;
  }
  if (field.kind === "json") {
    return <label className="grid gap-2 text-sm font-bold md:col-span-2 xl:col-span-3">
      <span>{field.label || t(field.labelKey)}</span>
      <textarea
        aria-invalid={jsonInvalid}
        className="field min-h-40 font-mono text-xs"
        readOnly={!field.editable}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          const trimmed = next.trim();
          if (!trimmed) {
            setDraftState({ external: "", value: next });
            onValidityChange(fieldId, true);
            onChange(setDefinitionValue(definition, path, undefined));
            return;
          }
          try {
            const parsed: unknown = JSON.parse(trimmed);
            const external = JSON.stringify(parsed, null, 2) || "";
            setDraftState({ external, value: next });
            onValidityChange(fieldId, true);
            onChange(setDefinitionValue(definition, path, parsed));
          } catch {
            setDraftState({ external: text, value: next });
            onValidityChange(fieldId, false);
          }
        }}
      />
      {jsonInvalid ? <small className="font-medium text-[var(--red)]">{t("resourceEditor.invalidJsonValue")}</small> : null}
    </label>;
  }
  return <label className="grid gap-2 text-sm font-bold">
    <span>{field.label || t(field.labelKey)}</span>
    <input
      aria-invalid={numberInvalid}
      className="field"
      inputMode={field.kind === "number" ? "decimal" : undefined}
      step={field.kind === "number" && integerNumber ? 1 : undefined}
      type="text"
      readOnly={!field.editable}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        if (field.kind === "number") {
          const trimmed = next.trim();
          if (trimmed === "") {
            setDraftState({ external: "", value: next });
            onValidityChange(fieldId, true);
            onChange(setDefinitionValue(definition, path, undefined));
            return;
          }
          const parsed = Number(trimmed);
          if (!Number.isFinite(parsed) || (integerNumber && !Number.isInteger(parsed))) {
            setDraftState({ external: text, value: next });
            onValidityChange(fieldId, false);
            return;
          }
          setDraftState({ external: String(parsed), value: next });
          onValidityChange(fieldId, true);
          onChange(setDefinitionValue(definition, path, parsed));
          return;
        }
        const parsed = field.kind === "list" ? uniqueList(next) : next || undefined;
        const external = field.kind === "list" ? Array.isArray(parsed) ? parsed.join(", ") : "" : next;
        setDraftState({ external, value: next });
        onValidityChange(fieldId, true);
        onChange(setDefinitionValue(definition, path, parsed));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
      }}
    />
    {field.kind === "number" && (field.format === "health" || field.format === "armor") && Number.isFinite(Number(draft)) ? <NumericIconPreview format={field.format} value={Number(draft)} /> : null}
    {numberInvalid ? <small className="font-medium text-[var(--red)]">{t("resourceEditor.invalidNumber")}</small> : null}
  </label>;
}

function RangeFieldEditor({ label, minimum, maximum, readOnly, onChange }: { label: string; minimum?: number; maximum?: number; readOnly: boolean; onChange: (minimum: number | undefined, maximum: number | undefined, valid: boolean) => void }) {
  const external = { minimum: minimum === undefined ? "" : String(minimum), maximum: maximum === undefined ? "" : String(maximum) };
  const [draftState, setDraftState] = useState({ external, value: external });
  const draft = draftState.external.minimum === external.minimum && draftState.external.maximum === external.maximum ? draftState.value : external;
  function update(next: { minimum: string; maximum: string }) {
    const parsedMinimum = next.minimum.trim() === "" ? undefined : Number(next.minimum);
    const parsedMaximum = next.maximum.trim() === "" ? undefined : Number(next.maximum);
    const valid = (parsedMinimum === undefined && parsedMaximum === undefined)
      || (typeof parsedMinimum === "number" && Number.isFinite(parsedMinimum)
        && typeof parsedMaximum === "number" && Number.isFinite(parsedMaximum)
        && parsedMinimum <= parsedMaximum);
    setDraftState({ external: valid ? { minimum: parsedMinimum === undefined ? "" : String(parsedMinimum), maximum: parsedMaximum === undefined ? "" : String(parsedMaximum) } : external, value: next });
    onChange(parsedMinimum, parsedMaximum, valid);
  }
  return <fieldset className="grid gap-2 text-sm font-bold md:col-span-2">
    <legend>{label}</legend>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <input aria-label={`${label} minimum`} className="field" inputMode="decimal" readOnly={readOnly} type="number" value={draft.minimum} onChange={(event) => update({ ...draft, minimum: event.target.value })} />
      <span aria-hidden="true">–</span>
      <input aria-label={`${label} maximum`} className="field" inputMode="decimal" readOnly={readOnly} type="number" value={draft.maximum} onChange={(event) => update({ ...draft, maximum: event.target.value })} />
    </div>
  </fieldset>;
}

function NumericIconPreview({ format, value }: { format: "health" | "armor"; value: number }) {
  const normalized = Math.max(0, Math.trunc(value));
  const fullCount = Math.floor(normalized / 2);
  const half = normalized % 2 === 1;
  if (fullCount > 10) return <span className="flex items-center gap-1 text-xs font-medium text-[var(--muted)]"><Image unoptimized alt="" height={16} src={`/mc-icons/icon-${format}-full.svg`} width={16} /> × {normalized / 2}</span>;
  return <span className="flex flex-wrap gap-0.5">{Array.from({ length: fullCount }, (_, index) => <Image unoptimized alt="" height={16} key={index} src={`/mc-icons/icon-${format}-full.svg`} width={16} />)}{half ? <Image unoptimized alt="" height={16} src={`/mc-icons/icon-${format}-half.svg`} width={16} /> : null}</span>;
}

function ReferenceListFieldEditor({
  definition,
  field,
  path,
  token,
  values,
  readOnly,
  onChange,
  onValidityChange,
}: {
  definition: Record<string, unknown>;
  field: DefinitionField;
  path: DefinitionPath;
  token: string;
  values: string[];
  readOnly: boolean;
  onChange: (value: Record<string, unknown>) => void;
  onValidityChange: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const tagPicker = field.referenceKind === "tag";
  const kind = normalizeCatalogResourceKind(field.referenceKind || "resource");
  const registry = field.referenceRegistry || (tagPicker ? "minecraft:item" : catalogRegistryForKind(kind) || "items");
  const pickerValue = values.map((identifier): CatalogResourceRef => ({
    publicId: `unresolved:${kind}:${identifier.toLowerCase()}`,
    id: identifier,
    registry: tagPicker ? registry : namespaceFromIdentifier(identifier),
    kind,
    names: {},
    unresolved: true,
    rawIdentifier: identifier,
  }));
  const label = field.label || t(field.labelKey);

  function confirm(resources: CatalogResourceRef[]) {
    const identifiers = [...new Set(resources.map((resource) => resource.rawIdentifier || resource.id).map((item) => item.trim()).filter(Boolean))];
    onValidityChange();
    const nextValue = field.kind === "reference" ? identifiers[0] : identifiers;
    onChange(setDefinitionValue(definition, path, identifiers.length ? nextValue : undefined));
    setOpen(false);
  }

  return <div className="grid gap-2 text-sm font-bold">
    <span>{label}</span>
    <button className="field focus-ring flex min-h-11 items-center justify-between gap-3 text-left disabled:cursor-default disabled:opacity-75" disabled={readOnly} type="button" onClick={() => setOpen(true)}>
      <span className="truncate">{values.length ? values.join(", ") : t("resourceEditor.unset")}</span>
      {!readOnly ? <span className="shrink-0 text-[var(--accent)]">{t("common.select")}</span> : null}
    </button>
    <ResourcePickerDialog
      allowUnresolved
      initialKind={tagPicker ? "" : kind}
      initialRegistry={tagPicker ? registry : ""}
      loadPage={tagPicker ? loadTagPickerPage : undefined}
      multiple={field.kind === "reference-list"}
      open={open}
      token={token}
      unresolvedKind={kind}
      unresolvedRegistry={registry}
      value={pickerValue}
      labels={{
        title: label,
        description: t(tagPicker ? "resourceEditor.referencePicker.tagDescription" : kind === "minecraft.enchantment" ? "resourceEditor.referencePicker.enchantmentDescription" : "resourceEditor.referencePicker.resourceDescription"),
        searchPlaceholder: t("common.search"),
        empty: t("resourceEditor.referencePicker.empty"),
        selected: t("resourceEditor.referencePicker.selected"),
        notFound: t(tagPicker ? "resourceEditor.referencePicker.tagNotFound" : kind === "minecraft.enchantment" ? "resourceEditor.referencePicker.enchantmentNotFound" : "resourceEditor.referencePicker.resourceNotFound"),
        manualPrompt: t(tagPicker ? "resourceEditor.referencePicker.tagPrompt" : kind === "minecraft.enchantment" ? "resourceEditor.referencePicker.enchantmentPrompt" : "resourceEditor.referencePicker.resourcePrompt"),
        manualPlaceholder: tagPicker ? "minecraft:tag_name" : "namespace:resource_id",
        insert: t("resourceEditor.referencePicker.insert"),
      }}
      onClose={() => setOpen(false)}
      onConfirm={confirm}
    />
  </div>;
}

function EditorAside({
  activeVersionId,
  defaultLocale,
  reason,
  onDefaultLocale,
  onReason,
}: {
  activeVersionId: string;
  defaultLocale: string;
  reason: string;
  onDefaultLocale: (locale: Locale) => void;
  onReason: (reason: string) => void;
}) {
  const { t } = useI18n();
  return <div className="space-y-4">
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 className="font-black">{t("catalogEditor.publishSettings")}</h2>
      <label className="mt-4 grid gap-2 text-sm font-bold">
        <span>{t("catalogEditor.defaultLocale")}</span>
        <select className="field" value={defaultLocale} onChange={(event) => onDefaultLocale(event.target.value as Locale)}>
          {!supportedLocales.some((item) => normalizeContentLanguage(item.code) === normalizeContentLanguage(defaultLocale))
            ? <option value={defaultLocale}>{defaultLocale}</option>
            : null}
          {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </label>
      <label className="mt-4 grid gap-2 text-sm font-bold">
        <span>{t("modContent.reason")}</span>
        <textarea className="field min-h-24" value={reason} onChange={(event) => onReason(event.target.value)} />
      </label>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{t("catalogEditor.reviewHint")}</p>
    </section>
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 className="font-black">{t("mods.detail.dataVersion")}</h2>
      <code className="mt-3 block break-all rounded bg-[var(--panel-subtle)] p-2 text-xs">{activeVersionId}</code>
    </section>
  </div>;
}

function compatibleEntryTypes(entryTypes: ModContentEntryType[] | undefined) {
  const values = Array.isArray(entryTypes) && entryTypes.length
    ? entryTypes.filter((entryType) => entryType.enabled !== false)
    : [{ code: "default", names: { "en-US": "Default", "zh-CN": "默认", "zh-TW": "預設" }, groups: [] }];
  return values;
}

function inferredEntryTypeCode(entryTypes: ModContentEntryType[] | undefined, kindCode: string) {
  const compatible = compatibleEntryTypes(entryTypes);
  const explicit = compatible.find((item) => item.code !== "default" && item.kindCodes?.some((kind) => kind.toLowerCase() === kindCode.toLowerCase()));
  const specific = compatible.filter((item) => item.code !== "default");
  return explicit?.code
    || (specific.length === 1 ? specific[0].code : "")
    || compatible.find((item) => item.code === "default")?.code
    || compatible[0]?.code
    || "default";
}

function migrateEntryTypeDefinition(
  source: Record<string, unknown>,
  currentType: ModContentEntryType,
  nextType: ModContentEntryType,
) {
  const currentFields = new Map(currentType.groups.flatMap((group) => group.fields).map((field) => [field.code, field]));
  const result: Record<string, unknown> = {};
  for (const nextField of nextType.groups.flatMap((group) => group.fields)) {
    const currentField = currentFields.get(nextField.code);
    if (!currentField || entryFieldStorageSignature(currentField) !== entryFieldStorageSignature(nextField)) continue;
    if (Object.prototype.hasOwnProperty.call(source, nextField.code) && source[nextField.code] !== null && source[nextField.code] !== undefined) {
      result[nextField.code] = structuredClone(source[nextField.code]);
    }
  }
  return result;
}

function entryFieldStorageSignature(field: ModContentEntryField) {
  return [field.type, field.referenceKind || "", field.referenceRegistry || ""].join("\u0000");
}

function groupsForEntryType(entryType: ModContentEntryType, locale: string): DefinitionGroup[] {
  return entryType.groups.map((group) => ({
    title: localizedSchemaName(group.names, locale, group.code),
    titleKey: `entry-type:${entryType.code}:${group.code}`,
    description: localizedSchemaName(group.descriptions || {}, locale, ""),
    descriptionKey: "",
    fields: group.fields.map((field) => ({
      editable: field.editable !== false,
      label: localizedSchemaName(field.names, locale, field.code),
      labelKey: `entry-field:${entryType.code}:${group.code}:${field.code}`,
      kind: field.type,
	  format: field.format,
	  // Database documents use stable field codes. paths are importer aliases.
	  paths: [[field.code]],
      referenceKind: field.referenceKind,
      referenceRegistry: field.referenceRegistry,
    })),
  }));
}

function localizedSchemaName(names: Record<string, string>, locale: string, fallback: string) {
  const normalized = normalizeContentLanguage(locale);
  return names[locale]
    || names[normalized]
    || names[normalized === "zh-CN" ? "zh-TW" : normalized === "zh-TW" ? "zh-CN" : ""]
    || names["en-US"]
    || Object.values(names).find(Boolean)
    || fallback;
}

function localizedResourceKind(kindCode: string, locale: string) {
  const chineseTraditional = normalizeContentLanguage(locale) === "zh-TW";
  const labels: Record<string, [string, string, string]> = {
    "minecraft.block": ["Block resource", "方块资源", "方塊資源"],
    "minecraft.item": ["Item resource", "物品资源", "物品資源"],
    "minecraft.fluid": ["Fluid resource", "流体资源", "流體資源"],
    "minecraft.entity_type": ["Entity resource", "生物资源", "生物資源"],
    "minecraft.enchantment": ["Enchantment resource", "附魔资源", "附魔資源"],
    "minecraft.mob_effect": ["Potion-effect resource", "药水效果资源", "藥水效果資源"],
    "minecraft.potion": ["Potion resource", "药水资源", "藥水資源"],
    "mod.skill": ["Skill resource", "技能资源", "技能資源"],
  };
  const label = labels[kindCode];
  if (!label) return kindCode;
  if (normalizeContentLanguage(locale).startsWith("zh")) return label[chineseTraditional ? 2 : 1];
  return label[0];
}

function editorLocalization(value: ModContentLocalization & { provenance?: string }): EditorLocalization {
  const provenance = value.provenance === "ai" || value.provenance === "human_corrected" || value.provenance === "import"
    ? value.provenance
    : "human";
  return {
    locale: normalizeContentLanguage(value.locale),
    fields: { name: value.name, contentMarkdown: value.contentMarkdown },
    provenance,
    reviewStatus: "approved",
    editable: true,
  };
}

function emptyLocalization(locale: Locale): EditorLocalization {
  return { locale, fields: { name: "", contentMarkdown: "" }, provenance: "human", reviewStatus: "draft", editable: true };
}

function findLocalization(values: EditorLocalization[], locale: string) {
  const normalized = normalizeContentLanguage(locale);
  return values.find((item) => normalizeContentLanguage(item.locale) === normalized);
}

function localizationFields(values: EditorLocalization[], locale: string): LocalizedFields {
  return findLocalization(values, locale)?.fields || { name: "", contentMarkdown: "" };
}

function upsertLocalization(values: EditorLocalization[], locale: Locale, patch: Partial<LocalizedFields>) {
  const current = findLocalization(values, locale);
  const next: EditorLocalization = {
    ...(current || emptyLocalization(locale)),
    locale,
    fields: { ...(current?.fields || emptyLocalization(locale).fields), ...patch },
    provenance: current?.provenance === "ai" ? "human_corrected" : "human",
    reviewStatus: "draft",
    editable: true,
  };
  return current ? values.map((item) => item === current ? next : item) : [...values, next];
}

function localizationPayload(values: EditorLocalization[]): ModContentLocalization[] {
  return values
    .filter((item) => item.fields.name.trim() || item.fields.contentMarkdown.trim())
    .map((item) => ({
      locale: normalizeContentLanguage(item.locale),
      name: item.fields.name.trim(),
      summary: "",
      contentMarkdown: item.fields.contentMarkdown,
    }));
}

function bestLocalizationLocale(values: ModContentLocalization[], preferred: string, defaultLocale: string): Locale {
  const candidates = [preferred, defaultLocale, values[0]?.locale];
  for (const candidate of candidates) {
    const editable = candidate ? toEditableContentLanguage(candidate) : undefined;
    if (editable && values.some((item) => normalizeContentLanguage(item.locale) === editable)) return editable;
  }
  return asEditableLocale(defaultLocale, "zh-CN");
}

function asEditableLocale(value: string, fallback: Locale): Locale {
  return toEditableContentLanguage(value) ?? fallback;
}

function resolveRootSection(sections: ModContentSection[], requestedSectionId: string, versionPublicId: string) {
  const byId = new Map(sections.map((item) => [item.publicId, item]));
  let requested = byId.get(requestedSectionId);
  const visited = new Set<string>();
  while (requested?.parentPublicId && !visited.has(requested.publicId)) {
    visited.add(requested.publicId);
    requested = byId.get(requested.parentPublicId) || requested;
    if (!requested.parentPublicId) return requested;
  }
  if (requested) return requested;
  return sections.find((item) => item.versionPublicId === versionPublicId && !item.parentPublicId)
    || sections.find((item) => item.versionPublicId === versionPublicId);
}

function sectionsForRoot(sections: ModContentSection[], root: ModContentSection) {
  const result = [root];
  const added = new Set([root.publicId]);
  for (;;) {
    const next = sections
      .filter((item) => item.versionPublicId === root.versionPublicId && added.has(item.parentPublicId) && !added.has(item.publicId))
      .sort((a, b) => a.ordinal - b.ordinal || a.publicId.localeCompare(b.publicId));
    if (!next.length) return result;
    for (const item of next) {
      added.add(item.publicId);
      result.push(item);
    }
  }
}

function localizedSectionName(section: ModContentSection, locale: string) {
  const normalized = normalizeContentLanguage(locale);
  return section.localizations.find((item) => normalizeContentLanguage(item.locale) === normalized)?.name
    || section.localizations.find((item) => normalizeContentLanguage(item.locale) === normalizeContentLanguage(section.defaultLocale))?.name
    || section.localizations[0]?.name
    || section.publicId;
}

function definitionValue(source: Record<string, unknown>, paths: readonly DefinitionPath[]) {
  for (const path of paths) {
    const value = valueAtPath(source, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function existingDefinitionPath(source: Record<string, unknown>, paths: readonly DefinitionPath[]) {
  return paths.find((path) => valueAtPath(source, path) !== undefined);
}

function valueAtPath(source: Record<string, unknown>, path: DefinitionPath): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setDefinitionValue(source: Record<string, unknown>, path: DefinitionPath, value: unknown) {
  const result = cloneRecord(source);
  let current = result;
  path.forEach((key, index) => {
    if (index === path.length - 1) {
      if (value === undefined) delete current[key];
      else current[key] = value;
      return;
    }
    const child = cloneRecord(current[key]);
    current[key] = child;
    current = child;
  });
  return result;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return structuredClone(value as Record<string, unknown>);
}

function mergeDefinitions(base: Record<string, unknown>, overrides: Record<string, unknown>) {
  const result = cloneRecord(base);
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] = isRecord(current) && isRecord(value)
      ? mergeDefinitions(current, value)
      : structuredClone(value);
  }
  return result;
}

function definitionOverrides(base: Record<string, unknown>, effective: Record<string, unknown>) {
  const difference = definitionDifference(base, effective);
  return isRecord(difference) ? difference : {};
}

const unchangedDefinition = Symbol("unchanged-definition");

function definitionDifference(base: unknown, effective: unknown): unknown | typeof unchangedDefinition {
  if (isRecord(base) && isRecord(effective)) {
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(effective)])) {
      if (!(key in effective)) {
        result[key] = null;
        continue;
      }
      const difference = definitionDifference(base[key], effective[key]);
      if (difference !== unchangedDefinition) result[key] = difference;
    }
    return Object.keys(result).length ? result : unchangedDefinition;
  }
  return definitionsEqual(base, effective) ? unchangedDefinition : structuredClone(effective);
}

function definitionsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => definitionsEqual(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => key in right && definitionsEqual(left[key], right[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueList(value: string) {
  return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))];
}

function resourceEditorEditURL(mode: EditorMode, siteId: string, resourceId: string, versionId: string, sectionId: string) {
  const path = mode === "edit"
    ? `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}/edit`
    : `/mods/${encodeURIComponent(siteId)}/resources/new`;
  const query = new URLSearchParams();
  if (versionId) query.set("version", versionId);
  if (sectionId) query.set("section", sectionId);
  return query.size ? `${path}?${query}` : path;
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
