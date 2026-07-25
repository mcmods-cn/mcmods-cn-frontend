"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "../../_lib/api";
import { uploadUserFileToOSS } from "../../_lib/oss-upload";
import { deleteRecipeTemplate, saveRecipeTemplate } from "../../_lib/recipe-editor-api";
import type {
  CatalogEditResult,
  RecipeLocalizedFields,
  RecipeSlotRect,
  RecipeSlotRole,
  RecipeTemplateMutation,
  RecipeTemplateRecord,
  RecipeTemplateSlot,
} from "../../_lib/recipe-editor-types";
import type { LocalizationVersion } from "../../_lib/editor-types";
import { supportedLocales, type Locale, useI18n } from "../../_lib/i18n-provider";
import { ContentLanguageSwitcher } from "./content-language-switcher";

export type RecipeTemplateEditorLabels = {
  localization: string;
  localizedName: string;
  localizedSummary: string;
  localizedDescription: string;
  invariantSettings: string;
  templateKey: string;
  background: string;
  uploadBackground: string;
  uploadingBackground: string;
  removeBackground: string;
  canvas: string;
  canvasWidth: string;
  canvasHeight: string;
  imageScale: string;
  slotPalette: string;
  roleInput: string;
  roleOutput: string;
  roleCatalyst: string;
  addSlotHint: string;
  slots: string;
  emptySlots: string;
  slotKey: string;
  slotRole: string;
  outputIndex: string;
  x: string;
  y: string;
  width: string;
  height: string;
  removeSlot: string;
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
  duplicateSlotKey: string;
  invalidCanvas: string;
  slotOutsideCanvas: string;
  invalidSlotSize: string;
  invalidOutputIndex: string;
  outputIndexOnly: string;
  uploadFailed: string;
  saveFailed: string;
  deleteFailed: string;
};

