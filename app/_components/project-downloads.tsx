"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes } from "../_lib/oss-upload";
import {
  projectFilesPath,
  uploadProjectFileToOSS,
  type CreateProjectFileInput,
  type ProjectDownloadTicket,
  type ProjectFile,
  type ProjectFilesResponse,
  type ProjectFileSource,
  type ProjectReleaseChannel,
} from "../_lib/project-download-api";

type ProjectDownloadsProps = {
  projectType: string;
  projectId: string;
  projectName: string;
  token: string;
  suggestedVersions?: string[];
  suggestedLoaders?: string[];
};

const allFilter = "*";
const sourceOptions: Array<ProjectFileSource | typeof allFilter> = [allFilter, "internal", "modrinth", "curseforge"];

export function ProjectDownloads({
  projectType,
  projectId,
  projectName,
  token,
  suggestedVersions = [],
  suggestedLoaders = [],
}: ProjectDownloadsProps) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<ProjectFilesResponse>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(allFilter);
  const [loader, setLoader] = useState(allFilter);
  const [source, setSource] = useState<ProjectFileSource | typeof allFilter>(allFilter);
  const [downloadingId, setDownloadingId] = useState("");
  const basePath = projectFilesPath(projectType, projectId);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      setData(await apiRequest<ProjectFilesResponse>(basePath, {}, token));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.detail.downloads.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [basePath, t, token]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const filtered = useMemo(() => (data?.items ?? []).filter((file) => {
    if (source !== allFilter && file.source !== source) return false;
    if (version !== allFilter && !file.gameVersions.includes(version)) return false;
    return loader === allFilter || file.loaders.includes(loader);
  }), [data?.items, loader, source, version]);

  const groups = useMemo(() => groupProjectFiles(filtered, version), [filtered, version]);
  const versions = useMemo(() => uniqueOptions(data?.versions ?? [], suggestedVersions), [data?.versions, suggestedVersions]);
  const loaders = useMemo(() => uniqueOptions(data?.loaders ?? [], suggestedLoaders), [data?.loaders, suggestedLoaders]);

  async function download(file: ProjectFile) {
    setDownloadingId(`${file.source}:${file.id}`);
    setMessage("");
    try {
      const ticket = await apiRequest<ProjectDownloadTicket>(file.downloadPath, { method: "POST" }, token);
      const anchor = document.createElement("a");
      anchor.href = ticket.url;
      anchor.download = ticket.filename || file.fileName;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (file.source === "internal") {
        setData((current) => current ? {
          ...current,
          items: current.items.map((item) => item.id === file.id && item.source === "internal" ? { ...item, downloadCount: item.downloadCount + 1 } : item),
          totals: { ...current.totals, internalDownloads: current.totals.internalDownloads + 1 },
        } : current);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.detail.downloads.downloadFailed"));
    } finally {
      setDownloadingId("");
    }
  }

  async function remove(file: ProjectFile) {
    if (!window.confirm(t("mods.detail.downloads.deleteConfirm", { name: file.displayName || file.fileName }))) return;
    setMessage("");
    try {
      await apiRequest(`${basePath}/${encodeURIComponent(file.id)}`, { method: "DELETE" }, token);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.detail.downloads.deleteFailed"));
    }
  }

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <div className="border-b border-[var(--line)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black">{t("mods.detail.downloads.title")}</h2>{data ? <span className="text-sm font-bold text-[var(--muted)]">{t("mods.detail.downloads.internalTotal", { count: formatCount(data.totals.internalDownloads, locale) })}</span> : null}</div>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("mods.detail.downloads.subtitle")}</p>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">{t("mods.detail.downloads.minecraftVersion")}</span>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            <FilterButton active={version === allFilter} onClick={() => setVersion(allFilter)}>{t("mods.detail.downloads.all")}</FilterButton>
            {versions.map((item) => <FilterButton key={item} active={version === item} onClick={() => setVersion(item)}>{item}</FilterButton>)}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-black">{t("mods.detail.downloads.loader")}<select className="field mt-2" value={loader} onChange={(event) => setLoader(event.target.value)}><option value={allFilter}>{t("mods.detail.downloads.allLoaders")}</option>{loaders.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-sm font-black">{t("mods.detail.downloads.source")}<select className="field mt-2" value={source} onChange={(event) => setSource(event.target.value as ProjectFileSource | typeof allFilter)}>{sourceOptions.map((item) => <option key={item} value={item}>{item === allFilter ? t("mods.detail.downloads.allSources") : t(`mods.detail.downloadSources.${item}`)}</option>)}</select></label>
        </div>
      </div>
    </section>

    {data && Object.keys(data.warnings).length ? <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-4 text-sm font-bold text-amber-800 dark:text-amber-200">{Object.keys(data.warnings).map((key) => t("mods.detail.downloads.providerUnavailable", { source: key === "providers" ? t("mods.detail.downloads.externalSources") : t(`mods.detail.downloadSources.${key}`) })).join(" · ")}</div> : null}
    {message ? <div className="rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 p-4 text-sm font-bold text-[var(--red)]">{message}</div> : null}
    {loading ? <DownloadSkeleton /> : groups.length ? <div className="space-y-4">{groups.map((group) => <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]" key={group.key}>
      <div className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3"><h3 className="font-black">{group.label}</h3></div>
      <div className="divide-y divide-[var(--line)]">{group.items.map((file) => <ProjectFileRow
        key={`${file.source}:${file.id}`}
        file={file}
        locale={locale}
        deletingAllowed={Boolean(data?.canUpload && file.source === "internal")}
        downloading={downloadingId === `${file.source}:${file.id}`}
        onDelete={() => void remove(file)}
        onDownload={() => void download(file)}
      />)}</div>
    </section>)}</div> : <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]">{t("mods.detail.downloads.noFiles")}</div>}

    {data?.canUpload ? <ProjectFileUpload
      basePath={basePath}
      loaders={loaders}
      projectId={projectId}
      projectName={projectName}
      projectType={projectType}
      token={token}
      versions={versions}
      onCreated={load}
    /> : null}
  </div>;
}

