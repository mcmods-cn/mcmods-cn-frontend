"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../_lib/api";
import { catalogResourceIconURL } from "../../_lib/editor-api";
import type { CatalogResourceRef, LocalizationVersion } from "../../_lib/editor-types";
import { deleteRecipe, loadRecipeTemplate, loadRecipeTemplates, loadRecipeTypeOptions, saveRecipe } from "../../_lib/recipe-editor-api";
import type {
  CatalogEditResult,
  RecipeBinding,
  RecipeCandidate,
  RecipeLocalizedFields,
  RecipeMutation,
  RecipeRecord,
  RecipeSlotRole,
  RecipeTemplateRecord,
  RecipeTemplateSlot,
  RecipeTypeOption,
} from "../../_lib/recipe-editor-types";
import { supportedLocales, type Locale, useI18n } from "../../_lib/i18n-provider";
import { ContentLanguageSwitcher } from "./content-language-switcher";
import { ResourcePickerDialog, type ResourcePickerLabels } from "./resource-picker-dialog";
import { CatalogResourceIdentity } from "./selected-resource-list";

export type RecipeEditorLabels = {
  localization: string;
  localizedName: string;
  localizedSummary: string;
  localizedDescription: string;
  invariantSettings: string;
  recipeType: string;
  selectRecipeType: string;
  loadingRecipeTypes: string;
  noRecipeTypes: string;
  template: string;
  selectTemplate: string;
  loadingTemplates: string;
  noTemplates: string;
  canonicalSourceId: string;
  definition: string;
  canvas: string;
  selectSlotHint: string;
  slotInput: string;
  slotOutput: string;
  slotCatalyst: string;
  selectedSlot: string;
  noSelectedSlot: string;
  candidates: string;
  chooseResources: string;
  clearResources: string;
  amount: string;
  probabilityPercent: string;
  byproduct: string;
  outputCandidateHint: string;
  removeCandidate: string;
  changeReason: string;
  save: string;
  saving: string;
  delete: string;
  deleting: string;
  deleteConfirm: string;
  deleted: string;
  saved: string;
  reviewPending: string;
  validationSummary: string;
  required: string;
  invalidDefinition: string;
  invalidAmount: string;
  invalidProbability: string;
  missingRequiredSlot: string;
  missingOutput: string;
  loadFailed: string;
  saveFailed: string;
  deleteFailed: string;
  resourcePicker: ResourcePickerLabels;
};

const noInitialTemplates: readonly RecipeTemplateRecord[] = [];

