"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import {
  BackendModCompatibility,
  BackendModRecord,
  BackendModRelationship,
  BackendModRelationshipGroup,
  BackendModRevision,
  CreateModPayload,
  MinecraftVersionConfig,
} from "../_lib/mod-api";
import {
  environmentOptions,
  commonVersions,
  licenseOptions,
  loaderOptions,
  maintenanceOptions,
  primaryCategoryOptions,
  sourceOptions,
  tagOptions,
} from "../_lib/mod-catalog-data";
import { useI18n } from "../_lib/i18n-provider";
import { MinecraftVersionPicker } from "./minecraft-version-picker";
import { ToolsPlayground } from "./tools-playground";

type ModDraft = Omit<CreateModPayload, "searchKeywords"> & { searchKeywords: string };

const linkTypeGroups = [
  { key: "sites", types: ["official", "curseforge", "modrinth", "klpbbs", "minebbs", "redstoneRelay", "mcbbsMemorial", "mcbbsArchive", "sourceforge", "minecraftForum", "planetMinecraft", "mcpedl", "spigotmc", "wiki"] },
  { key: "code", types: ["github", "gitlab", "gitee", "gitea", "gitpod", "gitcode", "bitbucket", "maven", "crowdin", "mastodon"] },
  { key: "drives", types: ["baiduPan", "aliyunDrive", "quarkDrive", "weiyun", "lanzou", "chinaMobileCloud", "tianyiCloud", "cowTransfer", "googleDrive", "oneDrive", "dropbox", "mediaFire"] },
  { key: "community", types: ["bilibili", "weibo", "tieba", "zhihu", "bcy", "ftb", "patreon", "buyMeACoffee", "kofi", "aifadian", "kook", "discord", "twitter", "youtube", "reddit", "other"] },
] as const;

const emptyRelationship = (): BackendModRelationship => ({ type: "dependency", relatedModName: "", notes: "" });
const emptyRelationshipGroup = (): BackendModRelationshipGroup => ({ label: "", loader: "", minecraftVersions: [], modVersion: "", relationships: [emptyRelationship()] });
const emptyDraft = (): ModDraft => ({
  siteId: "",
  primaryName: "",
  secondaryName: "",
  abbreviation: "",
  summary: "",
  modId: "",
  environment: "bothRequired",
  primaryCategory: "utility",
  supportedVersions: [],
  supportedLoaders: [],
  tags: [],
  searchKeywords: "",
  authors: [{ name: "", role: "" }],
  officialStatus: "development",
  sourceStatus: "unknown",
  license: "Custom",
  curseforgeProjectId: "",
  modrinthProjectId: "",
  iconUrl: "",
  bodyMarkdown: "",
  submissionMethod: "manual",
  links: [{ type: "official", url: "" }],
  relationshipGroups: [],
  compatibilities: [],
});

