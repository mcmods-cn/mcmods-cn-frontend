"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  archiveCatalogRecipeType,
  archiveCatalogTag,
  type CatalogEditorLocalization,
  type CatalogLocalizationPayload,
  createCatalogRecipeType,
  createCatalogTag,
  loadCatalogRecipeTypeForEditing,
  loadCatalogTagForEditing,
  updateCatalogRecipeType,
  updateCatalogTag,
} from "../_lib/catalog-editor-api";
import { editableContentLanguages, findLocalizationVersion, toEditableContentLanguage } from "../_lib/content-language";
import type { CatalogResourceRef, EditResult, LocalizedContentFields, ReviewStatus } from "../_lib/editor-types";
import { useAuthSnapshot } from "../_lib/auth";
import { type Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { EditorShell } from "./editor/editor-shell";
import { ResourcePickerDialog } from "./editor/resource-picker-dialog";
import { ReviewStatusPanel } from "./editor/review-status-panel";
import { SelectedResourceList } from "./editor/selected-resource-list";
import { ToolsPlayground } from "./tools-playground";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

type EditorMode = "create" | "edit";

export function CatalogTagEditor(props: { mode: EditorMode; publicId?: string }) {
  const { token, user } = useAuthSnapshot();
  return <CatalogTagEditorSession key={`${user?.id || "guest"}:${token || "guest"}:${props.mode}:${props.publicId || ""}`} {...props} />;
}

function CatalogTagEditorSession({ mode, publicId = "" }: { mode: EditorMode; publicId?: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [initialLocale] = useState<Locale>(() => toEditableContentLanguage(locale) ?? "zh-CN");
  const [loaded, setLoaded] = useState(mode === "create");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const {
    selectedLocale, setSelectedLocale, defaultLocale, versions, publishedRevisionId, reviewStatus, reason, setReason,
    loading, setLoading, busy, deleting, markdownUploading, setMarkdownUploading, finished, error, setError, result, fields, canSubmit,
    loadDocument, updateFields, chooseDefaultLocale, buildLocalizationPayload, runSave, runArchive,
  } = useCatalogEditorState(mode, initialLocale);
  const [registry, setRegistry] = useState("minecraft:item");
  const [canonicalId, setCanonicalId] = useState("");
  const [members, setMembers] = useState<CatalogResourceRef[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !publicId || !token) return;
    let cancelled = false;
    loadCatalogTagForEditing(publicId, token, initialLocale).then((document) => {
      if (cancelled) return;
      const nextDefault = toEditableContentLanguage(document.defaultLocale) ?? initialLocale;
      setRegistry(document.registry);
      setCanonicalId(document.canonicalId);
      loadDocument(document, nextDefault);
      setMembers(document.members);
      setLoaded(true);
    }).catch((reasonValue: unknown) => {
      if (!cancelled) setError(errorText(reasonValue));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [initialLocale, loadAttempt, loadDocument, mode, publicId, setError, setLoading, token]);

  const valid = Boolean(token && registry.trim() && canonicalId.trim() && canSubmit);

  async function save() {
    if (!valid) {
      setError(t("catalogEditor.validationRequired"));
      return;
    }
    await runSave(async () => {
      const payload = {
        ...(mode === "edit" ? { baseRevisionId: publishedRevisionId } : {}),
        reason: reason.trim(),
        defaultLocale,
        localizations: buildLocalizationPayload(),
        registry: registry.trim(),
        canonicalId: canonicalId.trim(),
        memberResourcePublicIds: members.map((member) => member.publicId),
      };
      return mode === "create"
        ? await createCatalogTag(payload, token)
        : await updateCatalogTag(publicId, payload, token);
    });
  }

  async function archive() {
    await runArchive(t("catalogEditor.archiveConfirm"), () => archiveCatalogTag(publicId, publishedRevisionId, reason.trim(), token));
  }

  const loginNextPath = `/mods-tag?editor=${mode === "edit" ? "edit" : "create"}${publicId ? `&publicId=${encodeURIComponent(publicId)}` : ""}`;
  if (!ready) return <CatalogEditorGate loading nextPath={loginNextPath} />;
  if (!user) return <CatalogEditorGate nextPath={loginNextPath} />;
  if (loading) return <CatalogEditorGate loading nextPath={loginNextPath} />;
  if (!loaded) return <PageFeedback title={t("catalogEditor.loadFailed")} description={error} tone="danger" action={<button className="button-secondary focus-ring" type="button" onClick={() => { setLoading(true); setLoadAttempt((attempt) => attempt + 1); }}>{t("common.retry")}</button>} />;

  return <>
    <EditorShell
      backHref="/mods-tag"
      busy={busy}
      canDelete={mode === "edit" && !finished && reviewStatus !== "pending" && !markdownUploading}
      canSubmit={valid && !markdownUploading}
      deleting={deleting}
      description={t("catalogEditor.tagDescription")}
      languageSwitcher={<ContentLanguageSwitcher value={selectedLocale} versions={versions} onChange={setSelectedLocale} labels={{ title: t("catalogEditor.editLanguage") }} />}
      mode={mode}
      reviewPanel={<ReviewStatusPanel result={result} status={result ? undefined : reviewStatus} note={result ? reviewMessage(result, t) : reviewStatus === "pending" ? t("catalogEditor.existingReviewPending") : undefined} />}
      statusMessage={error ? <CatalogEditorError text={error} /> : null}
      title={t(mode === "create" ? "catalogEditor.tagCreate" : "catalogEditor.tagEdit")}
      aside={<CatalogEditorAside
        defaultLocale={defaultLocale}
        reason={reason}
        resourceCount={members.length}
        resourceLabel={t("catalogEditor.members")}
        templateCount={undefined}
        onDefaultLocale={chooseDefaultLocale}
        onReason={setReason}
      />}
      labels={{ back: t("globalCatalog.backToTags"), delete: t("catalogEditor.archive"), deleting: t("catalogEditor.archiving") }}
      onDelete={archive}
      onSubmit={save}
    >
      <InvariantPanel>
        <label className="grid gap-2 font-bold">
          <span>{t("catalogEditor.registry")}</span>
          <input className="field font-mono" disabled={mode === "edit"} value={registry} onChange={(event) => setRegistry(event.target.value)} />
          <small className="font-normal text-[var(--muted)]">{t("catalogEditor.invariantHint")}</small>
        </label>
        <label className="grid gap-2 font-bold">
          <span>{t("catalogEditor.canonicalId")}</span>
          <input className="field font-mono" disabled={mode === "edit"} placeholder="forge:ingots/iron" value={canonicalId} onChange={(event) => setCanonicalId(event.target.value)} />
          <small className="font-normal text-[var(--muted)]">{t("catalogEditor.invariantHint")}</small>
        </label>
      </InvariantPanel>
      <LocalizedFieldsPanel fields={fields} locale={selectedLocale} onChange={updateFields} />
      <ResourceSelectionPanel
        count={members.length}
        items={members}
        title={t("catalogEditor.members")}
        onChoose={() => setPickerOpen(true)}
        onRemove={(resource) => setMembers((current) => current.filter((item) => item.publicId !== resource.publicId))}
      />
      <MarkdownContentPanel documentId={`catalog-tag:${publicId || "draft"}:${selectedLocale}:content`} fields={fields} locale={selectedLocale} onChange={updateFields} onBusyChange={setMarkdownUploading} />
    </EditorShell>
    <ResourcePickerDialog
      multiple
      open={pickerOpen}
      token={token}
      value={members}
      labels={{
        title: t("catalogEditor.memberPickerTitle"),
        description: t("catalogEditor.memberPickerDescription"),
        searchPlaceholder: t("catalogEditor.resourceSearch"),
        empty: t("catalogEditor.noResources"),
        selected: t("catalogEditor.selectedResources"),
        remove: t("catalogEditor.removeResource"),
      }}
      onClose={() => setPickerOpen(false)}
      onConfirm={(resources) => { setMembers(resources); setPickerOpen(false); }}
    />
  </>;
}

export function CatalogRecipeTypeEditor(props: { mode: EditorMode; publicId?: string }) {
  const { token, user } = useAuthSnapshot();
  return <CatalogRecipeTypeEditorSession key={`${user?.id || "guest"}:${token || "guest"}:${props.mode}:${props.publicId || ""}`} {...props} />;
}

function CatalogRecipeTypeEditorSession({ mode, publicId = "" }: { mode: EditorMode; publicId?: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [initialLocale] = useState<Locale>(() => toEditableContentLanguage(locale) ?? "zh-CN");
  const [loaded, setLoaded] = useState(mode === "create");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const {
    selectedLocale, setSelectedLocale, defaultLocale, versions, publishedRevisionId, reviewStatus, reason, setReason,
    loading, setLoading, busy, deleting, markdownUploading, setMarkdownUploading, finished, error, setError, result, fields, canSubmit,
    loadDocument, updateFields, chooseDefaultLocale, buildLocalizationPayload, runSave, runArchive,
  } = useCatalogEditorState(mode, initialLocale);
  const [canonicalId, setCanonicalId] = useState("");
  const [definition, setDefinition] = useState<Record<string, unknown>>({});
  const [catalysts, setCatalysts] = useState<CatalogResourceRef[]>([]);
  const [templateCount, setTemplateCount] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !publicId || !token) return;
    let cancelled = false;
    loadCatalogRecipeTypeForEditing(publicId, token, initialLocale).then((document) => {
      if (cancelled) return;
      const nextDefault = toEditableContentLanguage(document.defaultLocale) ?? initialLocale;
      setCanonicalId(document.canonicalId);
      loadDocument(document, nextDefault);
      setDefinition(document.definition);
      setCatalysts(document.catalysts);
      setTemplateCount(document.templateCount);
      setLoaded(true);
    }).catch((reasonValue: unknown) => {
      if (!cancelled) setError(errorText(reasonValue));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [initialLocale, loadAttempt, loadDocument, mode, publicId, setError, setLoading, token]);

  const valid = Boolean(token && canonicalId.trim() && canSubmit);

  async function save() {
    if (!valid) {
      setError(t("catalogEditor.validationRequired"));
      return;
    }
    await runSave(async () => {
      const payload = {
        ...(mode === "edit" ? { baseRevisionId: publishedRevisionId } : {}),
        reason: reason.trim(),
        defaultLocale,
        localizations: buildLocalizationPayload(),
        canonicalId: canonicalId.trim(),
        definition,
        catalystResourcePublicIds: catalysts.map((catalyst) => catalyst.publicId),
      };
      return mode === "create"
        ? await createCatalogRecipeType(payload, token)
        : await updateCatalogRecipeType(publicId, payload, token);
    });
  }

  async function archive() {
    await runArchive(t("catalogEditor.archiveConfirm"), () => archiveCatalogRecipeType(publicId, publishedRevisionId, reason.trim(), token));
  }

  const loginNextPath = `/recipe-types?editor=${mode === "edit" ? "edit" : "create"}${publicId ? `&publicId=${encodeURIComponent(publicId)}` : ""}`;
  if (!ready) return <CatalogEditorGate loading nextPath={loginNextPath} />;
  if (!user) return <CatalogEditorGate nextPath={loginNextPath} />;
  if (loading) return <CatalogEditorGate loading nextPath={loginNextPath} />;
  if (!loaded) return <PageFeedback title={t("catalogEditor.loadFailed")} description={error} tone="danger" action={<button className="button-secondary focus-ring" type="button" onClick={() => { setLoading(true); setLoadAttempt((attempt) => attempt + 1); }}>{t("common.retry")}</button>} />;

  return <>
    <EditorShell
      backHref="/recipe-types"
      busy={busy}
      canDelete={mode === "edit" && !finished && reviewStatus !== "pending" && !markdownUploading}
      canSubmit={valid && !markdownUploading}
      deleting={deleting}
      description={t("catalogEditor.recipeTypeDescription")}
      languageSwitcher={<ContentLanguageSwitcher value={selectedLocale} versions={versions} onChange={setSelectedLocale} labels={{ title: t("catalogEditor.editLanguage") }} />}
      mode={mode}
      reviewPanel={<ReviewStatusPanel result={result} status={result ? undefined : reviewStatus} note={result ? reviewMessage(result, t) : reviewStatus === "pending" ? t("catalogEditor.existingReviewPending") : undefined} />}
      statusMessage={error ? <CatalogEditorError text={error} /> : null}
      title={t(mode === "create" ? "catalogEditor.recipeTypeCreate" : "catalogEditor.recipeTypeEdit")}
      aside={<CatalogEditorAside
        defaultLocale={defaultLocale}
        reason={reason}
        resourceCount={catalysts.length}
        resourceLabel={t("catalogEditor.catalysts")}
        templateCount={templateCount}
        onDefaultLocale={chooseDefaultLocale}
        onReason={setReason}
      />}
      labels={{ back: t("globalCatalog.backToRecipeTypes"), delete: t("catalogEditor.archive"), deleting: t("catalogEditor.archiving") }}
      onDelete={archive}
      onSubmit={save}
    >
      <InvariantPanel>
        <label className="grid gap-2 font-bold">
          <span>{t("catalogEditor.canonicalId")}</span>
          <input className="field font-mono" disabled={mode === "edit"} placeholder="minecraft:crafting" value={canonicalId} onChange={(event) => setCanonicalId(event.target.value)} />
          <small className="font-normal text-[var(--muted)]">{t("catalogEditor.invariantHint")}</small>
        </label>
      </InvariantPanel>
      <LocalizedFieldsPanel fields={fields} locale={selectedLocale} onChange={updateFields} />
      <ResourceSelectionPanel
        count={catalysts.length}
        items={catalysts}
        title={t("catalogEditor.catalysts")}
        onChoose={() => setPickerOpen(true)}
        onRemove={(resource) => setCatalysts((current) => current.filter((item) => item.publicId !== resource.publicId))}
      />
      <MarkdownContentPanel documentId={`catalog-recipe-type:${publicId || "draft"}:${selectedLocale}:content`} fields={fields} locale={selectedLocale} onChange={updateFields} onBusyChange={setMarkdownUploading} />
    </EditorShell>
    <ResourcePickerDialog
      multiple
      open={pickerOpen}
      token={token}
      value={catalysts}
      labels={{
        title: t("catalogEditor.catalystPickerTitle"),
        description: t("catalogEditor.catalystPickerDescription"),
        searchPlaceholder: t("catalogEditor.resourceSearch"),
        empty: t("catalogEditor.noResources"),
        selected: t("catalogEditor.selectedResources"),
        remove: t("catalogEditor.removeResource"),
      }}
      onClose={() => setPickerOpen(false)}
      onConfirm={(resources) => { setCatalysts(resources); setPickerOpen(false); }}
    />
  </>;
}

function useCatalogEditorState(mode: EditorMode, initialLocale: Locale) {
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialLocale);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [versions, setVersions] = useState<CatalogEditorLocalization[]>(() => [emptyLocalization(initialLocale)]);
  const baselineVersions = useRef<CatalogEditorLocalization[]>([emptyLocalization(initialLocale)]);
  const [dirtyLocales, setDirtyLocales] = useState<Set<Locale>>(() => new Set());
  const [publishedRevisionId, setPublishedRevisionId] = useState<string>();
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [markdownUploading, setMarkdownUploading] = useState(false);
  const mutationInFlight = useRef(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EditResult>();

  const loadDocument = useCallback((document: {
    localizations: CatalogEditorLocalization[];
    publishedRevisionId?: string;
    reviewStatus: ReviewStatus;
  }, nextDefault: Locale) => {
    const nextVersions = document.localizations.length ? document.localizations : [emptyLocalization(nextDefault)];
    setDefaultLocale(nextDefault);
    setSelectedLocale(findBestEditorLocale(nextVersions, initialLocale, nextDefault));
    setVersions(nextVersions);
    baselineVersions.current = cloneLocalizations(nextVersions);
    setDirtyLocales(new Set());
    setPublishedRevisionId(document.publishedRevisionId);
    setReviewStatus(document.reviewStatus === "approved" ? undefined : document.reviewStatus);
    setError("");
  }, [initialLocale]);

  const fields = localizationFields(versions, selectedLocale);
  const canSubmit = hasDefaultLocalization(versions, defaultLocale) && !finished && reviewStatus !== "pending";

  function updateFields(patch: Partial<LocalizedContentFields>) {
    const nextFields = { ...fields, ...patch };
    const baselineFields = localizationFields(baselineVersions.current, selectedLocale);
    setVersions((current) => updateLocalization(current, selectedLocale, patch));
    setDirtyLocales((current) => withLocaleDirty(current, selectedLocale, !sameLocalizedFields(nextFields, baselineFields)));
  }

  function chooseDefaultLocale(next: Locale) {
    setDefaultLocale(next);
    setVersions((current) => findLocalizationVersion(current, next) ? current : [...current, emptyLocalization(next)]);
  }

  function buildLocalizationPayload() {
    const locales = mode === "create" ? new Set([...dirtyLocales, defaultLocale]) : dirtyLocales;
    return localizationPayload(versions, locales);
  }

  async function runSave(operation: () => Promise<EditResult>) {
    if (mutationInFlight.current || markdownUploading) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await operation();
      setResult(next);
      setReviewStatus(next.reviewStatus);
      setFinished(mode === "create" || next.reviewStatus === "pending");
      if (next.reviewStatus === "approved") {
        baselineVersions.current = cloneLocalizations(versions);
        setDirtyLocales(new Set());
        if (next.revisionId) setPublishedRevisionId(next.revisionId);
      }
    } catch (reasonValue) {
      setError(errorText(reasonValue));
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function runArchive(confirmMessage: string, operation: () => Promise<EditResult>) {
    if (mutationInFlight.current || markdownUploading || !window.confirm(confirmMessage)) return;
    mutationInFlight.current = true;
    setDeleting(true);
    setError("");
    try {
      const next = await operation();
      setResult(next);
      setReviewStatus(next.reviewStatus);
      setFinished(true);
    } catch (reasonValue) {
      setError(errorText(reasonValue));
    } finally {
      mutationInFlight.current = false;
      setDeleting(false);
    }
  }

  return {
    selectedLocale, setSelectedLocale, defaultLocale, versions, publishedRevisionId, reviewStatus, reason, setReason,
    loading, setLoading, busy, deleting, markdownUploading, setMarkdownUploading, finished, error, setError, result, fields, canSubmit,
    loadDocument, updateFields, chooseDefaultLocale, buildLocalizationPayload, runSave, runArchive,
  };
}

function InvariantPanel({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <h2 className="text-xl font-black">{t("catalogEditor.invariantFields")}</h2>
    <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
  </section>;
}

function LocalizedFieldsPanel({ fields, locale, onChange }: { fields: LocalizedContentFields; locale: Locale; onChange: (patch: Partial<LocalizedContentFields>) => void }) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-black">{t("catalogEditor.localizedFields")}</h2>
      <code className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold">{locale}</code>
    </div>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <label className="grid gap-2 font-bold">
        <span>{t("catalogEditor.localizedName")}</span>
        <input className="field" value={fields.name} onChange={(event) => onChange({ name: event.target.value })} />
      </label>
      <label className="grid gap-2 font-bold">
        <span>{t("catalogEditor.summary")}</span>
        <textarea className="field min-h-24" value={fields.summary} onChange={(event) => onChange({ summary: event.target.value })} />
      </label>
    </div>
  </section>;
}

function MarkdownContentPanel({ documentId, fields, locale, onChange, onBusyChange }: { documentId: string; fields: LocalizedContentFields; locale: Locale; onChange: (patch: Partial<LocalizedContentFields>) => void; onBusyChange: (busy: boolean) => void }) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <ToolsPlayground embedded documentId={documentId} editorTitle={`${t("catalogEditor.contentMarkdown")} (${locale})`} onBusyChange={onBusyChange} value={fields.contentMarkdown} onChange={(value) => onChange({ contentMarkdown: value })} />
  </section>;
}

function ResourceSelectionPanel({ count, items, title, onChoose, onRemove }: { count: number; items: CatalogResourceRef[]; title: string; onChoose: () => void; onRemove: (resource: CatalogResourceRef) => void }) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("catalogEditor.resourceCount", { count })}</p></div>
      <button className="button-secondary focus-ring" type="button" onClick={onChoose}>{t("catalogEditor.chooseResources")}</button>
    </div>
    <div className="mt-4"><SelectedResourceList items={items} labels={{ empty: t("catalogEditor.noSelectedResources"), remove: t("catalogEditor.removeResource") }} onRemove={onRemove} /></div>
  </section>;
}

function CatalogEditorAside({ defaultLocale, reason, resourceCount, resourceLabel, templateCount, onDefaultLocale, onReason }: {
  defaultLocale: Locale;
  reason: string;
  resourceCount: number;
  resourceLabel: string;
  templateCount?: number;
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
          {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </label>
      <label className="mt-4 grid gap-2 text-sm font-bold">
        <span>{t("catalogEditor.changeReason")}</span>
        <textarea className="field min-h-24" placeholder={t("catalogEditor.changeReasonPlaceholder")} value={reason} onChange={(event) => onReason(event.target.value)} />
      </label>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{t("catalogEditor.reviewHint")}</p>
    </section>
    <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 className="font-black">{t("catalogEditor.currentScope")}</h2>
      <dl className="mt-3 grid gap-3 text-sm">
        <div><dt className="text-[var(--muted)]">{resourceLabel}</dt><dd className="mt-1 text-2xl font-black">{resourceCount}</dd></div>
        {typeof templateCount === "number" ? <div><dt className="text-[var(--muted)]">{t("catalogEditor.templates")}</dt><dd className="mt-1 text-2xl font-black">{templateCount}</dd></div> : null}
      </dl>
    </section>
  </div>;
}

function CatalogEditorGate({ loading = false, nextPath }: { loading?: boolean; nextPath: string }) {
  const { t } = useI18n();
  return loading
    ? <PageFeedback title={t("common.loading")} />
    : <LoginRequiredState nextPath={nextPath} description={t("catalogEditor.loginRequired")} />;
}

function CatalogEditorError({ text }: { text: string }) {
  return <p className="rounded-lg border border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_7%,transparent)] p-3 font-bold text-[var(--red)]" role="alert">{text}</p>;
}

function emptyLocalization(locale: Locale): CatalogEditorLocalization {
  return { locale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human", reviewStatus: "draft", editable: true };
}

function localizationFields(versions: CatalogEditorLocalization[], locale: Locale): LocalizedContentFields {
  return findLocalizationVersion(versions, locale)?.fields ?? { name: "", summary: "", contentMarkdown: "" };
}

function updateLocalization(versions: CatalogEditorLocalization[], locale: Locale, patch: Partial<LocalizedContentFields>) {
  const current = findLocalizationVersion(versions, locale);
  const next: CatalogEditorLocalization = {
    ...(current ?? emptyLocalization(locale)),
    locale,
    fields: { ...(current?.fields ?? emptyLocalization(locale).fields), ...patch },
    provenance: current?.provenance === "ai" ? "human_corrected" : "human",
    reviewStatus: "draft",
    editable: true,
  };
  return current ? versions.map((version) => version === current ? next : version) : [...versions, next];
}

function hasDefaultLocalization(versions: CatalogEditorLocalization[], defaultLocale: Locale) {
  return Boolean(findLocalizationVersion(versions, defaultLocale)?.fields.name.trim());
}

function localizationPayload(versions: CatalogEditorLocalization[], locales: ReadonlySet<Locale>): CatalogLocalizationPayload[] {
  return versions.filter((version) => {
    const locale = toEditableContentLanguage(version.locale);
    return Boolean(locale && editableContentLanguages.includes(locale) && locales.has(locale));
  }).map((version) => ({
    locale: version.locale,
    name: version.fields.name.trim(),
    summary: version.fields.summary.trim(),
    contentMarkdown: version.fields.contentMarkdown,
  }));
}

function sameLocalizedFields(left: LocalizedContentFields, right: LocalizedContentFields) {
  return left.name === right.name && left.summary === right.summary && left.contentMarkdown === right.contentMarkdown;
}

function withLocaleDirty(current: Set<Locale>, locale: Locale, dirty: boolean) {
  if (current.has(locale) === dirty) return current;
  const next = new Set(current);
  if (dirty) next.add(locale);
  else next.delete(locale);
  return next;
}

function cloneLocalizations(versions: CatalogEditorLocalization[]) {
  return versions.map((version) => ({ ...version, fields: { ...version.fields } }));
}

function findBestEditorLocale(versions: CatalogEditorLocalization[], preferred: Locale, defaultLocale: Locale): Locale {
  if (findLocalizationVersion(versions, preferred)) return preferred;
  if (findLocalizationVersion(versions, defaultLocale)) return defaultLocale;
  return toEditableContentLanguage(versions[0]?.locale) ?? preferred;
}

function reviewMessage(result: EditResult, t: (key: string, params?: Record<string, string | number>) => string) {
  return t(result.reviewStatus === "approved" ? "catalogEditor.savedApproved" : result.reviewStatus === "rejected" ? "catalogEditor.savedRejected" : "catalogEditor.savedPending");
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
