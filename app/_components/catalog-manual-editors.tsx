"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  archiveCatalogRecipeType,
  archiveCatalogTag,
  type CatalogEditorLocalization,
  type CatalogLocalizedFields,
  type CatalogLocalizationPayload,
  createCatalogRecipeType,
  createCatalogTag,
  loadCatalogRecipeTypeForEditing,
  loadCatalogTagForEditing,
  updateCatalogRecipeType,
  updateCatalogTag,
} from "../_lib/catalog-editor-api";
import { editableContentLanguages, findLocalizationVersion, toEditableContentLanguage } from "../_lib/content-language";
import type { CatalogResourceRef, EditResult, ReviewStatus } from "../_lib/editor-types";
import { useAuthSnapshot } from "../_lib/auth";
import { type Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { ContentLanguageSwitcher } from "./editor/content-language-switcher";
import { EditorShell } from "./editor/editor-shell";
import { ResourcePickerDialog } from "./editor/resource-picker-dialog";
import { ReviewStatusPanel } from "./editor/review-status-panel";
import { SelectedResourceList } from "./editor/selected-resource-list";
import { ToolsPlayground } from "./tools-playground";

type EditorMode = "create" | "edit";

export function CatalogTagEditor({ mode, publicId = "" }: { mode: EditorMode; publicId?: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const initialLocale = toEditableContentLanguage(locale) ?? "zh-CN";
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialLocale);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [versions, setVersions] = useState<CatalogEditorLocalization[]>(() => [emptyLocalization(initialLocale)]);
  const baselineVersions = useRef<CatalogEditorLocalization[]>([emptyLocalization(initialLocale)]);
  const [dirtyLocales, setDirtyLocales] = useState<Set<Locale>>(() => new Set());
  const [registry, setRegistry] = useState("minecraft:item");
  const [canonicalId, setCanonicalId] = useState("");
  const [members, setMembers] = useState<CatalogResourceRef[]>([]);
  const [publishedRevisionId, setPublishedRevisionId] = useState<string>();
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>();
  const [reason, setReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EditResult>();

  useEffect(() => {
    if (mode !== "edit" || !publicId || !token) return;
    let cancelled = false;
    loadCatalogTagForEditing(publicId, token, locale).then((document) => {
      if (cancelled) return;
      const nextDefault = toEditableContentLanguage(document.defaultLocale) ?? initialLocale;
      setRegistry(document.registry);
      setCanonicalId(document.canonicalId);
      setDefaultLocale(nextDefault);
      setSelectedLocale(findBestEditorLocale(document.localizations, initialLocale, nextDefault));
      setVersions(document.localizations.length ? document.localizations : [emptyLocalization(nextDefault)]);
      baselineVersions.current = cloneLocalizations(document.localizations.length ? document.localizations : [emptyLocalization(nextDefault)]);
      setDirtyLocales(new Set());
      setMembers(document.members);
      setPublishedRevisionId(document.publishedRevisionId);
      setReviewStatus(document.reviewStatus === "approved" ? undefined : document.reviewStatus);
      setError("");
    }).catch((reasonValue: unknown) => {
      if (!cancelled) setError(errorText(reasonValue));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [initialLocale, locale, mode, publicId, token]);

  const fields = localizationFields(versions, selectedLocale);
  const valid = Boolean(token && registry.trim() && canonicalId.trim() && hasDefaultLocalization(versions, defaultLocale) && !finished && reviewStatus !== "pending");

  async function save() {
    if (!valid) {
      setError(t("catalogEditor.validationRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...(mode === "edit" ? { baseRevisionId: publishedRevisionId } : {}),
        reason: reason.trim(),
        defaultLocale,
        localizations: localizationPayload(versions, mode === "create" ? new Set([...dirtyLocales, defaultLocale]) : dirtyLocales),
        registry: registry.trim(),
        canonicalId: canonicalId.trim(),
        memberResourcePublicIds: members.map((member) => member.publicId),
      };
      const next = mode === "create"
        ? await createCatalogTag(payload, token)
        : await updateCatalogTag(publicId, payload, token);
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
      setBusy(false);
    }
  }

  function updateFields(patch: Partial<CatalogLocalizedFields>) {
    const nextFields = { ...localizationFields(versions, selectedLocale), ...patch };
    const baselineFields = localizationFields(baselineVersions.current, selectedLocale);
    setVersions((current) => updateLocalization(current, selectedLocale, patch));
    setDirtyLocales((current) => withLocaleDirty(current, selectedLocale, !sameLocalizedFields(nextFields, baselineFields)));
  }

  function chooseDefaultLocale(next: Locale) {
    setDefaultLocale(next);
    setVersions((current) => findLocalizationVersion(current, next) ? current : [...current, emptyLocalization(next)]);
  }

  async function archive() {
    if (!window.confirm(t("catalogEditor.archiveConfirm"))) return;
    setDeleting(true);
    setError("");
    try {
      const next = await archiveCatalogTag(publicId, publishedRevisionId, reason.trim(), token);
      setResult(next);
      setReviewStatus(next.reviewStatus);
      setFinished(true);
    } catch (reasonValue) {
      setError(errorText(reasonValue));
    } finally {
      setDeleting(false);
    }
  }

  if (!ready) return <CatalogEditorGate loading />;
  if (!user) return <CatalogEditorGate />;
  if (loading) return <CatalogEditorGate loading />;

  return <>
    <EditorShell
      backHref="/mods-tag"
      busy={busy}
      canDelete={mode === "edit" && !finished && reviewStatus !== "pending"}
      canSubmit={valid}
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

export function CatalogRecipeTypeEditor({ mode, publicId = "" }: { mode: EditorMode; publicId?: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const initialLocale = toEditableContentLanguage(locale) ?? "zh-CN";
  const [selectedLocale, setSelectedLocale] = useState<Locale>(initialLocale);
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialLocale);
  const [versions, setVersions] = useState<CatalogEditorLocalization[]>(() => [emptyLocalization(initialLocale)]);
  const baselineVersions = useRef<CatalogEditorLocalization[]>([emptyLocalization(initialLocale)]);
  const [dirtyLocales, setDirtyLocales] = useState<Set<Locale>>(() => new Set());
  const [canonicalId, setCanonicalId] = useState("");
  const [definition, setDefinition] = useState<Record<string, unknown>>({});
  const [catalysts, setCatalysts] = useState<CatalogResourceRef[]>([]);
  const [templateCount, setTemplateCount] = useState(0);
  const [publishedRevisionId, setPublishedRevisionId] = useState<string>();
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>();
  const [reason, setReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EditResult>();

  useEffect(() => {
    if (mode !== "edit" || !publicId || !token) return;
    let cancelled = false;
    loadCatalogRecipeTypeForEditing(publicId, token, locale).then((document) => {
      if (cancelled) return;
      const nextDefault = toEditableContentLanguage(document.defaultLocale) ?? initialLocale;
      setCanonicalId(document.canonicalId);
      setDefaultLocale(nextDefault);
      setSelectedLocale(findBestEditorLocale(document.localizations, initialLocale, nextDefault));
      setVersions(document.localizations.length ? document.localizations : [emptyLocalization(nextDefault)]);
      baselineVersions.current = cloneLocalizations(document.localizations.length ? document.localizations : [emptyLocalization(nextDefault)]);
      setDirtyLocales(new Set());
      setDefinition(document.definition);
      setCatalysts(document.catalysts);
      setTemplateCount(document.templateCount);
      setPublishedRevisionId(document.publishedRevisionId);
      setReviewStatus(document.reviewStatus === "approved" ? undefined : document.reviewStatus);
      setError("");
    }).catch((reasonValue: unknown) => {
      if (!cancelled) setError(errorText(reasonValue));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [initialLocale, locale, mode, publicId, token]);

  const fields = localizationFields(versions, selectedLocale);
  const valid = Boolean(token && canonicalId.trim() && hasDefaultLocalization(versions, defaultLocale) && !finished && reviewStatus !== "pending");

  async function save() {
    if (!valid) {
      setError(t("catalogEditor.validationRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...(mode === "edit" ? { baseRevisionId: publishedRevisionId } : {}),
        reason: reason.trim(),
        defaultLocale,
        localizations: localizationPayload(versions, mode === "create" ? new Set([...dirtyLocales, defaultLocale]) : dirtyLocales),
        canonicalId: canonicalId.trim(),
        definition,
        catalystResourcePublicIds: catalysts.map((catalyst) => catalyst.publicId),
      };
      const next = mode === "create"
        ? await createCatalogRecipeType(payload, token)
        : await updateCatalogRecipeType(publicId, payload, token);
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
      setBusy(false);
    }
  }

  function updateFields(patch: Partial<CatalogLocalizedFields>) {
    const nextFields = { ...localizationFields(versions, selectedLocale), ...patch };
    const baselineFields = localizationFields(baselineVersions.current, selectedLocale);
    setVersions((current) => updateLocalization(current, selectedLocale, patch));
    setDirtyLocales((current) => withLocaleDirty(current, selectedLocale, !sameLocalizedFields(nextFields, baselineFields)));
  }

  function chooseDefaultLocale(next: Locale) {
    setDefaultLocale(next);
    setVersions((current) => findLocalizationVersion(current, next) ? current : [...current, emptyLocalization(next)]);
  }

  async function archive() {
    if (!window.confirm(t("catalogEditor.archiveConfirm"))) return;
    setDeleting(true);
    setError("");
    try {
      const next = await archiveCatalogRecipeType(publicId, publishedRevisionId, reason.trim(), token);
      setResult(next);
      setReviewStatus(next.reviewStatus);
      setFinished(true);
    } catch (reasonValue) {
      setError(errorText(reasonValue));
    } finally {
      setDeleting(false);
    }
  }

  if (!ready) return <CatalogEditorGate loading />;
  if (!user) return <CatalogEditorGate />;
  if (loading) return <CatalogEditorGate loading />;

  return <>
    <EditorShell
      backHref="/recipe-types"
      busy={busy}
      canDelete={mode === "edit" && !finished && reviewStatus !== "pending"}
      canSubmit={valid}
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

function InvariantPanel({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
    <h2 className="text-xl font-black">{t("catalogEditor.invariantFields")}</h2>
    <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
  </section>;
}

function LocalizedFieldsPanel({ fields, locale, onChange }: { fields: CatalogLocalizedFields; locale: Locale; onChange: (patch: Partial<CatalogLocalizedFields>) => void }) {
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
    <div className="mt-5">
      <ToolsPlayground embedded editorTitle={t("catalogEditor.contentMarkdown")} value={fields.contentMarkdown} onChange={(value) => onChange({ contentMarkdown: value })} />
    </div>
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

function CatalogEditorGate({ loading = false }: { loading?: boolean }) {
  const { t } = useI18n();
  return <main className="grid min-h-[70vh] place-items-center bg-[var(--background)] p-4 text-[var(--foreground)]">
    <section className="surface max-w-lg rounded-lg p-8 text-center">
      <h1 className="text-2xl font-black">{loading ? t("common.loading") : t("catalogEditor.loginRequired")}</h1>
      {!loading ? <Link className="button-primary focus-ring mt-5 inline-flex" href="/login">{t("common.login")}</Link> : null}
    </section>
  </main>;
}

function CatalogEditorError({ text }: { text: string }) {
  return <p className="rounded-lg border border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_7%,transparent)] p-3 font-bold text-[var(--red)]" role="alert">{text}</p>;
}

function emptyLocalization(locale: Locale): CatalogEditorLocalization {
  return { locale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human", reviewStatus: "draft", editable: true };
}

function localizationFields(versions: CatalogEditorLocalization[], locale: Locale): CatalogLocalizedFields {
  return findLocalizationVersion(versions, locale)?.fields ?? { name: "", summary: "", contentMarkdown: "" };
}

function updateLocalization(versions: CatalogEditorLocalization[], locale: Locale, patch: Partial<CatalogLocalizedFields>) {
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

function sameLocalizedFields(left: CatalogLocalizedFields, right: CatalogLocalizedFields) {
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