function ProjectFileRow({ file, locale, deletingAllowed, downloading, onDownload, onDelete }: {
  file: ProjectFile;
  locale: string;
  deletingAllowed: boolean;
  downloading: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const name = file.displayName || file.fileName;
  const scanBlocked = file.source === "internal" && file.scanStatus !== "clean";
  const downloadLabel = scanBlocked
    ? t(file.scanStatus === "rejected" ? "mods.detail.downloads.scanRejected" : "mods.detail.downloads.scanPending")
    : downloading
      ? t("mods.detail.downloads.preparing")
      : t("mods.detail.downloads.download");
  return <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
    <ReleaseMark channel={file.releaseChannel} />
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="truncate text-base">{name}</strong><SourceBadge source={file.source} /><ChannelBadge channel={file.releaseChannel} /></div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        <span>{[file.loaders.join(" / "), file.gameVersions.join(" / ")].filter(Boolean).join(" · ") || t("mods.detail.notProvided")}</span>
        <span className="font-mono">{file.fileName}</span>
        <span>{formatBytes(file.sizeBytes)}</span>
        <span>{t("mods.detail.downloads.downloadCount", { count: formatCount(file.downloadCount, locale) })}</span>
        <span>{t("mods.detail.downloads.updated", { date: formatProjectFileDate(file.publishedAt, locale) })}</span>
      </div>
    </div>
    <div className="flex shrink-0 gap-2">
      {deletingAllowed ? <button className="button-secondary focus-ring text-[var(--red)]" type="button" onClick={onDelete}>{t("common.delete")}</button> : null}
      <button className="button-primary focus-ring" disabled={downloading || scanBlocked} type="button" onClick={onDownload}>{downloadLabel}</button>
    </div>
  </div>;
}

function ProjectFileUpload({ basePath, projectType, projectId, projectName, token, versions, loaders, onCreated }: {
  basePath: string;
  projectType: string;
  projectId: string;
  projectName: string;
  token: string;
  versions: string[];
  loaders: string[];
  onCreated: () => Promise<void>;
}) {
  const { t } = useI18n();

  const fileRule = projectFileRule(projectType);
  const acceptedExtensions = fileRule.extensions;
  const acceptedFileTypes = fileRule.accept;
  const acceptedFormats = acceptedExtensions.join(" / ");
  const [file, setFile] = useState<File>();
  const [displayName, setDisplayName] = useState("");
  const [versionName, setVersionName] = useState("");
  const [gameVersions, setGameVersions] = useState(versions[0] ?? "");
  const [loaderValues, setLoaderValues] = useState(loaders[0] ?? "");
  const [channel, setChannel] = useState<ProjectReleaseChannel>("release");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !acceptedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
      setMessage(t("mods.detail.downloads.unsupportedFileFormat", { formats: acceptedFormats }));
      return;
    }
    const parsedVersions = splitValues(gameVersions);
    const parsedLoaders = splitValues(loaderValues);
    if (!versionName.trim() || !parsedVersions.length || fileRule.requiresLoader && !parsedLoaders.length) {
      setMessage(t("mods.detail.downloads.metadataRequired"));
      return;
    }
    setUploading(true);
    setMessage("");
    setProgress(0);
    try {
      const uploaded = await uploadProjectFileToOSS(file, token, projectType, projectId, (loaded, total) => setProgress(total > 0 ? Math.round(loaded / total * 85) : 0));
      const input: CreateProjectFileInput = {
        ossFileId: uploaded.id,
        displayName: displayName.trim() || file.name,
        versionName: versionName.trim(),
        releaseChannel: channel,
        gameVersions: parsedVersions,
        loaders: parsedLoaders,
      };
      await apiRequest<ProjectFile>(basePath, { method: "POST", body: JSON.stringify(input) }, token);
      setProgress(100);
      setMessage(t("mods.detail.downloads.uploaded"));
      setFile(undefined);
      setDisplayName("");
      setVersionName("");
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.detail.downloads.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return <details className="rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    <summary className="cursor-pointer px-5 py-4 font-black">{t("mods.detail.downloads.uploadTitle")}</summary>
    <form className="border-t border-[var(--line)] p-5" onSubmit={submit}>
      <p className="text-sm leading-6 text-[var(--muted)]">{t("mods.detail.downloads.uploadDescription", { project: projectName })}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-black sm:col-span-2">{t("mods.detail.downloads.projectFile", { formats: acceptedFormats })}<input className="field mt-2" type="file" accept={acceptedFileTypes} required onChange={(event) => { const next = event.target.files?.[0]; setFile(next); if (next && !displayName) setDisplayName(next.name.replace(/\.(?:jar|mrpack|zip)$/i, "")); }} /></label>
        <label className="text-sm font-black">{t("mods.detail.downloads.displayName")}<input className="field mt-2" maxLength={200} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label className="text-sm font-black">{t("mods.detail.downloads.versionName")}<input className="field mt-2" maxLength={120} required value={versionName} placeholder="1.0.0" onChange={(event) => setVersionName(event.target.value)} /></label>
        <label className="text-sm font-black">{t("mods.detail.downloads.gameVersions")}<input className="field mt-2" required value={gameVersions} list={`project-file-versions-${projectId}`} placeholder="1.21.1, 1.20.1" onChange={(event) => setGameVersions(event.target.value)} /><datalist id={`project-file-versions-${projectId}`}>{versions.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label className="text-sm font-black">{t("mods.detail.downloads.loaders")}<input className="field mt-2" required={fileRule.requiresLoader} value={loaderValues} list={`project-file-loaders-${projectId}`} placeholder={fileRule.requiresLoader ? "NeoForge, Forge" : t("mods.detail.notProvided")} onChange={(event) => setLoaderValues(event.target.value)} /><datalist id={`project-file-loaders-${projectId}`}>{loaders.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label className="text-sm font-black">{t("mods.detail.downloads.releaseChannel")}<select className="field mt-2" value={channel} onChange={(event) => setChannel(event.target.value as ProjectReleaseChannel)}>{(["release", "beta", "alpha"] as const).map((item) => <option key={item} value={item}>{t(`mods.detail.downloads.channels.${item}`)}</option>)}</select></label>
      </div>
      {uploading ? <div className="mt-5"><div className="flex justify-between text-sm font-bold"><span>{t("mods.detail.downloads.uploading")}</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress}%` }} /></div></div> : null}
      {message ? <p className="mt-4 text-sm font-bold">{message}</p> : null}
      <div className="mt-5 flex justify-end"><button className="button-primary focus-ring" disabled={uploading} type="submit">{uploading ? t("mods.detail.downloads.uploading") : t("mods.detail.downloads.upload")}</button></div>
    </form>
  </details>;
}

function FilterButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={`focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-bold ${active ? "bg-[var(--foreground)] text-[var(--background)]" : "border border-[var(--line)] bg-[var(--panel-subtle)] text-[var(--muted)]"}`} type="button" onClick={onClick}>{children}</button>;
}

function ReleaseMark({ channel }: { channel: ProjectReleaseChannel }) {
  const styles = channel === "release" ? "bg-cyan-500" : channel === "beta" ? "bg-lime-600" : "bg-amber-500";
  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg font-black text-white ${styles}`} aria-hidden>{channel.slice(0, 1).toUpperCase()}</span>;
}

function SourceBadge({ source }: { source: ProjectFileSource }) {
  const { t } = useI18n();
  return <span className="rounded bg-[var(--panel-subtle)] px-2 py-0.5 text-[11px] font-black text-[var(--muted)]">{t(`mods.detail.downloadSources.${source}`)}</span>;
}

function ChannelBadge({ channel }: { channel: ProjectReleaseChannel }) {
  const { t } = useI18n();
  if (channel === "release") return null;
  return <span className="rounded bg-amber-400/15 px-2 py-0.5 text-[11px] font-black text-amber-700 dark:text-amber-300">{t(`mods.detail.downloads.channels.${channel}`)}</span>;
}

function DownloadSkeleton() {
  return <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">{[0, 1, 2].map((item) => <div className="h-14 animate-pulse rounded-md bg-[var(--panel-subtle)]" key={item} />)}</div>;
}

function groupProjectFiles(items: ProjectFile[], selectedVersion: string) {
  const groups = new Map<string, { key: string; label: string; items: ProjectFile[] }>();
  for (const item of items) {
    const primaryLoader = item.loaders[0] || "Other";
    const primaryVersion = selectedVersion !== allFilter ? selectedVersion : item.gameVersions[0] || "Unknown";
    const key = `${primaryLoader}:${primaryVersion}`;
    const group = groups.get(key) ?? { key, label: `${primaryLoader} ${primaryVersion}`, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function uniqueOptions(...lists: string[][]) {
  return Array.from(new Set(lists.flat().map((item) => item.trim()).filter(Boolean)));
}

function splitValues(value: string) {
  return Array.from(new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)));
}

function projectFileRule(projectType: string) {
  switch (projectType) {
    case "modpack":
      return { extensions: [".mrpack", ".zip"], accept: ".mrpack,.zip,application/zip", requiresLoader: true };
    case "map":
    case "resource_pack":
    case "shader_pack":
    case "datapack":
      return { extensions: [".zip"], accept: ".zip,application/zip", requiresLoader: false };
    case "addon":
      return { extensions: [".jar", ".zip"], accept: ".jar,.zip,application/java-archive,application/zip", requiresLoader: true };
    default:
      return { extensions: [".jar"], accept: ".jar,application/java-archive", requiresLoader: true };
  }
}

function formatProjectFileDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}
