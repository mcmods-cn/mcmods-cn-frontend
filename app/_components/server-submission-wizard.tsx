"use client";

/* eslint-disable @next/next/no-img-element */
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogResourceRef } from "../_lib/editor-types";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes, OSSFileRecord, uploadUserFileToOSS } from "../_lib/oss-upload";
import {
  CreateServerRequest,
  DetectedServerMod,
  loadServerSettings,
  probeServer,
  serverPrimaryTags,
  ServerCatalogSettings,
  ServerDetail,
  ServerLink,
  ServerMod,
  ServerPrimaryTag,
  ServerProbeResult,
  submitServer,
  suggestedMinecraftVersionFromProbe,
  updateServer,
} from "../_lib/server-api";
import {
  modIdentifierFromResource,
  ModResourceSelectionField,
  unresolvedModResource,
  validModIdentifier,
} from "./editor/mod-resource-picker";
import { MinecraftLanguagePicker } from "./minecraft-language-picker";
import { MinecraftVersionPicker } from "./minecraft-version-picker";
import { ToolsPlayground } from "./tools-playground";
import { useAutoDraft } from "../_lib/use-auto-draft";
import { DraftAutosaveStatus } from "./draft-autosave-status";

type Props = {
  token: string;
  initialServer?: ServerDetail;
  presentation?: "dialog" | "page";
  onClose: () => void;
  onSubmitted: (id: string, published: boolean) => void;
};

const fallbackSettings: ServerCatalogSettings = {
  maxProofFiles: 5,
  maxProofTotalBytes: 10 * 1024 * 1024,
  nameMaxLength: 80,
  summaryMaxLength: 240,
  historyDays: 90,
  reviewRequired: true,
};

type Draft = Omit<CreateServerRequest, "address" | "mods" | "proofFileIds">;

const emptyDraft: Draft = {
  name: "",
  shortDescription: "",
  bodyMarkdown: "",
  minecraftVersions: [],
  dedicatedClient: false,
  languages: ["zh-CN"],
  primaryTag: "survival",
  hasWhitelist: false,
  onlineMode: true,
  links: [],
  proofText: "",
};

