"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { normalizeContentLanguage, toEditableContentLanguage } from "../_lib/content-language";
import type { LocalizationVersion } from "../_lib/editor-types";
import {
  archiveModContentResource,
  createModContentResource,
  loadModContentResource,
  loadModContentSections,
  loadModContentTemplates,
  modContentResourceAssetURL,
  type ModContentLocalization,
  type ModContentSection,
  updateModContentResource,
} from "../_lib/mod-content-api";
import { modExportAssetURL } from "../_lib/mod-export-api";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { supportedLocales, type Locale, useI18n } from "../_lib/i18n-provider";
import { ContentLanguageSwitcher, contentLanguageTabId } from "./editor/content-language-switcher";
import { EditorShell } from "./editor/editor-shell";
import { ToolsPlayground } from "./tools-playground";

type EditorMode = "create" | "edit";
type LocalizedFields = { name: string; summary: string; contentMarkdown: string };
type EditorLocalization = LocalizationVersion<LocalizedFields>;
type DefinitionFieldKind = "number" | "text" | "boolean" | "list";
type DefinitionPath = readonly string[];
type DefinitionField = {
  labelKey: string;
  kind: DefinitionFieldKind;
  paths: readonly DefinitionPath[];
};
type DefinitionGroup = {
  descriptionKey: string;
  fields: DefinitionField[];
  titleKey: string;
};