export function RecipeTemplateEditor({
  recipeTypePublicId,
  token,
  initialValue,
  defaultLocale,
  labels,
  onSaved,
  onDeleted,
}: {
  recipeTypePublicId: string;
  token: string;
  initialValue?: RecipeTemplateRecord;
  defaultLocale?: Locale;
  labels: RecipeTemplateEditorLabels;
  onSaved?: (result: CatalogEditResult, value: RecipeTemplateRecord) => void;
  onDeleted?: (result: CatalogEditResult) => void;
}) {
  const { locale: uiLocale } = useI18n();
  const [contentDefaultLocale] = useState<Locale>(() => editableLocale(initialValue?.defaultLocale, defaultLocale ?? uiLocale));
  const [draft, setDraft] = useState<RecipeTemplateRecord>(() => initialTemplate(recipeTypePublicId, initialValue));
  const [versions, setVersions] = useState<LocalizationVersion<RecipeLocalizedFields>[]>(() => initialLocalizations(initialValue, contentDefaultLocale));
  const baselineVersions = useRef<LocalizationVersion<RecipeLocalizedFields>[]>(initialLocalizations(initialValue, contentDefaultLocale));
  const [dirtyLocales, setDirtyLocales] = useState<Set<string>>(() => new Set());
  const [activeLocale, setActiveLocale] = useState<Locale>(contentDefaultLocale);
  const [newSlotRole, setNewSlotRole] = useState<RecipeSlotRole>("input");
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const [backgroundPreview, setBackgroundPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingReview, setPendingReview] = useState(initialValue?.reviewStatus === "pending");
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<PointerOperation | undefined>(undefined);
  const validation = useMemo(
    () => validateTemplate(draft, versions, contentDefaultLocale, labels),
    [contentDefaultLocale, draft, labels, versions],
  );
  const currentVersion = versions.find((version) => version.locale === activeLocale) ?? versions[0];

  useEffect(() => () => {
    if (backgroundPreview.startsWith("blob:")) URL.revokeObjectURL(backgroundPreview);
  }, [backgroundPreview]);

  function selectLocale(next: Locale) {
    setActiveLocale(next);
    setVersions((current) => current.some((version) => version.locale === next)
      ? current
      : [...current, emptyLocalization(next)]);
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

  function updateDraft(patch: Partial<RecipeTemplateRecord>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateCanvas(field: "width" | "height" | "imageScale", value: number) {
    setDraft((current) => ({ ...current, canvas: { ...current.canvas, [field]: value } }));
  }

  function addSlotAt(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const point = logicalPoint(event.clientX, event.clientY, canvasRef.current, draft.canvas.width, draft.canvas.height);
    const size = Math.max(4, Math.min(18, draft.canvas.width, draft.canvas.height));
    const ordinal = draft.slots.length;
    const outputCount = draft.slots.filter((slot) => slot.role === "output").length;
    const slot: RecipeTemplateSlot = {
      slotKey: nextSlotKey(draft.slots, newSlotRole),
      role: newSlotRole,
      outputIndex: newSlotRole === "output" ? outputCount : undefined,
      ordinal,
      rect: clampRect({ x: point.x - size / 2, y: point.y - size / 2, width: size, height: size }, draft.canvas.width, draft.canvas.height),
      definition: {},
    };
    setDraft((current) => ({ ...current, slots: [...current.slots, slot] }));
    setSelectedSlot(ordinal);
  }

  function beginPointer(event: React.PointerEvent, index: number, mode: "move" | "resize") {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const slot = draft.slots[index];
    pointer.current = { pointerId: event.pointerId, index, mode, startX: event.clientX, startY: event.clientY, rect: { ...slot.rect } };
    canvasRef.current?.setPointerCapture(event.pointerId);
    setSelectedSlot(index);
  }

  function movePointer(event: React.PointerEvent<HTMLDivElement>) {
    const operation = pointer.current;
    const canvas = canvasRef.current;
    if (!operation || operation.pointerId !== event.pointerId || !canvas) return;
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const dx = (event.clientX - operation.startX) * draft.canvas.width / Math.max(1, bounds.width);
    const dy = (event.clientY - operation.startY) * draft.canvas.height / Math.max(1, bounds.height);
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot, index) => index !== operation.index ? slot : {
        ...slot,
        rect: operation.mode === "move"
          ? clampRect({ ...operation.rect, x: operation.rect.x + dx, y: operation.rect.y + dy }, current.canvas.width, current.canvas.height)
          : clampRect({ ...operation.rect, width: Math.max(4, operation.rect.width + dx), height: Math.max(4, operation.rect.height + dy) }, current.canvas.width, current.canvas.height),
      }),
    }));
  }

  function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (pointer.current?.pointerId !== event.pointerId) return;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
    pointer.current = undefined;
  }

  function updateSlot(index: number, patch: Partial<RecipeTemplateSlot>) {
    setDraft((current) => ({ ...current, slots: current.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...patch } : slot) }));
  }

  function updateSlotRect(index: number, field: keyof RecipeSlotRect, value: number) {
    setDraft((current) => ({ ...current, slots: current.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, rect: { ...slot.rect, [field]: value } } : slot) }));
  }

  function changeRole(index: number, role: RecipeSlotRole) {
    const outputIndex = role === "output"
      ? draft.slots[index].outputIndex ?? draft.slots.filter((slot) => slot.role === "output").length
      : undefined;
    updateSlot(index, { role, outputIndex });
  }

  function removeSlot(index: number) {
    setDraft((current) => ({ ...current, slots: current.slots.filter((_, slotIndex) => slotIndex !== index).map((slot, ordinal) => ({ ...slot, ordinal })) }));
    setSelectedSlot((current) => Math.max(0, Math.min(current, draft.slots.length - 2)));
  }

  async function uploadBackground(file?: File) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setBackgroundPreview(preview);
    setUploading(true);
    setFailure("");
    try {
      const uploaded = await uploadUserFileToOSS(
        file,
        token,
        `recipe_gui:${recipeTypePublicId}:${draft.publicId || "staging"}`,
      );
      if (!uploaded.id) throw new Error(labels.uploadFailed);
      setDraft((current) => ({ ...current, backgroundFileId: uploaded.id, backgroundUrl: uploaded.accessUrl || uploaded.url || current.backgroundUrl }));
    } catch (reason) {
      setBackgroundPreview("");
      setFailure(reason instanceof Error ? reason.message : labels.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  function removeBackground() {
    setBackgroundPreview("");
    updateDraft({ backgroundFileId: undefined, backgroundUrl: undefined });
  }

  async function submit() {
    if (saving || validation.length) return;
    setSaving(true);
    setFailure("");
    setMessage("");
    try {
      const payload = templateMutation(draft, versions, dirtyLocales, contentDefaultLocale, reason);
      const result = await saveRecipeTemplate(recipeTypePublicId, draft.publicId, payload, token);
      const next = { ...draft, publicId: result.objectPublicId || draft.publicId, publishedRevisionId: result.reviewStatus === "approved" ? result.revisionId : draft.publishedRevisionId };
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

  async function removeTemplate() {
    if (!draft.publicId || deleting || !window.confirm(labels.deleteConfirm)) return;
    setDeleting(true);
    setFailure("");
    setMessage("");
    try {
      const result = await deleteRecipeTemplate(draft.publicId, draft.publishedRevisionId, reason, token);
      setPendingReview(true);
      setMessage(result.reviewStatus === "pending" ? labels.reviewPending : labels.deleted);
      onDeleted?.(result);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : labels.deleteFailed);
    } finally {
      setDeleting(false);
    }
  }

  const background = backgroundPreview || safeImageURL(draft.backgroundUrl);
  const activeSlot = draft.slots[selectedSlot];

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
      <label className="grid gap-2 text-sm font-bold">{labels.templateKey}<input className="field font-mono" required value={draft.templateKey} onChange={(event) => updateDraft({ templateKey: event.target.value })} /></label>
      <fieldset className="grid gap-3 rounded-lg border border-[var(--line)] p-3">
        <legend className="px-1 text-sm font-black">{labels.background}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`button-secondary focus-ring cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>{uploading ? labels.uploadingBackground : labels.uploadBackground}<input className="sr-only" accept="image/*" disabled={uploading} type="file" onChange={(event) => void uploadBackground(event.target.files?.[0])} /></label>
          {(draft.backgroundFileId || draft.backgroundUrl || backgroundPreview) ? <button className="button-secondary focus-ring text-[var(--red)]" disabled={uploading} type="button" onClick={removeBackground}>{labels.removeBackground}</button> : null}
        </div>
      </fieldset>
      <fieldset className="grid gap-3 rounded-lg border border-[var(--line)] p-3">
        <legend className="px-1 text-sm font-black">{labels.canvas}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField label={labels.canvasWidth} min={1} value={draft.canvas.width} onChange={(value) => updateCanvas("width", value)} />
          <NumberField label={labels.canvasHeight} min={1} value={draft.canvas.height} onChange={(value) => updateCanvas("height", value)} />
          <NumberField label={labels.imageScale} min={1} value={draft.canvas.imageScale} onChange={(value) => updateCanvas("imageScale", value)} />
        </div>
      </fieldset>
    </section>

    <section className="surface rounded-lg border border-[var(--line)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-black">{labels.slotPalette}</h2><p className="mt-1 text-sm text-[var(--muted)]">{labels.addSlotHint}</p></div>
        <div className="flex flex-wrap gap-2">{(["input", "output", "catalyst"] as const).map((role) => <button aria-pressed={newSlotRole === role} className={`focus-ring rounded-md border px-3 py-2 text-sm font-black ${newSlotRole === role ? roleButtonClass(role) : "border-[var(--line)] bg-[var(--panel-subtle)]"}`} key={role} type="button" onClick={() => setNewSlotRole(role)}>{roleLabel(role, labels)}</button>)}</div>
      </div>
      <div className="mt-4 overflow-auto rounded-lg border border-[var(--line)] bg-[#c6c6c6] p-4">
        <div
          aria-label={labels.canvas}
          className="relative mx-auto w-full max-w-4xl touch-none overflow-hidden border border-black/20 bg-[#8b8b8b] bg-contain bg-center bg-no-repeat shadow-inner [image-rendering:pixelated]"
          ref={canvasRef}
          role="application"
          style={{ aspectRatio: `${Math.max(1, draft.canvas.width)} / ${Math.max(1, draft.canvas.height)}`, backgroundImage: background ? `url(${JSON.stringify(background)})` : undefined }}
          onPointerDown={addSlotAt}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          {draft.slots.map((slot, index) => <button
            aria-label={`${roleLabel(slot.role, labels)} ${slot.slotKey}`}
            className={`absolute touch-none border-2 shadow-sm ${slotClass(slot.role, index === selectedSlot)}`}
            key={`${slot.ordinal}:${index}`}
            style={rectStyle(slot.rect, draft.canvas.width, draft.canvas.height)}
            title={slot.slotKey}
            type="button"
            onClick={(event) => { event.stopPropagation(); setSelectedSlot(index); }}
            onKeyDown={(event) => {
              const amount = event.shiftKey ? 5 : 1;
              const moves: Partial<Record<string, [number, number]>> = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] };
              const move = moves[event.key];
              if (!move) return;
              event.preventDefault();
              updateSlot(index, { rect: clampRect({ ...slot.rect, x: slot.rect.x + move[0], y: slot.rect.y + move[1] }, draft.canvas.width, draft.canvas.height) });
            }}
            onPointerDown={(event) => beginPointer(event, index, "move")}
          >
            <span className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden text-[9px] font-black leading-none text-white [text-shadow:0_1px_2px_#000]">{index + 1}</span>
            <span aria-hidden className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize border border-white bg-black" onPointerDown={(event) => beginPointer(event, index, "resize")} />
          </button>)}
        </div>
      </div>
    </section>

    <section className="surface rounded-lg border border-[var(--line)] p-4">
      <h2 className="text-lg font-black">{labels.slots}</h2>
      {!activeSlot ? <p className="mt-4 rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">{labels.emptySlots}</p> : <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-bold md:col-span-2">{labels.slotKey}<input className="field font-mono" value={activeSlot.slotKey} onChange={(event) => updateSlot(selectedSlot, { slotKey: event.target.value })} /></label>
        <label className="grid gap-2 text-sm font-bold">{labels.slotRole}<select className="field" value={activeSlot.role} onChange={(event) => changeRole(selectedSlot, event.target.value as RecipeSlotRole)}><option value="input">{labels.roleInput}</option><option value="output">{labels.roleOutput}</option><option value="catalyst">{labels.roleCatalyst}</option></select></label>
        <label className="grid gap-2 text-sm font-bold">{labels.outputIndex}<input className="field" disabled={activeSlot.role !== "output"} min={0} type="number" value={activeSlot.outputIndex ?? ""} onChange={(event) => updateSlot(selectedSlot, { outputIndex: nonNegativeIntegerOrUndefined(event.target.value) })} /></label>
        <NumberField label={labels.x} value={activeSlot.rect.x} onChange={(value) => updateSlotRect(selectedSlot, "x", value)} />
        <NumberField label={labels.y} value={activeSlot.rect.y} onChange={(value) => updateSlotRect(selectedSlot, "y", value)} />
        <NumberField label={labels.width} min={1} value={activeSlot.rect.width} onChange={(value) => updateSlotRect(selectedSlot, "width", value)} />
        <NumberField label={labels.height} min={1} value={activeSlot.rect.height} onChange={(value) => updateSlotRect(selectedSlot, "height", value)} />
        <button className="button-secondary focus-ring justify-self-start text-[var(--red)] md:col-span-2 xl:col-span-4" type="button" onClick={() => removeSlot(selectedSlot)}>{labels.removeSlot}</button>
      </div>}
    </section>

    <label className="grid gap-2 text-sm font-bold">{labels.changeReason}<textarea className="field min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {validation.length ? <div className="rounded-lg border border-[var(--red)] bg-red-50 p-3 text-sm text-[var(--red)]" role="alert"><strong>{labels.validationSummary}</strong><ul className="mt-2 list-disc pl-5">{validation.map((item, index) => <li key={`${item}:${index}`}>{item}</li>)}</ul></div> : null}
    {failure ? <p className="rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]" role="alert">{failure}</p> : null}
    {message ? <p className="rounded-lg border border-[var(--line)] p-3 text-sm font-bold" role="status">{message}</p> : null}
    <div className="flex flex-wrap justify-end gap-2">{draft.publicId ? <button className="button-secondary focus-ring text-[var(--red)]" disabled={saving || deleting || pendingReview} type="button" onClick={() => void removeTemplate()}>{deleting ? labels.deleting : labels.delete}</button> : null}<button className="button-primary focus-ring" disabled={saving || deleting || uploading || pendingReview || validation.length > 0} type="button" onClick={() => void submit()}>{saving ? labels.saving : labels.save}</button></div>
  </div>;
}

type PointerOperation = {
  pointerId: number;
  index: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  rect: RecipeSlotRect;
};

function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return <label className="grid gap-2 text-sm font-bold">{label}<input className="field" min={min} step="any" type="number" value={Number.isFinite(value) ? value : ""} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function initialTemplate(recipeTypePublicId: string, value?: RecipeTemplateRecord): RecipeTemplateRecord {
  if (value) return { ...value, canvas: { ...value.canvas }, definition: { ...value.definition }, slots: value.slots.map((slot) => ({ ...slot, rect: { ...slot.rect }, definition: { ...slot.definition } })) };
  return { recipeTypePublicId, templateKey: "", canvas: { width: 176, height: 86, imageScale: 1, definition: {} }, definition: {}, slots: [] };
}

function initialLocalizations(value: RecipeTemplateRecord | undefined, locale: Locale) {
  if (value?.localizations?.length) return value.localizations.map((version) => ({ ...version, fields: { ...version.fields } }));
  return [emptyLocalization(locale)];
}

function emptyLocalization(locale: string): LocalizationVersion<RecipeLocalizedFields> {
  return { locale, fields: { name: "", summary: "", contentMarkdown: "" }, provenance: "human", reviewStatus: "draft", editable: true };
}

function templateMutation(draft: RecipeTemplateRecord, versions: LocalizationVersion<RecipeLocalizedFields>[], dirtyLocales: ReadonlySet<string>, defaultLocale: Locale, reason: string): RecipeTemplateMutation {
  return {
    baseRevisionId: draft.publishedRevisionId,
    reason,
    defaultLocale,
    localizations: mutationLocalizations(versions, dirtyLocales, defaultLocale, Boolean(draft.publicId)),
    templateKey: draft.templateKey.trim(),
    backgroundFileId: draft.backgroundFileId,
    canvas: { ...draft.canvas, width: Math.round(draft.canvas.width), height: Math.round(draft.canvas.height), imageScale: Math.round(draft.canvas.imageScale) },
    // Signed private-OSS URLs are preview-only. The durable relation is backgroundFileId.
    definition: { ...draft.definition },
    slots: draft.slots.map((slot, ordinal) => ({ ...slot, ordinal, slotKey: slot.slotKey.trim(), rect: roundRect(slot.rect) })),
  };
}

function mutationLocalizations(versions: LocalizationVersion<RecipeLocalizedFields>[], dirtyLocales: ReadonlySet<string>, defaultLocale: Locale, editing: boolean) {
  return versions
    .filter((version) => editing
      ? dirtyLocales.has(version.locale)
      : version.locale === defaultLocale || hasLocalizedContent(version.fields))
    .map((version) => ({ locale: version.locale, ...version.fields }));
}

function hasLocalizedContent(fields: RecipeLocalizedFields) {
  return Boolean(fields.name.trim() || fields.summary.trim() || fields.contentMarkdown.trim());
}

function validateTemplate(
  draft: RecipeTemplateRecord,
  versions: LocalizationVersion<RecipeLocalizedFields>[],
  defaultLocale: Locale,
  labels: RecipeTemplateEditorLabels,
) {
  const errors: string[] = [];
  if (!draft.templateKey.trim()) errors.push(`${labels.templateKey}: ${labels.required}`);
  const defaultName = versions.find((version) => version.locale === defaultLocale)?.fields.name.trim();
  if (!defaultName) errors.push(`${labels.localizedName}: ${labels.required}`);
  if (!Number.isInteger(draft.canvas.width) || draft.canvas.width < 1 || draft.canvas.width > 8192 || !Number.isInteger(draft.canvas.height) || draft.canvas.height < 1 || draft.canvas.height > 8192 || !Number.isInteger(draft.canvas.imageScale) || draft.canvas.imageScale < 1 || draft.canvas.imageScale > 32) errors.push(labels.invalidCanvas);
  const keys = new Set<string>();
  for (const slot of draft.slots) {
    const key = slot.slotKey.trim();
    if (!key) errors.push(`${labels.slotKey}: ${labels.required}`);
    else if (keys.has(key)) errors.push(`${labels.duplicateSlotKey}: ${key}`);
    keys.add(key);
    if (!Number.isFinite(slot.rect.width) || !Number.isFinite(slot.rect.height) || slot.rect.width <= 0 || slot.rect.height <= 0) errors.push(`${slot.slotKey || labels.slotKey}: ${labels.invalidSlotSize}`);
    if (![slot.rect.x, slot.rect.y, slot.rect.width, slot.rect.height].every(Number.isFinite) || slot.rect.x < 0 || slot.rect.y < 0 || slot.rect.x + slot.rect.width > draft.canvas.width || slot.rect.y + slot.rect.height > draft.canvas.height) errors.push(`${slot.slotKey || labels.slotKey}: ${labels.slotOutsideCanvas}`);
    if (slot.role === "output" && (!Number.isInteger(slot.outputIndex) || Number(slot.outputIndex) < 0)) errors.push(`${slot.slotKey || labels.slotKey}: ${labels.invalidOutputIndex}`);
    if (slot.role !== "output" && slot.outputIndex !== undefined) errors.push(`${slot.slotKey || labels.slotKey}: ${labels.outputIndexOnly}`);
  }
  return [...new Set(errors)];
}

function nextSlotKey(slots: readonly RecipeTemplateSlot[], role: RecipeSlotRole) {
  let index = slots.filter((slot) => slot.role === role).length;
  while (slots.some((slot) => slot.slotKey === `${role}-${index}`)) index += 1;
  return `${role}-${index}`;
}

function logicalPoint(clientX: number, clientY: number, element: HTMLElement | null, width: number, height: number) {
  const bounds = element?.getBoundingClientRect();
  if (!bounds) return { x: 0, y: 0 };
  return { x: (clientX - bounds.left) * width / Math.max(1, bounds.width), y: (clientY - bounds.top) * height / Math.max(1, bounds.height) };
}

function clampRect(rect: RecipeSlotRect, canvasWidth: number, canvasHeight: number): RecipeSlotRect {
  const width = Math.max(1, Math.min(rect.width, canvasWidth));
  const height = Math.max(1, Math.min(rect.height, canvasHeight));
  return { x: Math.max(0, Math.min(rect.x, canvasWidth - width)), y: Math.max(0, Math.min(rect.y, canvasHeight - height)), width, height };
}

function roundRect(rect: RecipeSlotRect): RecipeSlotRect {
  return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function rectStyle(rect: RecipeSlotRect, canvasWidth: number, canvasHeight: number) {
  return { left: `${rect.x / Math.max(1, canvasWidth) * 100}%`, top: `${rect.y / Math.max(1, canvasHeight) * 100}%`, width: `${rect.width / Math.max(1, canvasWidth) * 100}%`, height: `${rect.height / Math.max(1, canvasHeight) * 100}%` };
}

function slotClass(role: RecipeSlotRole, selected: boolean) {
  const color = role === "output" ? "border-emerald-500 bg-emerald-400/35" : role === "catalyst" ? "border-amber-500 bg-amber-400/35" : "border-sky-600 bg-sky-400/35";
  return `${color} ${selected ? "z-20 ring-2 ring-white ring-offset-2 ring-offset-black/40" : "z-10"}`;
}

function roleButtonClass(role: RecipeSlotRole) {
  return role === "output" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : role === "catalyst" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-sky-600 bg-sky-50 text-sky-800";
}

function roleLabel(role: RecipeSlotRole, labels: RecipeTemplateEditorLabels) {
  return role === "output" ? labels.roleOutput : role === "catalyst" ? labels.roleCatalyst : labels.roleInput;
}

function nonNegativeIntegerOrUndefined(value: string) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : undefined;
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

export const recipeTemplateEditableLocales = supportedLocales.map((item) => item.code);

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