export function ServerSubmissionWizard({
  token,
  initialServer,
  presentation = "dialog",
  onClose,
  onSubmitted,
}: Props) {
  const { t } = useI18n();
  const editing = Boolean(initialServer);
  const [step, setStep] = useState(editing ? 2 : 1);
  const [address, setAddress] = useState(initialServer?.address ?? "");
  const [probe, setProbe] = useState<ServerProbeResult | null>(null);
  const [settings, setSettings] = useState(fallbackSettings);
  const [draft, setDraft] = useState<Draft>(() => initialServer ? draftFromServer(initialServer) : emptyDraft);
  const [selectedMods, setSelectedMods] = useState<CatalogResourceRef[]>(
    () => initialServer?.mods.map(serverModResource) ?? [],
  );
  const [proofFiles, setProofFiles] = useState<OSSFileRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const proofFileRef = useRef<HTMLInputElement | null>(null);

  const autoDraft = useAutoDraft({
    token,
    draftKey: `server:${initialServer?.id || "new"}`,
    kind: "server",
    title: draft.name.trim() || address.trim() || t(editing ? "servers.wizard.editTitle" : "servers.wizard.title"),
    editUrl: initialServer ? `/servers/${initialServer.id}` : "/servers/new",
    enabled: true,
    value: { step, address, probe, draft, selectedMods, proofFiles },
    onRestore: (restored) => {
      setStep(restored.step);
      setAddress(restored.address);
      setProbe(restored.probe);
      setDraft(restored.draft);
      setSelectedMods(restored.selectedMods);
      setProofFiles(restored.proofFiles);
    },
  });

  useEffect(() => {
    let cancelled = false;
    loadServerSettings(token).then((next) => {
      if (cancelled) return;
      setSettings(next);
      if (!editing && next.reviewRequired === false) {
        setStep((current) => current === 3 ? 2 : current);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [editing, token]);

  const reviewRequired = !editing && settings.reviewRequired !== false;

  const proofTotal = useMemo(
    () => proofFiles.reduce((sum, file) => sum + Math.max(file.sizeBytes, file.sourceSizeBytes ?? 0), 0),
    [proofFiles],
  );

  async function runProbe() {
    if (!address.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await probeServer(address.trim(), token);
      setProbe(result);
      const detectedVersion = suggestedMinecraftVersionFromProbe(result);
      setDraft((current) => ({
        ...current,
        name: current.name || result.motd.slice(0, settings.nameMaxLength),
        minecraftVersions: current.minecraftVersions.length || !detectedVersion ? current.minecraftVersions : [detectedVersion],
      }));
      setSelectedMods(result.mods.map((mod) => unresolvedModResource(mod.id)));
      setStep(2);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("servers.wizard.probeFailed"));
    } finally {
      setBusy(false);
    }
  }

  function addLink() {
    setDraft((current) => ({
      ...current,
      links: [...current.links, { kind: "website", label: "", url: "" }],
    }));
  }

  function updateLink(index: number, link: ServerLink) {
    setDraft((current) => ({
      ...current,
      links: current.links.map((item, itemIndex) => itemIndex === index ? link : item),
    }));
  }

  function removeLink(index: number) {
    setDraft((current) => ({
      ...current,
      links: current.links.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function uploadProofFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (proofFiles.length + files.length > settings.maxProofFiles) {
      setMessage(t("servers.wizard.proofCountError", { count: settings.maxProofFiles }));
      return;
    }
    if (proofTotal + files.reduce((sum, file) => sum + file.size, 0) > settings.maxProofTotalBytes) {
      setMessage(t("servers.wizard.proofSizeError", { size: formatBytes(settings.maxProofTotalBytes) }));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      for (const file of files) {
        const uploaded = await uploadUserFileToOSS(file, token, "server-proof");
        setProofFiles((current) => current.some((item) => item.id === uploaded.id) ? current : [...current, uploaded]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("servers.wizard.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function validateStepTwo() {
    if (!draft.name.trim()) return t("servers.wizard.nameRequired");
    if (Array.from(draft.name.trim()).length > settings.nameMaxLength) {
      return t("servers.wizard.nameTooLong", { count: settings.nameMaxLength });
    }
    if (Array.from(draft.shortDescription.trim()).length > settings.summaryMaxLength) {
      return t("servers.wizard.summaryTooLong", { count: settings.summaryMaxLength });
    }
    if (!draft.minecraftVersions.length) return t("servers.wizard.versionRequired");
    if (!draft.languages.length) return t("servers.wizard.languageRequired");
    if (draft.links.some((link) => !link.url.trim())) return t("servers.wizard.linkRequired");
    return "";
  }

  function goToProof() {
    const error = validateStepTwo();
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("");
    setStep(3);
  }

  async function submit() {
    if (!editing && !probe) return;
    const validationError = validateStepTwo();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    if (reviewRequired && (!draft.proofText.trim() || !proofFiles.length)) {
      setMessage(t("servers.wizard.proofRequired"));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const mods = serverModsFromResources(selectedMods, probe?.mods ?? initialServer?.mods ?? []);
      const metadata = {
        name: draft.name.trim(),
        shortDescription: draft.shortDescription.trim(),
        bodyMarkdown: draft.bodyMarkdown.trim(),
        minecraftVersions: draft.minecraftVersions,
        dedicatedClient: draft.dedicatedClient,
        languages: draft.languages,
        primaryTag: draft.primaryTag,
        hasWhitelist: draft.hasWhitelist,
        onlineMode: draft.onlineMode,
        links: draft.links.map((link) => ({ ...link, label: link.label.trim(), url: link.url.trim() })),
        mods,
      };
      if (initialServer) {
        await updateServer(initialServer.id, metadata, token);
        await autoDraft.clearDraft();
        onSubmitted(initialServer.id, initialServer.reviewStatus === "approved");
        return;
      }
      const result = await submitServer({
        address: address.trim(),
        ...metadata,
        proofText: reviewRequired ? draft.proofText.trim() : "",
        proofFileIds: reviewRequired ? proofFiles.map((file) => file.id) : [],
      }, token);
      await autoDraft.clearDraft();
      onSubmitted(result.id, result.published);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(editing ? "servers.wizard.updateFailed" : "servers.wizard.submitFailed"));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <section
      aria-labelledby="server-submission-title"
      aria-modal={presentation === "dialog" ? true : undefined}
      className={`surface flex w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--line)] shadow-2xl ${presentation === "dialog" ? "max-h-[96dvh]" : ""}`}
      role={presentation === "dialog" ? "dialog" : "region"}
      onMouseDown={(event) => event.stopPropagation()}
    >
        <header className="border-b border-[var(--line)] px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black" id="server-submission-title">{t(editing ? "servers.wizard.editTitle" : "servers.wizard.title")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{t(editing ? "servers.wizard.editHint" : `servers.wizard.step${step}Hint`)}</p>
              <DraftAutosaveStatus error={autoDraft.error} savedAt={autoDraft.savedAt} status={autoDraft.status} />
            </div>
            <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={onClose}>
              {t(presentation === "page" ? "common.cancel" : "common.close")}
            </button>
          </div>
          {!editing ? <ol className={`mt-4 grid gap-2 ${reviewRequired ? "grid-cols-3" : "grid-cols-2"}`} aria-label={t("servers.wizard.progress")}>
            {(reviewRequired ? [1, 2, 3] : [1, 2]).map((value) => (
              <li key={value} className={`rounded-md px-3 py-2 text-center text-xs font-black sm:text-sm ${step === value ? "bg-[var(--accent)] text-white" : step > value ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-subtle)] text-[var(--muted)]"}`}>
                {t(`servers.wizard.step${value}`)}
              </li>
            ))}
          </ol> : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 1 ? (
            <div className="mx-auto max-w-2xl">
              <label className="text-sm font-black" htmlFor="server-address">{t("servers.wizard.address")}</label>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("servers.wizard.addressHint")}</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  autoFocus
                  className="field flex-1"
                  id="server-address"
                  placeholder="play.example.net:25565"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void runProbe(); }}
                />
                <button className="button-primary focus-ring" disabled={busy || !address.trim()} type="button" onClick={() => void runProbe()}>
                  {busy ? t("servers.wizard.connecting") : t("servers.wizard.connect")}
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 && (probe || initialServer) ? (
            <div className="grid gap-6">
              {probe ? <ProbeSummary probe={probe} /> : null}
              <div className="grid gap-5 lg:grid-cols-2">
                <Field label={t("servers.wizard.name")}>
                  <input className="field w-full" maxLength={settings.nameMaxLength} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </Field>
                <Field label={t("servers.wizard.primaryTag")}>
                  <select className="field w-full" value={draft.primaryTag} onChange={(event) => setDraft({ ...draft, primaryTag: event.target.value as ServerPrimaryTag })}>
                    {serverPrimaryTags.map((tag) => <option key={tag} value={tag}>{t(`servers.tags.${tag}`)}</option>)}
                  </select>
                </Field>
                <Field className="lg:col-span-2" label={t("servers.wizard.summary")}>
                  <textarea className="field min-h-24 w-full resize-y" maxLength={settings.summaryMaxLength} value={draft.shortDescription} onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })} />
                  <p className="mt-1 text-right text-xs text-[var(--muted)]">{Array.from(draft.shortDescription).length}/{settings.summaryMaxLength}</p>
                </Field>
                <Field label={t("servers.wizard.versions")}>
                  <MinecraftVersionPicker className="w-full" values={draft.minecraftVersions} onChange={(minecraftVersions) => setDraft({ ...draft, minecraftVersions })} />
                </Field>
                <Field label={t("servers.wizard.languages")}>
                  <MinecraftLanguagePicker
                    maxSelections={16}
                    title={t("servers.wizard.selectLanguages")}
                    values={draft.languages}
                    onChange={(languages) => setDraft({ ...draft, languages })}
                  />
                </Field>
              </div>

              <fieldset>
                <legend className="text-sm font-black">{t("servers.wizard.accessRules")}</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <BooleanCard checked={draft.dedicatedClient} label={t("servers.wizard.dedicatedClient")} onChange={(dedicatedClient) => setDraft({ ...draft, dedicatedClient })} />
                  <BooleanCard checked={draft.hasWhitelist} label={t("servers.wizard.whitelist")} onChange={(hasWhitelist) => setDraft({ ...draft, hasWhitelist })} />
                  <BooleanCard checked={draft.onlineMode} label={t("servers.wizard.onlineMode")} onChange={(onlineMode) => setDraft({ ...draft, onlineMode })} />
                </div>
              </fieldset>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black">{t("servers.wizard.links")}</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">{t("servers.wizard.linksHint")}</p>
                  </div>
                  <button className="button-secondary focus-ring" type="button" onClick={addLink}>+ {t("common.add")}</button>
                </div>
                <div className="mt-3 grid gap-3">
                  {draft.links.map((link, index) => (
                    <div key={index} className="grid gap-2 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-[150px_180px_minmax(0,1fr)_auto]">
                      <select className="field" value={link.kind} onChange={(event) => updateLink(index, { ...link, kind: event.target.value as ServerLink["kind"] })}>
                        {["website", "forum", "discord", "qq", "bilibili", "other"].map((kind) => <option key={kind} value={kind}>{t(`servers.linkKinds.${kind}`)}</option>)}
                      </select>
                      <input className="field" placeholder={t("servers.wizard.linkLabel")} value={link.label} onChange={(event) => updateLink(index, { ...link, label: event.target.value })} />
                      <input className="field" placeholder="https://…" value={link.url} onChange={(event) => updateLink(index, { ...link, url: event.target.value })} />
                      <button className="button-secondary focus-ring text-[var(--danger)]" type="button" onClick={() => removeLink(index)}>{t("common.delete")}</button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black">{t("servers.wizard.mods")}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{probe?.detectionDiagnostic || t("servers.wizard.modsHint")}</p>
                <div className="mt-3">
                  <ModResourceSelectionField
                    buttonLabel={t("servers.wizard.selectMods")}
                    emptyLabel={t("servers.wizard.noSelectedMods")}
                    token={token}
                    value={selectedMods}
                    onChange={setSelectedMods}
                  />
                </div>
              </section>

              <Field label={t("servers.wizard.body")}>
                <ToolsPlayground
                  embedded
                  editorTitle={t("servers.wizard.body")}
                  uploadSource="server-content"
                  value={draft.bodyMarkdown}
                  onBusyChange={setBusy}
                  onChange={(bodyMarkdown) => setDraft((current) => ({ ...current, bodyMarkdown }))}
                />
              </Field>
            </div>
          ) : null}

          {step === 3 && reviewRequired ? (
            <div className="mx-auto grid max-w-3xl gap-6">
              <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm leading-6">
                {t("servers.wizard.proofHint", { count: settings.maxProofFiles, size: formatBytes(settings.maxProofTotalBytes) })}
              </div>
              <Field label={t("servers.wizard.proofText")}>
                <textarea className="field min-h-36 w-full resize-y" maxLength={10000} value={draft.proofText} onChange={(event) => setDraft({ ...draft, proofText: event.target.value })} />
              </Field>
              <section>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black">{t("servers.wizard.proofFiles")}</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">{proofFiles.length}/{settings.maxProofFiles} · {formatBytes(proofTotal)}/{formatBytes(settings.maxProofTotalBytes)}</p>
                  </div>
                  <input ref={proofFileRef} className="hidden" multiple type="file" onChange={(event) => void uploadProofFiles(event)} />
                  <button className="button-secondary focus-ring" disabled={busy || proofFiles.length >= settings.maxProofFiles} type="button" onClick={() => proofFileRef.current?.click()}>{t("servers.wizard.uploadProof")}</button>
                </div>
                <ul className="mt-3 grid gap-2">
                  {proofFiles.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] p-3">
                      <span className="min-w-0 truncate text-sm font-bold">{file.originalName}</span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted)]">
                        {formatBytes(Math.max(file.sizeBytes, file.sourceSizeBytes ?? 0))}
                        <button className="font-bold text-[var(--danger)]" type="button" onClick={() => setProofFiles((current) => current.filter((item) => item.id !== file.id))}>{t("common.delete")}</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}

          {message ? <p aria-live="polite" className="mt-5 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--danger)]">{message}</p> : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-4 sm:px-6">
          <button className="button-secondary focus-ring" disabled={busy || step === 1 || editing} type="button" onClick={() => { setMessage(""); setStep((current) => Math.max(1, current - 1)); }}>{t("common.previous")}</button>
          {step === 2 && !editing && reviewRequired ? <button className="button-primary focus-ring" disabled={busy} type="button" onClick={goToProof}>{t("common.next")}</button> : null}
          {step === 2 && !editing && !reviewRequired ? <button className="button-primary focus-ring" disabled={busy} type="button" onClick={() => void submit()}>{busy ? t("servers.wizard.submitting") : t("servers.wizard.submit")}</button> : null}
          {step === 2 && editing ? <button className="button-primary focus-ring" disabled={busy} type="button" onClick={() => void submit()}>{busy ? t("servers.wizard.saving") : t("servers.wizard.save")}</button> : null}
          {step === 3 ? <button className="button-primary focus-ring" disabled={busy} type="button" onClick={() => void submit()}>{busy ? t("servers.wizard.submitting") : t("servers.wizard.submit")}</button> : null}
          {step === 1 ? <span /> : null}
        </footer>
    </section>
  );

  if (presentation === "page") {
    return (
      <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">{form}</div>
      </main>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-2 sm:p-5" role="presentation" onMouseDown={onClose}>
      {form}
    </div>
  );
}

function ProbeSummary({ probe }: { probe: ServerProbeResult }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--success)] bg-[var(--success-soft)] p-4">
      <ServerIcon icon={probe.iconDataUri} name={probe.motd || probe.address} />
      <div className="min-w-0 flex-1">
        <h3 className="font-black">{t("servers.wizard.connected")}</h3>
        <p className="mt-1 truncate text-sm text-[var(--muted)]">{probe.motd || probe.address}</p>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center text-sm">
        <span><strong className="block">{probe.latencyMs} ms</strong>{t("servers.latency")}</span>
        <span><strong className="block">{probe.playersOnline}/{probe.playersMax}</strong>{t("servers.players")}</span>
        <span><strong className="block">{probe.detectedMinecraftVersion || probe.minecraftVersion || "?"}</strong>{t("servers.version")}</span>
      </div>
    </section>
  );
}

function ServerIcon({ icon, name }: { icon?: string; name: string }) {
  return icon
    ? <img alt="" className="h-14 w-14 rounded-md border border-[var(--line)] object-cover [image-rendering:pixelated]" height={56} src={icon} width={56} />
    : <span aria-label={name} className="grid h-14 w-14 place-items-center rounded-md bg-[var(--panel-subtle)] text-2xl font-black text-[var(--muted)]">?</span>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={className}><span className="mb-2 block text-sm font-black">{label}</span>{children}</label>;
}

function BooleanCard({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-bold ${checked ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`}>
      <input checked={checked} className="h-4 w-4 accent-[var(--accent)]" type="checkbox" onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function serverModsFromResources(resources: readonly CatalogResourceRef[], detected: readonly DetectedServerMod[]) {
  const result = new Map<string, DetectedServerMod>();
  const detectedByID = new Map(detected.map((mod) => [mod.id.toLowerCase(), mod]));
  for (const resource of resources) {
    const id = modIdentifierFromResource(resource);
    if (!validModIdentifier(id) || result.has(id)) continue;
    result.set(id, detectedByID.get(id) ?? { id, source: "manual", confidence: "declared" });
  }
  return [...result.values()];
}

function serverModResource(mod: ServerMod): CatalogResourceRef {
  if (!mod.resolved) return unresolvedModResource(mod.id);
  return {
    publicId: mod.modPublicId || `server-mod:${mod.id.toLowerCase()}`,
    id: mod.id,
    registry: "mods",
    kind: "mod",
    names: {},
    resolvedName: mod.modName || mod.id,
    iconUrl: mod.iconUrl,
    source: { publicId: mod.modPublicId, siteId: mod.modSlug, name: mod.modName },
  };
}

function draftFromServer(server: ServerDetail): Draft {
  return {
    name: server.name,
    shortDescription: server.shortDescription,
    bodyMarkdown: server.bodyMarkdown,
    minecraftVersions: server.minecraftVersions,
    dedicatedClient: server.dedicatedClient,
    languages: server.languages,
    primaryTag: server.primaryTag,
    hasWhitelist: server.hasWhitelist,
    onlineMode: server.onlineMode,
    links: server.links,
    proofText: "",
  };
}