export function ModContentResourceEditor({
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
  const [kindCodes, setKindCodes] = useState<string[]>([]);
  const [kindCode, setKindCode] = useState("");
  const [canonicalId, setCanonicalId] = useState("");
  const [definition, setDefinition] = useState<Record<string, unknown>>({});
  const [activeVersionId, setActiveVersionId] = useState(versionId);
  const [rootSection, setRootSection] = useState<ModContentSection>();
  const [categories, setCategories] = useState<ModContentSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(sectionId);
  const [publishedRevisionId, setPublishedRevisionId] = useState<string>();
  const [iconFilePublicId, setIconFilePublicId] = useState("");
  const [renderFilePublicId, setRenderFilePublicId] = useState("");
  const [iconPreview, setIconPreview] = useState("");
  const [renderPreview, setRenderPreview] = useState("");
  const [importedIconPreview, setImportedIconPreview] = useState("");
  const [importedRenderPreview, setImportedRenderPreview] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState<"icon" | "render" | "">("");
  const [uploadingMarkdownAsset, setUploadingMarkdownAsset] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [definitionJSONError, setDefinitionJSONError] = useState("");
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

        const template = templates.find((item) => item.publicId === resolvedRoot?.templatePublicId);
        const suggestedKinds = Array.isArray(template?.definition.resourceKinds)
          ? template.definition.resourceKinds.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          : [];
        setKindCodes(suggestedKinds);

        if (resource && resourceDetail && resourceVersion) {
          setKindCode(resource.kindCode);
          setCanonicalId(resource.canonicalId);
          setDefinition(cloneRecord(resourceDetail.definition));
          setDefaultLocale(normalizeContentLanguage(resourceDetail.defaultLocale) || initialLocale);
          setSelectedLocale(bestLocalizationLocale(resourceDetail.localizations, initialLocale, resourceDetail.defaultLocale));
          setLocalizations(resourceDetail.localizations.length
            ? resourceDetail.localizations.map(editorLocalization)
            : [emptyLocalization(asEditableLocale(resourceDetail.defaultLocale, initialLocale))]);
          setPublishedRevisionId(resourceDetail.publishedRevisionId);
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
          setKindCode(suggestedKinds[0] || "");
          setDefaultLocale(initialLocale);
          setSelectedLocale(initialLocale);
          setLocalizations([emptyLocalization(initialLocale)]);
        }
      } catch (cause) {
        if (!cancelled) setError(errorText(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated, initialLocale, missingCreateTarget, mode, ready, resourceId, sectionId, siteId, versionId]);

  useEffect(() => () => {
    if (iconPreview.startsWith("blob:")) URL.revokeObjectURL(iconPreview);
  }, [iconPreview]);
  useEffect(() => () => {
    if (renderPreview.startsWith("blob:")) URL.revokeObjectURL(renderPreview);
  }, [renderPreview]);

  const fields = localizationFields(localizations, selectedLocale);
  const definitionGroups = useMemo(() => groupsForKind(kindCode, definition), [definition, kindCode]);
  const handleDefinitionChange = useCallback((value: Record<string, unknown>) => {
    setDefinition(value);
    setDefinitionJSONError("");
    setInvalidDefinitionFields(new Set());
  }, []);
  const handleStructuredDefinitionChange = useCallback((value: Record<string, unknown>) => {
    setDefinition(value);
    setDefinitionJSONError("");
  }, []);
  const handleDefinitionValidity = useCallback((valid: boolean) => {
    setDefinitionJSONError(valid ? "" : t("modContent.sectionActions.invalidJson"));
  }, [t]);
  const handleDefinitionFieldValidity = useCallback((fieldId: string, valid: boolean) => {
    setInvalidDefinitionFields((current) => {
      const next = new Set(current);
      if (valid) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }, []);
  const backHref = rootSection
    ? `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(rootSection.publicId)}`
    : `/mods/${encodeURIComponent(siteId)}`;
  const detailHref = resourceId
    ? `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourceId)}?version=${encodeURIComponent(activeVersionId)}&section=${encodeURIComponent(rootSection?.publicId || sectionId)}`
    : backHref;
  const canSubmit = Boolean(
    token
    && kindCode.trim()
    && canonicalId.trim()
    && activeVersionId
    && selectedSectionId
    && !uploadingAsset
    && !uploadingMarkdownAsset
    && !busy
    && !deleting
    && !submittedPending
    && !definitionJSONError
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

  async function uploadAsset(assetKind: "icon" | "render", file: File) {
    if (!token || uploadingAsset || busy) return;
    if (!file.type.startsWith("image/")) {
      setError(t("resourceEditor.imageOnly"));
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      setError(t("resourceEditor.imageTooLarge"));
      return;
    }
    setUploadingAsset(assetKind);
    setError("");
    try {
      const uploaded = await uploadUserFileToOSS(
        file,
        token,
        `mod_resource:${siteId}:${kindCode.trim() || "resource"}:${assetKind}`,
      );
      const preview = URL.createObjectURL(file);
      if (assetKind === "icon") {
        setIconFilePublicId(uploaded.id);
        setIconPreview(preview);
      } else {
        setRenderFilePublicId(uploaded.id);
        setRenderPreview(preview);
      }
    } catch (cause) {
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
        defaultLocale,
        definition,
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
      setMessage(t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved"));
      if (result.reviewStatus === "pending") setSubmittedPending(true);
      if (result.reviewStatus === "approved") {
        const nextResourceId = mode === "create" ? result.publicId : resourceId;
        router.push(`/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(nextResourceId)}?version=${encodeURIComponent(activeVersionId)}&section=${encodeURIComponent(rootSection?.publicId || sectionId)}`);
        router.refresh();
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (mode !== "edit" || !token || !resourceId || !activeVersionId || busy || deleting || submittedPending) return;
    if (!window.confirm(t("resourceEditor.archiveConfirm"))) return;
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const result = await archiveModContentResource(siteId, resourceId, activeVersionId, token);
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

  if (!ready) return <EditorGate text={t("common.loading")} />;
  if (!user || !token) return <EditorGate login text={t("catalogEditor.loginRequired")} />;
  if (missingCreateTarget) return <EditorGate text={t("modContent.resourceEdit.missingTarget")} />;
  if (loading) return <EditorGate text={t("common.loading")} />;

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
      {error ? <p className="rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{error}</p> : null}
      {definitionJSONError ? <p className="rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{definitionJSONError}</p> : null}
      {message ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 font-bold">{message}</p> : null}
    </>}
    title={t(mode === "create" ? "modContent.sectionActions.addTitle" : "modContent.resourceEdit.title")}
    onDelete={archive}
    onSubmit={save}
  >
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <h2 className="text-xl font-black">{t("catalogEditor.invariantFields")}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 font-bold">
          <span>{t("resourceEditor.kind")}</span>
          {mode === "create" && kindCodes.length
            ? <select className="field font-mono" value={kindCode} onChange={(event) => { setKindCode(event.target.value); setInvalidDefinitionFields(new Set()); }}>{kindCodes.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            : <input className="field font-mono" disabled={mode === "edit"} placeholder="minecraft.item" value={kindCode} onChange={(event) => { setKindCode(event.target.value); setInvalidDefinitionFields(new Set()); }} />}
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
        <label className="grid gap-2 font-bold">
          <span>{t("modContent.sectionActions.summary")}</span>
          <textarea className="field min-h-24" value={fields.summary} onChange={(event) => updateLocalization({ summary: event.target.value })} />
        </label>
      </div>
      <div className="mt-5">
        <ToolsPlayground
          embedded
          editorTitle={`${t("modContent.sectionActions.content")} (${selectedLocale})`}
          key={selectedLocale}
          uploadSource={`mod_text:${siteId}:${resourceId || "staging"}`}
          value={fields.contentMarkdown}
          onBusyChange={setUploadingMarkdownAsset}
          onChange={(contentMarkdown) => updateLocalization({ contentMarkdown })}
        />
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
          setIconFilePublicId("");
          setIconPreview(importedIconPreview);
        } else {
          setRenderFilePublicId("");
          setRenderPreview(importedRenderPreview);
        }
      }}
      onUpload={uploadAsset}
    />

    {definitionGroups.map((group) => <DefinitionGroupEditor
      definition={definition}
      group={group}
      key={group.titleKey}
      onChange={handleStructuredDefinitionChange}
      onValidityChange={handleDefinitionFieldValidity}
    />)}

    <DefinitionJSONEditor
      definition={definition}
      onChange={handleDefinitionChange}
      onValidityChange={handleDefinitionValidity}
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
            accept="image/png,image/webp,image/jpeg"
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
  onChange,
  onValidityChange,
}: {
  definition: Record<string, unknown>;
  group: DefinitionGroup;
  onChange: (value: Record<string, unknown>) => void;
  onValidityChange: (fieldId: string, valid: boolean) => void;
}) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <h2 className="text-xl font-black">{t(group.titleKey)}</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t(group.descriptionKey)}</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {group.fields.map((field) => <DefinitionFieldEditor
        definition={definition}
        field={field}
        fieldId={`${group.titleKey}:${field.labelKey}`}
        key={`${group.titleKey}:${field.labelKey}`}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />)}
    </div>
  </section>;
}

function DefinitionJSONEditor({
  definition,
  onChange,
  onValidityChange,
}: {
  definition: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(() => JSON.stringify(definition, null, 2));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setValue(JSON.stringify(definition, null, 2));
      onValidityChange(true);
    }
  }, [definition, onValidityChange]);
  function validate(next: string) {
    try {
      const parsed: unknown = JSON.parse(next || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      onValidityChange(true);
      onChange(parsed as Record<string, unknown>);
    } catch {
      onValidityChange(false);
    }
  }
  return <details className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <summary className="cursor-pointer font-black">{t("modContent.sectionActions.definition")}</summary>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("catalogEditor.invariantHint")}</p>
    <textarea
      aria-invalid={Boolean(value) && (() => { try { const parsed = JSON.parse(value); return !parsed || typeof parsed !== "object" || Array.isArray(parsed); } catch { return true; } })()}
      className="field mt-4 min-h-72 font-mono text-xs"
      ref={inputRef}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        validate(next);
      }}
    />
  </details>;
}

function DefinitionFieldEditor({
  definition,
  field,
  fieldId,
  onChange,
  onValidityChange,
}: {
  definition: Record<string, unknown>;
  field: DefinitionField;
  fieldId: string;
  onChange: (value: Record<string, unknown>) => void;
  onValidityChange: (fieldId: string, valid: boolean) => void;
}) {
  const { t } = useI18n();
  const value = definitionValue(definition, field.paths);
  const path = existingDefinitionPath(definition, field.paths) || field.paths[0];
  const text = field.kind === "list"
    ? Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : ""
    : value === undefined || value === null ? "" : String(value);
  const [draftState, setDraftState] = useState({ external: text, value: text });
  const draft = draftState.external === text ? draftState.value : text;
  const numberInvalid = field.kind === "number" && draft.trim() !== "" && !Number.isFinite(Number(draft));
  if (field.kind === "boolean") {
    const normalized = typeof value === "boolean" ? String(value) : "";
    return <label className="grid gap-2 text-sm font-bold">
      <span>{t(field.labelKey)}</span>
      <select className="field" value={normalized} onChange={(event) => {
        onValidityChange(fieldId, true);
        onChange(setDefinitionValue(definition, path, event.target.value === "" ? undefined : event.target.value === "true"));
      }}>
        <option value="">{t("resourceEditor.unset")}</option>
        <option value="true">{t("common.yes")}</option>
        <option value="false">{t("common.no")}</option>
      </select>
    </label>;
  }
  return <label className="grid gap-2 text-sm font-bold">
    <span>{t(field.labelKey)}</span>
    <input
      aria-invalid={numberInvalid}
      className="field"
      inputMode={field.kind === "number" ? "decimal" : undefined}
      type="text"
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
          if (!Number.isFinite(parsed)) {
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
    {numberInvalid ? <small className="font-medium text-[var(--red)]">{t("resourceEditor.invalidNumber")}</small> : null}
  </label>;
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

function EditorGate({ text, login = false }: { text: string; login?: boolean }) {
  const { t } = useI18n();
  return <main className="grid min-h-[70vh] place-items-center bg-[var(--background)] p-4 text-[var(--foreground)]">
    <section className="surface max-w-lg rounded-lg p-8 text-center">
      <h1 className="text-2xl font-black">{text}</h1>
      {login ? <Link className="button-primary focus-ring mt-5 inline-flex" href="/login">{t("common.login")}</Link> : null}
    </section>
  </main>;
}

function groupsForKind(kindCode: string, definition: Record<string, unknown>): DefinitionGroup[] {
  const normalized = kindCode.toLowerCase();
  const groups: DefinitionGroup[] = [];
  if (normalized.includes("block") || hasAnyDefinitionPath(definition, blockFields.flatMap((field) => field.paths))) {
    groups.push({ titleKey: "resourceEditor.physicalTitle", descriptionKey: "resourceEditor.physicalDescription", fields: blockFields });
  }
  if (normalized.includes("item") || normalized.includes("tool") || hasAnyDefinitionPath(definition, itemFields.flatMap((field) => field.paths))) {
    groups.push({ titleKey: "resourceEditor.toolTitle", descriptionKey: "resourceEditor.toolDescription", fields: itemFields });
  }
  if (normalized.includes("fluid") || normalized.includes("gas") || normalized.includes("chemical") || hasAnyDefinitionPath(definition, fluidFields.flatMap((field) => field.paths))) {
    groups.push({ titleKey: normalized.includes("fluid") ? "resourceEditor.fluidTitle" : "resourceEditor.chemicalTitle", descriptionKey: normalized.includes("fluid") ? "resourceEditor.fluidDescription" : "resourceEditor.chemicalDescription", fields: fluidFields });
  }
  if (normalized.includes("entity") || hasAnyDefinitionPath(definition, entityFields.flatMap((field) => field.paths))) {
    groups.push({ titleKey: "mods.exportImport.entry.entityProperties.title", descriptionKey: "resourceEditor.physicalDescription", fields: entityFields });
  }
  return groups;
}

const blockFields: DefinitionField[] = [
  { labelKey: "resourceEditor.hardness", kind: "number", paths: [["hardness"], ["physical", "hardness"]] },
  { labelKey: "resourceEditor.explosionResistance", kind: "number", paths: [["explosion_resistance"], ["blast_resistance"], ["physical", "blastResistance"]] },
  { labelKey: "resourceEditor.friction", kind: "number", paths: [["friction"], ["physical", "friction"]] },
  { labelKey: "resourceEditor.speedFactor", kind: "number", paths: [["speed_factor"], ["physical", "speedFactor"]] },
  { labelKey: "resourceEditor.jumpFactor", kind: "number", paths: [["jump_factor"], ["physical", "jumpFactor"]] },
  { labelKey: "resourceEditor.lightLevel", kind: "number", paths: [["light_emission"], ["light_level"], ["physical", "lightLevel"]] },
  { labelKey: "resourceEditor.requiresCorrectTool", kind: "boolean", paths: [["requires_correct_tool"], ["physical", "requiresCorrectTool"]] },
  { labelKey: "mods.exportImport.entry.blockProperties.preferredTools", kind: "list", paths: [["preferred_tools"], ["physical", "preferredTools"]] },
];

const itemFields: DefinitionField[] = [
  { labelKey: "mods.exportImport.entry.toolProperties.maxDamage", kind: "number", paths: [["max_damage"], ["durability", "max_damage"], ["tool", "durability"]] },
  { labelKey: "mods.exportImport.entry.toolProperties.maxStackSize", kind: "number", paths: [["max_stack_size"], ["stack_size"]] },
  { labelKey: "resourceEditor.miningSpeed", kind: "number", paths: [["tool", "tier", "mining_speed"], ["tool", "mining_speed"], ["mining_speed"]] },
  { labelKey: "resourceEditor.attackDamage", kind: "number", paths: [["combat", "attack_damage"], ["tool", "attack_damage"], ["attack_damage"]] },
  { labelKey: "resourceEditor.attackSpeed", kind: "number", paths: [["combat", "attack_speed"], ["tool", "attack_speed"], ["attack_speed"]] },
  { labelKey: "resourceEditor.enchantability", kind: "number", paths: [["enchanting", "enchantment_value"], ["tool", "tier", "enchantment_value"], ["enchantment_value"]] },
  { labelKey: "resourceEditor.harvestLevel", kind: "number", paths: [["tool", "tier", "mining_level"], ["tool", "mining_level"], ["required_mining_level"]] },
  { labelKey: "resourceEditor.repairTag", kind: "text", paths: [["tool", "repair_tag"], ["repair_tag"]] },
];

const fluidFields: DefinitionField[] = [
  { labelKey: "resourceEditor.density", kind: "number", paths: [["density"], ["fluid", "density"], ["chemical", "density"]] },
  { labelKey: "resourceEditor.temperature", kind: "number", paths: [["temperature"], ["fluid", "temperature"], ["chemical", "temperature"]] },
  { labelKey: "resourceEditor.viscosity", kind: "number", paths: [["viscosity"], ["fluid", "viscosity"], ["chemical", "viscosity"]] },
  { labelKey: "resourceEditor.luminosity", kind: "number", paths: [["luminosity"], ["fluid", "luminosity"], ["chemical", "luminosity"]] },
  { labelKey: "resourceEditor.gaseous", kind: "boolean", paths: [["gaseous"], ["chemical", "gaseous"]] },
];

const entityFields: DefinitionField[] = [
  { labelKey: "mods.exportImport.entry.entityProperties.maxHealth", kind: "number", paths: [["max_health"], ["attributes", "max_health"]] },
  { labelKey: "mods.exportImport.entry.entityProperties.armorValue", kind: "number", paths: [["armor_value"], ["attributes", "armor"]] },
  { labelKey: "mods.exportImport.entry.entityProperties.width", kind: "number", paths: [["width"], ["dimensions", "width"]] },
  { labelKey: "mods.exportImport.entry.entityProperties.height", kind: "number", paths: [["height"], ["dimensions", "height"]] },
  { labelKey: "mods.exportImport.entry.entityProperties.eyeHeight", kind: "number", paths: [["eye_height"], ["dimensions", "eye_height"]] },
  { labelKey: "mods.exportImport.entry.entityProperties.fireImmune", kind: "boolean", paths: [["fire_immune"], ["properties", "fire_immune"]] },
];

function editorLocalization(value: ModContentLocalization & { provenance?: string }): EditorLocalization {
  const provenance = value.provenance === "ai" || value.provenance === "human_corrected" || value.provenance === "import"
    ? value.provenance
    : "human";
  return {
    locale: normalizeContentLanguage(value.locale),
    fields: { name: value.name, summary: value.summary, contentMarkdown: value.contentMarkdown },
    provenance,
    reviewStatus: "approved",
    editable: true,
  };
}

function emptyLocalization(locale: Locale): EditorLocalization {
  return { locale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human", reviewStatus: "draft", editable: true };
}

function findLocalization(values: EditorLocalization[], locale: string) {
  const normalized = normalizeContentLanguage(locale);
  return values.find((item) => normalizeContentLanguage(item.locale) === normalized);
}

function localizationFields(values: EditorLocalization[], locale: string): LocalizedFields {
  return findLocalization(values, locale)?.fields || { name: "", summary: "", contentMarkdown: "" };
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
    .filter((item) => item.fields.name.trim() || item.fields.summary.trim() || item.fields.contentMarkdown.trim())
    .map((item) => ({
      locale: normalizeContentLanguage(item.locale),
      name: item.fields.name.trim(),
      summary: item.fields.summary.trim(),
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

function hasAnyDefinitionPath(source: Record<string, unknown>, paths: DefinitionPath[]) {
  return paths.some((path) => valueAtPath(source, path) !== undefined);
}

function uniqueList(value: string) {
  return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))];
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