export function RecipeEditor({
  token,
  initialValue,
  recipeTypes: providedRecipeTypes,
  initialTemplates = noInitialTemplates,
  defaultLocale,
  labels,
  onSaved,
  onDeleted,
}: {
  token: string;
  initialValue?: RecipeRecord;
  recipeTypes?: readonly RecipeTypeOption[];
  initialTemplates?: readonly RecipeTemplateRecord[];
  defaultLocale?: Locale;
  labels: RecipeEditorLabels;
  onSaved?: (result: CatalogEditResult, value: RecipeRecord) => void;
  onDeleted?: (result: CatalogEditResult) => void;
}) {
  const { locale: uiLocale } = useI18n();
  const [contentDefaultLocale] = useState<Locale>(() => editableLocale(initialValue?.defaultLocale, defaultLocale ?? uiLocale));
  const [draft, setDraft] = useState<RecipeRecord>(() => initialRecipe(initialValue));
  const [versions, setVersions] = useState<LocalizationVersion<RecipeLocalizedFields>[]>(() => initialRecipeLocalizations(initialValue, contentDefaultLocale));
  const baselineVersions = useRef<LocalizationVersion<RecipeLocalizedFields>[]>(initialRecipeLocalizations(initialValue, contentDefaultLocale));
  const [dirtyLocales, setDirtyLocales] = useState<Set<string>>(() => new Set());
  const [activeLocale, setActiveLocale] = useState<Locale>(contentDefaultLocale);
  const [loadedRecipeTypes, setLoadedRecipeTypes] = useState<RecipeTypeOption[]>([]);
  const [loadedTemplates, setLoadedTemplates] = useState<RecipeTemplateRecord[]>([]);
  const [loadedTemplateDetail, setLoadedTemplateDetail] = useState<RecipeTemplateRecord>();
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [definitionText, setDefinitionText] = useState(() => prettyJSON(initialValue?.definition ?? {}));
  const [reason, setReason] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(!providedRecipeTypes);
  const [loadingTemplates, setLoadingTemplates] = useState(Boolean(initialValue?.recipeTypePublicId && !initialTemplates.some((item) => item.recipeTypePublicId === initialValue.recipeTypePublicId)));
  const [loadingTemplateDetail, setLoadingTemplateDetail] = useState(Boolean(initialValue?.templatePublicId && !initialTemplates.some((item) => item.publicId === initialValue.templatePublicId && (item.detailLoaded || item.slots.length > 0))));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingReview, setPendingReview] = useState(initialValue?.reviewStatus === "pending");
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const recipeTypes = providedRecipeTypes ?? loadedRecipeTypes;
  const recipeTypesLoading = providedRecipeTypes ? false : loadingTypes;
  const matchingInitialTemplates = initialTemplates.filter((item) => item.recipeTypePublicId === draft.recipeTypePublicId);
  const templates = matchingInitialTemplates.length ? matchingInitialTemplates : loadedTemplates;
  const selectedTemplateSummary = templates.find((template) => template.publicId === draft.templatePublicId);
  const selectedInitialTemplate = matchingInitialTemplates.find((template) => template.publicId === draft.templatePublicId && (template.detailLoaded || template.slots.length > 0));
  const selectedTemplate = selectedInitialTemplate ?? (loadedTemplateDetail?.publicId === draft.templatePublicId ? loadedTemplateDetail : undefined);
  const effectiveSelectedSlotKey = selectedTemplate?.slots.some((slot) => slot.slotKey === selectedSlotKey) ? selectedSlotKey : selectedTemplate?.slots[0]?.slotKey ?? "";
  const selectedSlot = selectedTemplate?.slots.find((slot) => slot.slotKey === effectiveSelectedSlotKey);
  const selectedBinding = selectedSlot ? draft.bindings[selectedSlot.slotKey] : undefined;
  const currentVersion = versions.find((version) => version.locale === activeLocale) ?? versions[0];
  const validation = validateRecipe(draft, selectedTemplate, definitionText, versions, contentDefaultLocale, labels);

  useEffect(() => {
    if (providedRecipeTypes) return;
    const controller = new AbortController();
    loadRecipeTypeOptions(token, controller.signal)
      .then((items) => { setLoadedRecipeTypes(items); setFailure(""); })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setFailure(reason instanceof Error ? reason.message : labels.loadFailed);
      })
      .finally(() => setLoadingTypes(false));
    return () => controller.abort();
  }, [labels.loadFailed, providedRecipeTypes, token]);

  useEffect(() => {
    const recipeTypePublicId = draft.recipeTypePublicId;
    if (!recipeTypePublicId || matchingInitialTemplates.length) return;
    const controller = new AbortController();
    loadRecipeTemplates(recipeTypePublicId, token, controller.signal)
      .then((items) => {
        setLoadedTemplates(items);
        setDraft((current) => ({ ...current, templatePublicId: items.some((item) => item.publicId === current.templatePublicId) ? current.templatePublicId : "" }));
        setFailure("");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setFailure(reason instanceof Error ? reason.message : labels.loadFailed);
      })
      .finally(() => setLoadingTemplates(false));
    return () => controller.abort();
  }, [draft.recipeTypePublicId, labels.loadFailed, matchingInitialTemplates.length, token]);

  useEffect(() => {
    const publicId = draft.templatePublicId;
    if (!publicId || selectedInitialTemplate || loadedTemplateDetail?.publicId === publicId) return;
    const controller = new AbortController();
    loadRecipeTemplate(publicId, token, controller.signal)
      .then((value) => {
        if (!value) {
          setFailure(labels.loadFailed);
          return;
        }
        setLoadedTemplateDetail(value);
        const slotKeys = new Set(value.slots.map((slot) => slot.slotKey));
        setDraft((current) => ({ ...current, bindings: Object.fromEntries(Object.entries(current.bindings).filter(([slotKey]) => slotKeys.has(slotKey))) }));
        setFailure("");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setFailure(reason instanceof Error ? reason.message : labels.loadFailed);
      })
      .finally(() => setLoadingTemplateDetail(false));
    return () => controller.abort();
  }, [draft.templatePublicId, labels.loadFailed, loadedTemplateDetail?.publicId, selectedInitialTemplate, token]);

  function selectLocale(next: Locale) {
    setActiveLocale(next);
    setVersions((current) => current.some((version) => version.locale === next) ? current : [...current, emptyRecipeLocalization(next)]);
  }

  function changeLocalizedField(field: keyof RecipeLocalizedFields, value: string) {
    const currentFields = currentVersion?.fields ?? emptyLocalizedFields();
    const nextFields = { ...currentFields, [field]: value };
    const baselineFields = baselineVersions.current.find((version) => version.locale === activeLocale)?.fields ?? emptyLocalizedFields();
    setVersions((current) => current.map((version) => version.locale === activeLocale
      ? { ...version, fields: nextFields, provenance: version.provenance === "ai" ? "human_corrected" : "human" }
      : version));
    setDirtyLocales((current) => withLocaleDirty(current, activeLocale, !sameLocalizedFields(nextFields, baselineFields)));
  }

  function changeRecipeType(recipeTypePublicId: string) {
    setLoadedTemplates([]);
    setLoadedTemplateDetail(undefined);
    setLoadingTemplateDetail(false);
    setLoadingTemplates(Boolean(recipeTypePublicId && !initialTemplates.some((item) => item.recipeTypePublicId === recipeTypePublicId)));
    setSelectedSlotKey("");
    setDraft((current) => ({ ...current, recipeTypePublicId, templatePublicId: "", bindings: {} }));
  }

  function changeTemplate(templatePublicId: string) {
    setSelectedSlotKey("");
    setLoadedTemplateDetail(undefined);
    setLoadingTemplateDetail(Boolean(templatePublicId && !matchingInitialTemplates.some((item) => item.publicId === templatePublicId && (item.detailLoaded || item.slots.length > 0))));
    setDraft((current) => ({ ...current, templatePublicId, bindings: {} }));
  }

  function setResources(slot: RecipeTemplateSlot, resources: CatalogResourceRef[]) {
    setDraft((current) => {
      const previous = new Map((current.bindings[slot.slotKey]?.candidates ?? []).map((candidate) => [candidate.resource.publicId, candidate]));
      const candidates = resources.map((resource) => {
        const existing = previous.get(resource.publicId);
        if (existing) return normalizeCandidateForRole(existing, slot.role);
        return normalizeCandidateForRole({ resource, amount: 1, probability: slot.role === "output" ? 1 : undefined, byproduct: false, definition: {} }, slot.role);
      });
      return { ...current, bindings: { ...current.bindings, [slot.slotKey]: { ...current.bindings[slot.slotKey], candidates } } };
    });
    setPickerOpen(false);
  }

  function updateCandidate(slot: RecipeTemplateSlot, candidateIndex: number, patch: Partial<RecipeCandidate>) {
    setDraft((current) => {
      const binding = current.bindings[slot.slotKey] ?? { candidates: [] };
      return {
        ...current,
        bindings: {
          ...current.bindings,
          [slot.slotKey]: { ...binding, candidates: binding.candidates.map((candidate, index) => index === candidateIndex ? normalizeCandidateForRole({ ...candidate, ...patch }, slot.role) : candidate) },
        },
      };
    });
  }

  function removeCandidate(slot: RecipeTemplateSlot, candidateIndex: number) {
    setDraft((current) => {
      const binding = current.bindings[slot.slotKey];
      if (!binding) return current;
      const candidates = binding.candidates.filter((_, index) => index !== candidateIndex);
      const bindings = { ...current.bindings };
      if (candidates.length) bindings[slot.slotKey] = { ...binding, candidates };
      else delete bindings[slot.slotKey];
      return { ...current, bindings };
    });
  }

  async function submit() {
    if (saving || validation.length || !selectedTemplate) return;
    setSaving(true);
    setFailure("");
    setMessage("");
    try {
      const definition = JSON.parse(definitionText) as Record<string, unknown>;
      const payload = recipeMutation(draft, selectedTemplate, versions, dirtyLocales, contentDefaultLocale, reason, definition);
      const result = await saveRecipe(draft.recipeTypePublicId, draft.publicId, payload, token);
      const next = { ...draft, publicId: result.objectPublicId || draft.publicId, definition, publishedRevisionId: result.reviewStatus === "approved" ? result.revisionId : draft.publishedRevisionId };
      setDraft(next);
      setPendingReview(result.reviewStatus === "pending");
      if (result.reviewStatus === "approved") {
        baselineVersions.current = cloneLocalizations(versions);
        setDirtyLocales(new Set());
      }
      setMessage(result.reviewStatus === "pending" ? labels.reviewPending : labels.saved);
      onSaved?.(result, next);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : labels.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function removeRecipe() {
    if (!draft.publicId || deleting || !window.confirm(labels.deleteConfirm)) return;
    setDeleting(true);
    setFailure("");
    setMessage("");
    try {
      const result = await deleteRecipe(draft.publicId, draft.publishedRevisionId, reason, token);
      setPendingReview(true);
      setMessage(result.reviewStatus === "pending" ? labels.reviewPending : labels.deleted);
      onDeleted?.(result);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : labels.deleteFailed);
    } finally {
      setDeleting(false);
    }
  }

  const pickerValue = selectedBinding?.candidates.map((candidate) => candidate.resource).filter((resource) => resource.publicId) ?? [];

  return <div className="grid gap-5">
    <ContentLanguageSwitcher labels={{ title: labels.localization }} value={activeLocale} versions={versions} onChange={selectLocale} />
    <section className="surface grid gap-4 rounded-lg border border-[var(--line)] p-4">
      <h2 className="text-lg font-black">{labels.localization}</h2>
      <label className="grid gap-2 text-sm font-bold">{labels.localizedName}<input className="field" value={currentVersion?.fields.name ?? ""} onChange={(event) => changeLocalizedField("name", event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-bold">{labels.localizedSummary}<textarea className="field min-h-20" value={currentVersion?.fields.summary ?? ""} onChange={(event) => changeLocalizedField("summary", event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-bold">{labels.localizedDescription}<textarea className="field min-h-32" value={currentVersion?.fields.contentMarkdown ?? ""} onChange={(event) => changeLocalizedField("contentMarkdown", event.target.value)} /></label>
    </section>

    <section className="surface grid gap-4 rounded-lg border border-[var(--line)] p-4">
      <h2 className="text-lg font-black">{labels.invariantSettings}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">{labels.recipeType}<select className="field" disabled={recipeTypesLoading || Boolean(draft.publicId)} value={draft.recipeTypePublicId} onChange={(event) => changeRecipeType(event.target.value)}><option value="">{recipeTypesLoading ? labels.loadingRecipeTypes : labels.selectRecipeType}</option>{recipeTypes.map((item) => <option key={item.publicId} value={item.publicId}>{item.name} ({item.canonicalId})</option>)}</select>{!recipeTypesLoading && !recipeTypes.length ? <small className="text-[var(--muted)]">{labels.noRecipeTypes}</small> : null}</label>
        <label className="grid gap-2 text-sm font-bold">{labels.template}<select className="field" disabled={!draft.recipeTypePublicId || loadingTemplates} value={draft.templatePublicId} onChange={(event) => changeTemplate(event.target.value)}><option value="">{loadingTemplates ? labels.loadingTemplates : labels.selectTemplate}</option>{templates.map((item) => <option key={item.publicId || item.templateKey} value={item.publicId}>{item.templateKey}</option>)}</select>{draft.recipeTypePublicId && !loadingTemplates && !templates.length ? <small className="text-[var(--muted)]">{labels.noTemplates}</small> : null}</label>
      </div>
      <label className="grid gap-2 text-sm font-bold">{labels.canonicalSourceId}<input className="field font-mono" required value={draft.canonicalSourceId} onChange={(event) => setDraft((current) => ({ ...current, canonicalSourceId: event.target.value }))} /></label>
      <label className="grid gap-2 text-sm font-bold">{labels.definition}<textarea className="field min-h-28 font-mono text-xs" spellCheck={false} value={definitionText} onChange={(event) => setDefinitionText(event.target.value)} /></label>
    </section>

    <section className="surface rounded-lg border border-[var(--line)] p-4">
      <div><h2 className="text-lg font-black">{labels.canvas}</h2><p className="mt-1 text-sm text-[var(--muted)]">{labels.selectSlotHint}</p></div>
      {selectedTemplate ? <div className="mt-4 overflow-auto rounded-lg border border-[var(--line)] bg-[#c6c6c6] p-4"><div aria-label={labels.canvas} className="relative mx-auto w-full max-w-4xl overflow-hidden border border-black/20 bg-[#8b8b8b] bg-contain bg-center bg-no-repeat shadow-inner [image-rendering:pixelated]" role="group" style={{ aspectRatio: `${Math.max(1, selectedTemplate.canvas.width)} / ${Math.max(1, selectedTemplate.canvas.height)}`, backgroundImage: safeImageURL(selectedTemplate.backgroundUrl) ? `url(${JSON.stringify(safeImageURL(selectedTemplate.backgroundUrl))})` : undefined }}>
        {selectedTemplate.slots.map((slot) => <RecipeCanvasSlot binding={draft.bindings[slot.slotKey]} canvas={selectedTemplate} key={slot.slotKey} labels={labels} selected={slot.slotKey === effectiveSelectedSlotKey} slot={slot} onSelect={() => setSelectedSlotKey(slot.slotKey)} />)}
      </div></div> : <p className="mt-4 rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">{loadingTemplates || loadingTemplateDetail ? labels.loadingTemplates : selectedTemplateSummary ? labels.loadingTemplates : labels.noTemplates}</p>}
    </section>

    <section className="surface rounded-lg border border-[var(--line)] p-4">
      <h2 className="text-lg font-black">{labels.selectedSlot}</h2>
      {!selectedSlot ? <p className="mt-4 rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">{labels.noSelectedSlot}</p> : <div className="mt-4 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="font-mono">{selectedSlot.slotKey}</strong><span className="ml-2 rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs font-black">{slotRoleLabel(selectedSlot.role, labels)}</span></div><div className="flex flex-wrap gap-2"><button className="button-primary focus-ring" type="button" onClick={() => setPickerOpen(true)}>{labels.chooseResources}</button>{selectedBinding?.candidates.length ? <button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={() => setResources(selectedSlot, [])}>{labels.clearResources}</button> : null}</div></div>
        {selectedSlot.role === "output" ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm text-[var(--muted)]">{labels.outputCandidateHint}</p> : null}
        {!selectedBinding?.candidates.length ? <p className="rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">{labels.candidates}: {labels.required}</p> : <div className="grid gap-3">{selectedBinding.candidates.map((candidate, candidateIndex) => <CandidateEditor candidate={candidate} index={candidateIndex} key={`${candidate.resource.publicId}:${candidate.resource.id}:${candidateIndex}`} labels={labels} role={selectedSlot.role} onChange={(patch) => updateCandidate(selectedSlot, candidateIndex, patch)} onRemove={() => removeCandidate(selectedSlot, candidateIndex)} />)}</div>}
      </div>}
    </section>

    <label className="grid gap-2 text-sm font-bold">{labels.changeReason}<textarea className="field min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {validation.length ? <div className="rounded-lg border border-[var(--red)] bg-red-50 p-3 text-sm text-[var(--red)]" role="alert"><strong>{labels.validationSummary}</strong><ul className="mt-2 list-disc pl-5">{validation.map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}</ul></div> : null}
    {failure ? <p className="rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]" role="alert">{failure}</p> : null}
    {message ? <p className="rounded-lg border border-[var(--line)] p-3 text-sm font-bold" role="status">{message}</p> : null}
    <div className="flex flex-wrap justify-end gap-2">{draft.publicId ? <button className="button-secondary focus-ring text-[var(--red)]" disabled={saving || deleting || pendingReview} type="button" onClick={() => void removeRecipe()}>{deleting ? labels.deleting : labels.delete}</button> : null}<button className="button-primary focus-ring" disabled={saving || deleting || pendingReview || validation.length > 0} type="button" onClick={() => void submit()}>{saving ? labels.saving : labels.save}</button></div>

    {selectedSlot ? <ResourcePickerDialog labels={labels.resourcePicker} multiple open={pickerOpen} token={token} value={pickerValue} onClose={() => setPickerOpen(false)} onConfirm={(resources) => setResources(selectedSlot, resources)} /> : null}
  </div>;
}

function RecipeCanvasSlot({ slot, binding, canvas, selected, labels, onSelect }: { slot: RecipeTemplateSlot; binding?: RecipeBinding; canvas: RecipeTemplateRecord; selected: boolean; labels: RecipeEditorLabels; onSelect: () => void }) {
  const first = binding?.candidates[0]?.resource;
  const icon = catalogResourceIconURL(first?.iconUrl);
  const count = binding?.candidates.length ?? 0;
  return <button aria-label={`${slotRoleLabel(slot.role, labels)} ${slot.slotKey}`} className={`absolute overflow-visible border-2 bg-black/10 ${slotVisualClass(slot.role, selected)}`} style={{ left: `${slot.rect.x / canvas.canvas.width * 100}%`, top: `${slot.rect.y / canvas.canvas.height * 100}%`, width: `${slot.rect.width / canvas.canvas.width * 100}%`, height: `${slot.rect.height / canvas.canvas.height * 100}%`, backgroundImage: icon ? `url(${JSON.stringify(icon)})` : undefined, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" }} title={slot.slotKey} type="button" onClick={onSelect}>
    {count > 1 ? <span className="absolute -right-2 -top-2 z-20 rounded-full bg-black px-1.5 py-0.5 text-[9px] font-black leading-none text-white">+{count - 1}</span> : null}
  </button>;
}

function CandidateEditor({ candidate, role, index, labels, onChange, onRemove }: { candidate: RecipeCandidate; role: RecipeSlotRole; index: number; labels: RecipeEditorLabels; onChange: (patch: Partial<RecipeCandidate>) => void; onRemove: () => void }) {
  const percent = candidate.probability === undefined ? "" : round(candidate.probability * 100);
  return <article className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 lg:grid-cols-[minmax(0,1fr)_140px_150px_130px_auto] lg:items-end">
    <div className="min-w-0"><CatalogResourceIdentity labels={labels.resourcePicker} resource={candidate.resource} /><span className="sr-only">{index + 1}</span></div>
    <label className="grid gap-2 text-sm font-bold">{labels.amount}<input className="field" min="0.000001" step="any" type="number" value={candidate.amount} onChange={(event) => onChange({ amount: Number(event.target.value) })} /></label>
    {role === "output" ? <label className="grid gap-2 text-sm font-bold">{labels.probabilityPercent}<input className="field" max={100} min={0} step="any" type="number" value={percent} onChange={(event) => onChange({ probability: probabilityFromPercent(event.target.value) })} /></label> : <span />}
    {role === "output" ? <label className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-bold"><input checked={candidate.byproduct === true} type="checkbox" onChange={(event) => onChange({ byproduct: event.target.checked })} />{labels.byproduct}</label> : <span />}
    <button aria-label={labels.removeCandidate} className="button-secondary focus-ring text-[var(--red)]" title={labels.removeCandidate} type="button" onClick={onRemove}>{labels.removeCandidate}</button>
  </article>;
}

function initialRecipe(value?: RecipeRecord): RecipeRecord {
  if (value) return { ...value, definition: { ...value.definition }, bindings: Object.fromEntries(Object.entries(value.bindings).map(([key, binding]) => [key, { ...binding, candidates: binding.candidates.map((candidate) => ({ ...candidate, resource: { ...candidate.resource }, definition: { ...candidate.definition } })) }])) };
  return { recipeTypePublicId: "", templatePublicId: "", canonicalSourceId: "", definition: {}, bindings: {} };
}

function initialRecipeLocalizations(value: RecipeRecord | undefined, locale: Locale) {
  if (value?.localizations?.length) return value.localizations.map((version) => ({ ...version, fields: { ...version.fields } }));
  return [emptyRecipeLocalization(locale)];
}

function emptyRecipeLocalization(locale: string): LocalizationVersion<RecipeLocalizedFields> {
  return { locale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human", reviewStatus: "draft", editable: true };
}

function normalizeCandidateForRole(candidate: RecipeCandidate, role: RecipeSlotRole): RecipeCandidate {
  if (role === "output") return { ...candidate, byproduct: candidate.byproduct === true };
  return { resource: candidate.resource, amount: candidate.amount, definition: candidate.definition };
}

function recipeMutation(draft: RecipeRecord, template: RecipeTemplateRecord, versions: LocalizationVersion<RecipeLocalizedFields>[], dirtyLocales: ReadonlySet<string>, defaultLocale: Locale, reason: string, definition: Record<string, unknown>): RecipeMutation {
  const roles = new Map(template.slots.map((slot) => [slot.slotKey, slot.role]));
  return {
    baseRevisionId: draft.publishedRevisionId,
    reason,
    defaultLocale,
    localizations: recipeMutationLocalizations(versions, dirtyLocales, defaultLocale, Boolean(draft.publicId)),
    recipeTypePublicId: draft.recipeTypePublicId,
    templatePublicId: draft.templatePublicId,
    canonicalSourceId: draft.canonicalSourceId.trim(),
    definition,
    bindings: Object.fromEntries(Object.entries(draft.bindings).filter(([, binding]) => binding.candidates.length > 0).map(([slotKey, binding]) => {
      const output = roles.get(slotKey) === "output";
      return [slotKey, {
        definition: binding.definition,
        candidates: binding.candidates.map((candidate) => ({
          resourcePublicId: candidate.resource.publicId,
          amount: candidate.amount,
          ...(output && candidate.probability !== undefined ? { probability: candidate.probability } : {}),
          ...(output ? { byproduct: candidate.byproduct === true } : {}),
          definition: candidate.definition,
        })),
      }];
    })),
  };
}

function recipeMutationLocalizations(versions: LocalizationVersion<RecipeLocalizedFields>[], dirtyLocales: ReadonlySet<string>, defaultLocale: Locale, editing: boolean) {
  return versions
    .filter((version) => editing
      ? dirtyLocales.has(version.locale)
      : version.locale === defaultLocale || hasRecipeLocalizedContent(version.fields))
    .map((version) => ({ locale: version.locale, ...version.fields }));
}

function hasRecipeLocalizedContent(fields: RecipeLocalizedFields) {
  return Boolean(fields.name.trim() || fields.summary.trim() || fields.contentMarkdown.trim());
}

function validateRecipe(
  draft: RecipeRecord,
  template: RecipeTemplateRecord | undefined,
  definitionText: string,
  versions: LocalizationVersion<RecipeLocalizedFields>[],
  defaultLocale: Locale,
  labels: RecipeEditorLabels,
) {
  const errors: string[] = [];
  const defaultName = versions.find((version) => version.locale === defaultLocale)?.fields.name.trim();
  if (!defaultName) errors.push(`${labels.localizedName}: ${labels.required}`);
  if (!draft.recipeTypePublicId) errors.push(`${labels.recipeType}: ${labels.required}`);
  if (!draft.templatePublicId || !template) errors.push(`${labels.template}: ${labels.required}`);
  if (!draft.canonicalSourceId.trim()) errors.push(`${labels.canonicalSourceId}: ${labels.required}`);
  try {
    const definition = JSON.parse(definitionText);
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) errors.push(labels.invalidDefinition);
  } catch {
    errors.push(labels.invalidDefinition);
  }
  if (!template) return [...new Set(errors)];
  if (!template.slots.some((slot) => slot.role === "output")) errors.push(labels.missingOutput);
  for (const slot of template.slots) {
    const candidates = draft.bindings[slot.slotKey]?.candidates ?? [];
    if (!candidates.length && slot.definition?.optional !== true) errors.push(`${labels.missingRequiredSlot}: ${slot.slotKey}`);
    for (const candidate of candidates) {
      if (!candidate.resource.publicId) errors.push(`${slot.slotKey}: ${labels.required}`);
      if (!Number.isFinite(candidate.amount) || candidate.amount <= 0) errors.push(`${slot.slotKey}: ${labels.invalidAmount}`);
      if (slot.role === "output" && candidate.probability !== undefined && (!Number.isFinite(candidate.probability) || candidate.probability < 0 || candidate.probability > 1)) errors.push(`${slot.slotKey}: ${labels.invalidProbability}`);
    }
  }
  return [...new Set(errors)];
}

function slotRoleLabel(role: RecipeSlotRole, labels: RecipeEditorLabels) {
  return role === "output" ? labels.slotOutput : role === "catalyst" ? labels.slotCatalyst : labels.slotInput;
}

function slotVisualClass(role: RecipeSlotRole, selected: boolean) {
  const color = role === "output" ? "border-emerald-500" : role === "catalyst" ? "border-amber-500" : "border-sky-600";
  return `${color} ${selected ? "z-20 ring-2 ring-white ring-offset-2 ring-offset-black/40" : "z-10 hover:ring-2 hover:ring-white"}`;
}

function safeImageURL(value?: string) {
  const candidate = value?.trim() ?? "";
  if (!candidate) return "";
  if (candidate.startsWith("/")) return `${API_BASE_URL}${candidate}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function probabilityFromPercent(value: string) {
  if (!value.trim()) return undefined;
  const percent = Number(value);
  return Number.isFinite(percent) ? percent / 100 : Number.NaN;
}

function prettyJSON(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function editableLocale(value: string | undefined, fallback: Locale): Locale {
  return supportedLocales.some((item) => item.code === value) ? value as Locale : fallback;
}

function emptyLocalizedFields(): RecipeLocalizedFields {
  return { name: "", summary: "", contentMarkdown: "" };
}

function sameLocalizedFields(left: RecipeLocalizedFields, right: RecipeLocalizedFields) {
  return left.name === right.name && left.summary === right.summary && left.contentMarkdown === right.contentMarkdown;
}

function withLocaleDirty(current: Set<string>, locale: string, dirty: boolean) {
  if (current.has(locale) === dirty) return current;
  const next = new Set(current);
  if (dirty) next.add(locale);
  else next.delete(locale);
  return next;
}

function cloneLocalizations(versions: LocalizationVersion<RecipeLocalizedFields>[]) {
  return versions.map((version) => ({ ...version, fields: { ...version.fields } }));
}