export function ModEditor({ siteId, importMethod = "manual", importURL = "" }: { siteId?: string; importMethod?: string; importURL?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [draft, setDraft] = useState<ModDraft>(emptyDraft);
  const [loading, setLoading] = useState(Boolean(siteId));
  const [uniqueId, setUniqueId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [minecraftConfig, setMinecraftConfig] = useState<MinecraftVersionConfig>(() => fallbackMinecraftConfig());

  useEffect(() => {
    let cancelled = false;
    apiRequest<MinecraftVersionConfig>("/api/v1/minecraft/versions")
      .then((config) => { if (!cancelled) setMinecraftConfig(config); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !siteId) return;
    let cancelled = false;
    apiRequest<BackendModRecord>(`/api/v1/mods/${encodeURIComponent(siteId)}`, {}, token)
      .then((record) => {
        if (!cancelled) {
          setDraft(draftFromRecord(record));
          setUniqueId(record.uniqueId);
        }
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("mods.submission.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ready, siteId, t, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setMessage(t("mods.submission.loginRequired"));
      return;
    }
    setSubmitting(true);
    setMessage("");
    const snapshot = payloadFromDraft(draft);
    try {
      if (siteId) {
        const revision = await apiRequest<BackendModRevision>(
          `/api/v1/mods/${encodeURIComponent(siteId)}/revisions`,
          { method: "POST", body: JSON.stringify({ snapshot, changeReason }) },
          token,
        );
        router.push(`/mods/${revision.status === "approved" ? snapshot.siteId : siteId}/history`);
      } else {
        const created = await apiRequest<BackendModRecord>("/api/v1/mods", { method: "POST", body: JSON.stringify(snapshot) }, token);
        router.push(`/mods/${created.siteId}`);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t("mods.submission.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready || loading) return <EditorState text={t("common.loading")} />;
  if (!token) return <EditorState text={t("mods.submission.loginRequired")} login />;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <form className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6" onSubmit={submit}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <Link className="text-sm font-bold text-[var(--accent)] hover:underline" href={siteId ? `/mods/${siteId}` : "/mods"}>{t("mods.detail.back")}</Link>
            <h1 className="mt-2 text-3xl font-black">{t(siteId ? "mods.submission.editTitle" : "mods.submission.manualTitle")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("mods.submission.reviewNotice")}</p>
            {importMethod !== "manual" ? <p className="mt-2 text-sm font-bold text-[var(--accent)]">{t("mods.submission.importPrepared", { source: importMethod, url: importURL })}</p> : null}
          </div>
          <button className="button-primary focus-ring" disabled={submitting} type="submit">{submitting ? t("mods.submission.actions.submitting") : t(siteId ? "mods.submission.actions.submitRevision" : "mods.submission.actions.submit")}</button>
        </header>

        <FormSection title={t("mods.submission.sections.identity")} description={t("mods.submission.sections.identityHint")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("mods.submission.fields.siteId")} required hint={t("mods.submission.hints.siteId")}><input className="field font-mono" required maxLength={100} pattern="[a-z0-9](?:[a-z0-9_-]{0,98}[a-z0-9])?" value={draft.siteId} onChange={(event) => setDraft({ ...draft, siteId: normalizeSiteIdInput(event.target.value) })} /></Field>
            {uniqueId ? <Field label={t("mods.submission.fields.uniqueId")} hint={t("mods.submission.hints.uniqueId")}><input className="field font-mono" readOnly value={uniqueId} /></Field> : null}
            <Field label={t("mods.submission.fields.primaryName")} required hint={t("mods.submission.hints.primaryName")}><input className="field" required maxLength={160} value={draft.primaryName} onChange={(event) => setDraft({ ...draft, primaryName: event.target.value })} /></Field>
            <Field label={t("mods.submission.fields.secondaryName")} hint={t("mods.submission.hints.secondaryName")}><input className="field" maxLength={160} value={draft.secondaryName} onChange={(event) => setDraft({ ...draft, secondaryName: event.target.value })} /></Field>
            <Field label={t("mods.submission.fields.abbreviation")} hint={t("mods.submission.hints.abbreviation")}><input className="field" maxLength={32} pattern="[\x21-\x7E]*" value={draft.abbreviation} onChange={(event) => setDraft({ ...draft, abbreviation: event.target.value })} /></Field>
            <Field label={t("mods.submission.fields.modId")} hint={t("mods.submission.hints.modId")}><input className="field font-mono" maxLength={128} value={draft.modId} onChange={(event) => setDraft({ ...draft, modId: event.target.value })} /></Field>
          </div>
          <Field label={t("mods.submission.fields.summary")} hint={t("mods.submission.hints.summary")}><textarea className="field min-h-24 resize-y" maxLength={500} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></Field>
        </FormSection>

        <FormSection title={t("mods.submission.sections.classification")}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <SelectField label={t("mods.submission.fields.environment")} value={draft.environment} options={environmentOptions} optionLabel={(value) => t(`mods.environments.${value}`)} onChange={(value) => setDraft({ ...draft, environment: value })} />
            <SelectField label={t("mods.submission.fields.primaryCategory")} value={draft.primaryCategory} options={primaryCategoryOptions} optionLabel={(value) => t(`mods.categories.${value}`)} onChange={(value) => setDraft({ ...draft, primaryCategory: value })} />
            <SelectField label={t("mods.submission.fields.officialStatus")} value={draft.officialStatus} options={maintenanceOptions} optionLabel={(value) => t(`mods.statuses.${value}`)} onChange={(value) => setDraft({ ...draft, officialStatus: value })} />
            <SelectField label={t("mods.submission.fields.sourceStatus")} value={draft.sourceStatus} options={sourceOptions} optionLabel={(value) => t(`mods.sources.${value}`)} onChange={(value) => setDraft({ ...draft, sourceStatus: value })} />
            <SelectField label={t("mods.submission.fields.license")} value={draft.license} options={licenseOptions} optionLabel={(value) => value} onChange={(value) => setDraft({ ...draft, license: value })} />
          </div>
          <Field label={t("mods.submission.fields.tags")} hint={t("mods.submission.hints.tags")}>
            <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 sm:grid-cols-2 lg:grid-cols-4">
              {tagOptions.map((tag) => <label key={tag} className="flex cursor-pointer items-center gap-2 text-sm"><input className="h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={draft.tags.includes(tag)} onChange={() => setDraft({ ...draft, tags: toggleArray(draft.tags, tag) })} />{t(`mods.tags.${tag}`)}</label>)}
            </div>
          </Field>
          <Field label={t("mods.submission.fields.searchKeywords")} hint={t("mods.submission.hints.searchKeywords")}><textarea className="field min-h-20 resize-y" value={draft.searchKeywords} placeholder={t("mods.submission.placeholders.keywords")} onChange={(event) => setDraft({ ...draft, searchKeywords: event.target.value })} /></Field>
        </FormSection>

        <FormSection title={t("mods.detail.compatibility")}>
          <CompatibilityEditor config={minecraftConfig} value={draft.compatibilities} onChange={(compatibilities) => setDraft((current) => withCompatibilities(current, compatibilities))} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.authors")}>
          <SimpleRows rows={draft.authors} addLabel={t("mods.submission.actions.addAuthor")} emptyRow={() => ({ name: "", role: "" })} onChange={(authors) => setDraft({ ...draft, authors })} render={(author, update) => <div className="grid flex-1 gap-2 sm:grid-cols-2"><input className="field" value={author.name} placeholder={t("mods.submission.placeholders.authorName")} onChange={(event) => update({ ...author, name: event.target.value })} /><input className="field" value={author.role} placeholder={t("mods.submission.placeholders.authorRole")} onChange={(event) => update({ ...author, role: event.target.value })} /></div>} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.links")} description={t("mods.submission.sections.linksHint")}>
          <SimpleRows rows={draft.links} addLabel={t("mods.submission.actions.addLink")} emptyRow={() => ({ type: "official", url: "" })} onChange={(links) => setDraft({ ...draft, links })} render={(link, update) => <div className="grid flex-1 gap-2 sm:grid-cols-[220px_1fr]"><select className="field" value={link.type} onChange={(event) => update({ ...link, type: event.target.value })}>{linkTypeGroups.map((group) => <optgroup key={group.key} label={t(`mods.submission.linkGroups.${group.key}`)}>{group.types.map((type) => <option key={type} value={type}>{t(`mods.submission.linkTypes.${type}`)}</option>)}</optgroup>)}</select><input className="field" type="url" value={link.url} placeholder="https://" onChange={(event) => update({ ...link, url: event.target.value })} /></div>} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.relationships")} description={t("mods.submission.sections.relationshipsHint")}>
          <RelationshipGroupEditor groups={draft.relationshipGroups} config={minecraftConfig} onChange={(relationshipGroups) => setDraft({ ...draft, relationshipGroups })} />
        </FormSection>

        <FormSection title={t("mods.submission.sections.platformIDs")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("mods.submission.fields.curseforgeProjectId")}><input className="field font-mono" value={draft.curseforgeProjectId} onChange={(event) => setDraft({ ...draft, curseforgeProjectId: event.target.value })} /></Field>
            <Field label={t("mods.submission.fields.modrinthProjectId")}><input className="field font-mono" value={draft.modrinthProjectId} onChange={(event) => setDraft({ ...draft, modrinthProjectId: event.target.value })} /></Field>
          </div>
        </FormSection>

        <FormSection title={t("mods.submission.sections.body")} description={t("mods.submission.sections.bodyHint")}>
          <div className="overflow-hidden rounded-lg border border-[var(--line)]"><ToolsPlayground embedded value={draft.bodyMarkdown} onChange={(bodyMarkdown) => setDraft((current) => current.bodyMarkdown === bodyMarkdown ? current : { ...current, bodyMarkdown })} /></div>
        </FormSection>

        {siteId ? <FormSection title={t("mods.submission.changeReason")}><textarea className="field min-h-24 resize-y" maxLength={500} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></FormSection> : null}
        {message ? <p className="mb-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{message}</p> : null}
        <div className="flex justify-end"><button className="button-primary focus-ring px-6" disabled={submitting} type="submit">{submitting ? t("mods.submission.actions.submitting") : t(siteId ? "mods.submission.actions.submitRevision" : "mods.submission.actions.submit")}</button></div>
      </form>
    </main>
  );
}

function CompatibilityEditor({ config, value, onChange }: { config: MinecraftVersionConfig; value: BackendModCompatibility[]; onChange: (value: BackendModCompatibility[]) => void }) {
  const { t } = useI18n();
  const selectedLoaders = new Set(value.map((item) => item.loader));
  function toggleLoader(loader: string) {
    if (selectedLoaders.has(loader)) {
      onChange(value.filter((item) => item.loader !== loader));
      return;
    }
    onChange([...value, { loader, versions: [] }]);
  }
  return <div className="grid gap-4"><div><h3 className="text-sm font-black">{t("mods.submission.compatibility.loaders")}</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">{config.loaders.map((loader) => <label key={loader.code} className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input className="h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={selectedLoaders.has(loader.code)} onChange={() => toggleLoader(loader.code)} />{loader.name}</label>)}</div></div>{value.map((compatibility) => { const loader = config.loaders.find((item) => item.code === compatibility.loader); const versions = loader?.versions ?? config.versions.map((item) => item.code); return <section key={compatibility.loader} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-black">{loader?.name ?? compatibility.loader}</h3><span className="text-xs font-bold text-[var(--muted)]">{t("mods.submission.compatibility.selectedCount", { count: compatibility.versions.length })}</span></div><MinecraftVersionPicker className="mt-3 w-full" config={config} optionCodes={versions} values={compatibility.versions} onChange={(selectedVersions) => onChange(value.map((item) => item.loader === compatibility.loader ? { ...item, versions: selectedVersions } : item))} /></section>; })}{value.length === 0 ? <p className="rounded-lg border border-dashed border-[var(--line)] p-5 text-center text-sm font-semibold text-[var(--muted)]">{t("mods.submission.compatibility.empty")}</p> : null}</div>;
}

function RelationshipGroupEditor({ groups, config, onChange }: { groups: BackendModRelationshipGroup[]; config: MinecraftVersionConfig; onChange: (groups: BackendModRelationshipGroup[]) => void }) {
  const { t } = useI18n();
  return <div className="grid gap-4">{groups.map((group, groupIndex) => <section key={groupIndex} className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-black">{t("mods.submission.relationshipCondition", { number: groupIndex + 1 })}</h4><button className="button-secondary focus-ring" type="button" onClick={() => onChange(groups.filter((_, index) => index !== groupIndex))}>{t("common.delete")}</button></div><div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4"><input className="field" value={group.label} placeholder={t("mods.submission.placeholders.conditionLabel")} onChange={(event) => onChange(replaceAt(groups, groupIndex, { ...group, label: event.target.value }))} /><select className="field" value={group.loader} onChange={(event) => onChange(replaceAt(groups, groupIndex, { ...group, loader: event.target.value }))}><option value="">{t("mods.submission.commonCondition")}</option>{loaderOptions.map((loader) => <option key={loader} value={loader}>{loader}</option>)}</select><MinecraftVersionPicker config={config} emptyLabelKey="mods.submission.allMinecraftVersions" values={group.minecraftVersions} onChange={(minecraftVersions) => onChange(replaceAt(groups, groupIndex, { ...group, minecraftVersions }))} /><input className="field" value={group.modVersion} placeholder={t("mods.submission.placeholders.modVersion")} onChange={(event) => onChange(replaceAt(groups, groupIndex, { ...group, modVersion: event.target.value }))} /></div><div className="mt-4 grid gap-2">{group.relationships.map((relationship, relationshipIndex) => <div key={relationshipIndex} className="flex items-start gap-2"><div className="grid flex-1 gap-2 md:grid-cols-[180px_1fr_1fr]"><select className="field" value={relationship.type} onChange={(event) => updateRelationship(groups, groupIndex, relationshipIndex, { ...relationship, type: event.target.value as BackendModRelationship["type"] }, onChange)}>{(["dependency", "extension", "integration"] as const).map((type) => <option key={type} value={type}>{t(`mods.submission.relationshipTypes.${type}`)}</option>)}</select><input className="field" value={relationship.relatedModName} placeholder={t("mods.submission.placeholders.relatedMod")} onChange={(event) => updateRelationship(groups, groupIndex, relationshipIndex, { ...relationship, relatedModName: event.target.value }, onChange)} /><input className="field" value={relationship.notes} placeholder={t("mods.submission.placeholders.relationshipNotes")} onChange={(event) => updateRelationship(groups, groupIndex, relationshipIndex, { ...relationship, notes: event.target.value }, onChange)} /></div><button className="button-secondary focus-ring shrink-0" type="button" onClick={() => onChange(replaceAt(groups, groupIndex, { ...group, relationships: group.relationships.filter((_, index) => index !== relationshipIndex) }))}>{t("common.delete")}</button></div>)}<button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => onChange(replaceAt(groups, groupIndex, { ...group, relationships: [...group.relationships, emptyRelationship()] }))}>+ {t("mods.submission.actions.addRelationship")}</button></div></section>)}<button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => onChange([...groups, emptyRelationshipGroup()])}>+ {t("mods.submission.actions.addCondition")}</button></div>;
}

function updateRelationship(groups: BackendModRelationshipGroup[], groupIndex: number, relationshipIndex: number, relationship: BackendModRelationship, onChange: (groups: BackendModRelationshipGroup[]) => void) {
  const group = groups[groupIndex];
  onChange(replaceAt(groups, groupIndex, { ...group, relationships: replaceAt(group.relationships, relationshipIndex, relationship) }));
}

function SimpleRows<T>({ rows, addLabel, emptyRow, onChange, render }: { rows: T[]; addLabel: string; emptyRow: () => T; onChange: (rows: T[]) => void; render: (row: T, update: (row: T) => void) => React.ReactNode }) {
  const { t } = useI18n();
  return <div className="grid gap-3">{rows.map((row, index) => <div key={index} className="flex items-start gap-2">{render(row, (next) => onChange(replaceAt(rows, index, next)))}<button className="button-secondary focus-ring shrink-0" type="button" onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}>{t("common.delete")}</button></div>)}<button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => onChange([...rows, emptyRow()])}>+ {addLabel}</button></div>;
}

function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="mb-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5"><h2 className="text-xl font-black">{title}</h2>{description ? <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}<div className="mt-4 grid gap-4">{children}</div></section>;
}

function Field({ label, hint, required = false, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-black">{label}{required ? <span className="ml-1 text-[var(--red)]">*</span> : null}</span>{children}{hint ? <span className="mt-1.5 block text-xs leading-5 text-[var(--muted)]">{hint}</span> : null}</label>;
}

function SelectField<T extends string>({ label, value, options, optionLabel, onChange }: { label: string; value: string; options: readonly T[]; optionLabel: (value: T) => string; onChange: (value: T) => void }) {
  return <Field label={label}><select className="field" value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>;
}

function EditorState({ text, login = false }: { text: string; login?: boolean }) {
  const { t } = useI18n();
  return <main className="grid min-h-[65vh] place-items-center px-4 text-center"><div><p className="text-lg font-black">{text}</p>{login ? <Link className="button-primary focus-ring mt-4 inline-flex" href="/login">{t("common.login")}</Link> : null}</div></main>;
}

function draftFromRecord(record: BackendModRecord): ModDraft {
  const compatibilities = record.compatibilities?.length ? record.compatibilities : record.supportedLoaders.map((loader) => ({ loader, versions: [...record.supportedVersions] }));
  return { ...record, compatibilities, searchKeywords: record.searchKeywords.join("\n") };
}

function payloadFromDraft(draft: ModDraft): CreateModPayload {
  return {
    siteId: draft.siteId,
    primaryName: draft.primaryName,
    secondaryName: draft.secondaryName,
    abbreviation: draft.abbreviation,
    summary: draft.summary,
    modId: draft.modId,
    environment: draft.environment,
    primaryCategory: draft.primaryCategory,
    supportedVersions: draft.supportedVersions,
    supportedLoaders: draft.supportedLoaders,
    compatibilities: draft.compatibilities,
    officialStatus: draft.officialStatus,
    sourceStatus: draft.sourceStatus,
    license: draft.license,
    curseforgeProjectId: draft.curseforgeProjectId,
    modrinthProjectId: draft.modrinthProjectId,
    iconUrl: draft.iconUrl,
    bodyMarkdown: draft.bodyMarkdown,
    searchKeywords: [...new Set(draft.searchKeywords.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))],
    submissionMethod: draft.submissionMethod,
    tags: draft.tags,
    authors: draft.authors,
    links: draft.links,
    relationshipGroups: draft.relationshipGroups,
  };
}

function normalizeSiteIdInput(value: string) {
  return value.trimStart().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function toggleArray(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function replaceAt<T>(values: T[], index: number, value: T) {
  return values.map((item, itemIndex) => itemIndex === index ? value : item);
}

function withCompatibilities(draft: ModDraft, compatibilities: BackendModCompatibility[]): ModDraft {
  return {
    ...draft,
    compatibilities,
    supportedLoaders: [...new Set(compatibilities.map((item) => item.loader))],
    supportedVersions: [...new Set(compatibilities.flatMap((item) => item.versions))],
  };
}

function fallbackMinecraftConfig(): MinecraftVersionConfig {
  const versions = [...new Set([...commonVersions])];
  return {
    versions: versions.map((code) => ({ code, type: "release" as const })),
    loaders: loaderOptions.map((code) => ({ code, name: code, versions: [...versions] })),
  };
}
