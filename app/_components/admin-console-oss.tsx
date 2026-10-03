"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { abortMultipartUpload, completeOSSUpload, computeFileSHA256, formatBytes, putFileToOSS, type OSSDirectUploadTicket } from "../_lib/oss-upload";
import { EmptyState, InlineMessage, LogPage, LogRetentionConfig, LogRow, OSSConfig, OSSFile, RuntimeLogEntry, RuntimeLogResponse, cleanError, cleanOSSError, displayCell, emptyConfig, formatDateTime, logCategoryTitle } from "./admin-console-shared";

function normalizeOSSConfigForUI(config: OSSConfig): OSSConfig {
  const region = config.region || "cn-beijing";
  const endpoint = config.endpoint || `https://oss-${region}.aliyuncs.com`;
  const customEndpoint = endpoint && !endpoint.includes(".aliyuncs.com") && !endpoint.includes(".aliyun.com");
  return {
    ...config,
    region,
    endpoint: customEndpoint ? `https://oss-${region}.aliyuncs.com` : endpoint,
    publicEndpoint: config.publicEndpoint || (customEndpoint ? endpoint : "https://oss.mcmods.cn"),
    useCName: customEndpoint ? false : config.useCName,
    downloadUrlTtlMinutes: Math.min(60, Math.max(1, config.downloadUrlTtlMinutes || 10)),
    downloadUrlMode: "oss_presigned",
    allowedExtensions: normalizeExtensionList(config.allowedExtensions),
  };
}

function previewEndpoint(value: string, fallback: string) {
  const endpoint = value || fallback;
  return endpoint.startsWith("http://") || endpoint.startsWith("https://") ? endpoint : `https://${endpoint}`;
}

function splitExtensionText(value: string) {
  return normalizeExtensionList(value.split(/[\s,;，；]+/));
}

function normalizeExtensionList(values: string[] | undefined) {
  const fallback = emptyConfig.oss!.allowedExtensions;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values && values.length > 0 ? values : fallback) {
    let ext = String(value ?? "").trim().toLowerCase();
    if (!ext) continue;
    if (!ext.startsWith(".")) ext = `.${ext}`;
    if (!/^\.[a-z0-9_+-]+$/.test(ext)) continue;
    if (seen.has(ext)) continue;
    seen.add(ext);
    result.push(ext);
  }
  return result.length > 0 ? result : fallback;
}

function isAllowedFileName(fileName: string, allowedExtensions: string[]) {
  const lowerName = fileName.toLowerCase();
  return normalizeExtensionList(allowedExtensions).some((ext) => lowerName.endsWith(ext));
}

function OSSConfigPanelV2({ initialConfig, token }: { initialConfig: OSSConfig; token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ ...normalizeOSSConfigForUI(initialConfig), accessKeySecret: "", securityToken: "" });
  const [message, setMessage] = useState("");
  const [loadedToken, setLoadedToken] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const savePending = useRef(false);
  const uploadEndpointPreview = previewEndpoint(draft.endpoint, "https://oss-cn-beijing.aliyuncs.com");
  const publicEndpointPreview = previewEndpoint(draft.publicEndpoint, "https://oss.mcmods.cn");
  const objectPrefix = (draft.prefix || "mcmods").replace(/^\/+|\/+$/g, "");

  useEffect(() => {
    let cancelled = false;
    apiRequest<OSSConfig>("/api/v1/admin/config/oss", {}, token)
      .then((config) => {
        if (!cancelled) {
          setDraft({ ...normalizeOSSConfigForUI(config), accessKeySecret: "", securityToken: "" });
          setLoadedToken(token);
          setMessage("");
        }
      })
      .catch((error) => {
        if (!cancelled) setMessage(cleanError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, token]);

  async function save() {
    if (loadedToken !== token || savePending.current) return;
    savePending.current = true;
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        enabled: draft.enabled,
        region: draft.region,
        endpoint: draft.endpoint,
        publicEndpoint: draft.publicEndpoint,
        bucket: draft.bucket,
        accessKeyId: draft.accessKeyId,
        accessKeySecret: draft.accessKeySecret,
        securityToken: draft.securityToken,
        useCName: draft.useCName,
        prefix: draft.prefix,
        downloadUrlTtlMinutes: draft.downloadUrlTtlMinutes,
        downloadUrlMode: draft.downloadUrlMode,
        allowedExtensions: normalizeExtensionList(draft.allowedExtensions),
      };
      const saved = await apiRequest<OSSConfig>(
        "/api/v1/admin/config/oss",
        { method: "PUT", body: JSON.stringify(payload) },
        token,
      );
      setDraft({ ...normalizeOSSConfigForUI(saved), accessKeySecret: "", securityToken: "" });
      setMessage(t("admin.oss.configSaved"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="surface rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">{t("admin.oss.configTitle")}</h2>
              <span
                className={`rounded-md px-2 py-1 text-xs font-bold ${
                  draft.enabled ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-subtle)] text-[var(--muted)]"
                }`}
              >
                {draft.enabled ? t("admin.oss.enabled") : t("admin.oss.disabled")}
              </span>
              <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold text-[var(--muted)]">{t("admin.oss.connectedByPrivateBucket")}</span>
              {draft.publicEndpoint ? (
                <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold text-[var(--muted)]">{t("admin.oss.cnameMode")}</span>
              ) : null}
            </div>
            <p className="max-w-3xl text-sm text-[var(--muted)]">
              {t("admin.oss.configIntro")}
            </p>
          </div>
          <button className="button-primary focus-ring" disabled={loadedToken !== token || saving} type="button" onClick={save}>
            {t("admin.oss.saveConfig")}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("admin.oss.uploadEndpoint")}</div>
            <div className="mt-1 truncate font-mono text-sm">{uploadEndpointPreview}</div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("admin.oss.publicEndpoint")}</div>
            <div className="mt-1 truncate font-mono text-sm">{publicEndpointPreview}</div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">Bucket</div>
            <div className="mt-1 truncate font-mono text-sm">{draft.bucket || t("admin.notConfigured")}</div>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3">
            <div className="text-xs font-bold uppercase text-[var(--muted)]">{t("admin.oss.temporaryUrl")}</div>
            <div className="mt-1 truncate text-sm font-semibold">{t("admin.oss.downloadModeOSSPresignedShort")}</div>
          </div>
        </div>
      </div>

      {loadedToken !== token ? <div role="status" className="surface rounded-lg p-4"><p>{message || t("common.loading")}</p>{message ? <button className="button-secondary focus-ring mt-2" type="button" onClick={() => { setMessage(""); setLoadAttempt((value) => value + 1); }}>{t("common.retry")}</button> : null}</div> : null}
      <fieldset disabled={loadedToken !== token || saving} className="contents">
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="surface rounded-lg p-5">
          <div className="mb-4">
            <h3 className="font-bold">{t("admin.oss.connection")}</h3>
            <p className="text-sm text-[var(--muted)]">{t("admin.oss.connectionDesc")}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 md:col-span-2">
              <input
                checked={draft.enabled}
                type="checkbox"
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span>
                <span className="block font-bold">{t("admin.oss.enableOSS")}</span>
                <span className="text-sm text-[var(--muted)]">{t("admin.oss.enableOSSDesc")}</span>
              </span>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Region
              <input
                className="field"
                placeholder="cn-beijing"
                value={draft.region}
                onChange={(event) => setDraft((current) => ({ ...current, region: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Bucket
              <input
                className="field"
                placeholder="mcmods-cn"
                value={draft.bucket}
                onChange={(event) => setDraft((current) => ({ ...current, bucket: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold md:col-span-2">
              {t("admin.oss.uploadEndpoint")}
              <input
                className="field font-mono"
                placeholder="https://oss-cn-beijing.aliyuncs.com"
                value={draft.endpoint}
                onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold md:col-span-2">
              {t("admin.oss.publicEndpoint")}
              <input
                className="field font-mono"
                placeholder="https://oss.mcmods.cn"
                value={draft.publicEndpoint}
                onChange={(event) => setDraft((current) => ({ ...current, publicEndpoint: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 md:col-span-2">
              <input
                checked={draft.useCName}
                type="checkbox"
                onChange={(event) => setDraft((current) => ({ ...current, useCName: event.target.checked }))}
              />
              <span>
                <span className="block font-bold">{t("admin.oss.useCName")}</span>
                <span className="text-sm text-[var(--muted)]">{t("admin.oss.useCNameDesc")}</span>
              </span>
            </label>
          </div>
        </div>

        <div className="surface rounded-lg p-5">
          <div className="mb-4">
            <h3 className="font-bold">{t("admin.oss.credentials")}</h3>
            <p className="text-sm text-[var(--muted)]">{t("admin.oss.credentialsDesc")}</p>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              AccessKey ID
              <input
                className="field font-mono"
                value={draft.accessKeyId}
                onChange={(event) => setDraft((current) => ({ ...current, accessKeyId: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              AccessKey Secret
              <input
                className="field font-mono"
                placeholder={draft.hasAccessKeySecret ? t("admin.oss.secretPlaceholderSaved") : t("admin.oss.secretPlaceholderEmpty")}
                type="password"
                value={draft.accessKeySecret}
                onChange={(event) => setDraft((current) => ({ ...current, accessKeySecret: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              SecurityToken / STS Token
              <input
                className="field font-mono"
                placeholder={draft.hasSecurityToken ? t("admin.oss.tokenPlaceholderSaved") : t("admin.oss.tokenPlaceholderEmpty")}
                type="password"
                value={draft.securityToken}
                onChange={(event) => setDraft((current) => ({ ...current, securityToken: event.target.value }))}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="surface rounded-lg p-5">
        <div className="mb-4">
          <h3 className="font-bold">{t("admin.oss.storagePolicy")}</h3>
          <p className="text-sm text-[var(--muted)]">{t("admin.oss.storagePolicyDesc")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            {t("admin.oss.objectKeyPrefix")}
            <input
              className="field font-mono"
              placeholder="mcmods"
              value={draft.prefix}
              onChange={(event) => setDraft((current) => ({ ...current, prefix: event.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {t("admin.oss.downloadUrlMode")}
            <div className="field bg-[var(--panel-subtle)]" aria-readonly="true">
              {t("admin.oss.downloadModeOSSPresigned")}
            </div>
            <span className="text-xs font-normal text-[var(--muted)]">{t("admin.oss.downloadUrlModeDesc")}</span>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {t("admin.oss.temporaryUrlMinutes")}
            <input
              className="field"
              min={1}
              max={60}
              type="number"
              value={draft.downloadUrlTtlMinutes}
              onChange={(event) => setDraft((current) => ({
                ...current,
                downloadUrlTtlMinutes: Math.min(60, Math.max(1, Number(event.target.value) || 1)),
              }))}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">
            {t("admin.oss.allowedExtensions")}
            <textarea
              className="field min-h-28 font-mono"
              value={draft.allowedExtensions.join(", ")}
              onChange={(event) => setDraft((current) => ({ ...current, allowedExtensions: splitExtensionText(event.target.value) }))}
            />
            <span className="text-xs font-normal text-[var(--muted)]">{t("admin.oss.allowedExtensionsDesc")}</span>
          </label>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm text-[var(--muted)]">
          {t("admin.oss.objectKeyExample")}
          <span className="ml-1 font-mono text-[var(--foreground)]">{objectPrefix}/projects/m123abc/description/550e8400-e29b-41d4-a716-446655440000.webp</span>
        </div>
      </div>

      </fieldset>
      {message ? <InlineMessage text={message} /> : null}
    </section>
  );
}

function OSSFilesPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [files, setFiles] = useState<OSSFile[]>([]);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("project");
  const [source, setSource] = useState("admin");
  const [allowedExtensions, setAllowedExtensions] = useState(emptyConfig.oss!.allowedExtensions);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      setFiles(await apiRequest<OSSFile[]>("/api/v1/admin/oss/files", {}, token));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      void apiRequest<OSSConfig>("/api/v1/admin/config/oss", {}, token)
        .then((config) => setAllowedExtensions(normalizeExtensionList(config.allowedExtensions)))
        .catch(() => setAllowedExtensions(emptyConfig.oss!.allowedExtensions));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, token]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File)) {
      setMessage(t("admin.oss.selectFile"));
      return;
    }
    if (!isAllowedFileName(file.name, allowedExtensions)) {
      setMessage(t("admin.oss.fileTypeNotAllowed"));
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const sha256 = await computeFileSHA256(file);
      const ticket = await apiRequest<OSSDirectUploadTicket>(
        "/api/v1/admin/oss/uploads/presign",
        {
          method: "POST",
          body: JSON.stringify({
            originalName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            sha256,
            category,
            source,
          }),
        },
        token,
      );
      if (ticket.uploadRequired === false) {
        setMessage(t("admin.oss.fileReused", { id: ticket.file?.id ?? ticket.objectKey }));
      } else {
        try {
          await putFileToOSS(ticket, file);
        } catch (error) {
          await abortMultipartUpload("/api/v1/admin/oss/uploads/complete", ticket, token);
          throw error;
        }
        await completeOSSUpload("/api/v1/admin/oss/uploads/complete", ticket, token);
        setMessage(t("admin.oss.uploadSuccess"));
      }
      form.reset();
      await load();
    } catch (error) {
      setMessage(cleanOSSError(error));
    } finally {
      setUploading(false);
    }
  }

  async function copyDownloadLink(objectKey: string) {
    try {
      const result = await apiRequest<{ url: string; expiresAt: string }>(
        "/api/v1/admin/oss/files/presign",
        { method: "POST", body: JSON.stringify({ objectKey }) },
        token,
      );
      await navigator.clipboard.writeText(result.url);
      setMessage(t("admin.oss.tempUrlCopied", { time: formatDateTime(result.expiresAt) }));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <div className="mb-4">
        <h2 className="text-lg font-bold">{t("admin.oss.filesTitle")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("admin.oss.filesDesc")}</p>
      </div>
      <form className="mb-4 grid gap-3 rounded-lg border border-[var(--line)] p-3 lg:grid-cols-[1fr_160px_160px_auto]" onSubmit={upload}>
        <input className="field" accept={allowedExtensions.join(",")} name="file" required type="file" />
        <input className="field" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="category" />
        <input className="field" value={source} onChange={(event) => setSource(event.target.value)} placeholder="source" />
        <button className="button-primary focus-ring" disabled={uploading} type="submit">
          {uploading ? t("admin.oss.uploading") : t("admin.oss.uploadFile")}
        </button>
      </form>
      {message ? <InlineMessage text={message} /> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.file")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.category")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.size")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.scan")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.uploadedAt")}</th>
              <th className="border-b border-[var(--line)] py-2">{t("admin.oss.operation")}</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.objectKey}>
                <td className="border-b border-[var(--line)] py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{file.originalName || file.objectKey}</span>
                    {file.converted ? <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">{t("admin.oss.convertedToWebP")}</span> : null}
                  </div>
                  {file.converted ? <div className="mt-1 text-xs text-[var(--muted)]">{t("admin.oss.sourceFile")}: {file.sourceOriginalName}</div> : null}
                  <div className="font-mono text-xs text-[var(--muted)]">ID: {file.id}</div>
                  <div className="max-w-xl truncate font-mono text-xs text-[var(--muted)]">{file.objectKey}</div>
                  {file.sha256 ? <div className="max-w-xl truncate font-mono text-xs text-[var(--muted)]">SHA-256: {file.sha256}</div> : null}
                </td>
                <td className="border-b border-[var(--line)] py-2">{file.category}</td>
                <td className="border-b border-[var(--line)] py-2">
                  {file.converted ? (
                    <div className="space-y-1 text-xs">
                      <div>{t("admin.oss.sourceSize")}: <strong>{formatBytes(file.sourceSizeBytes ?? file.sizeBytes)}</strong></div>
                      <div>{t("admin.oss.storedSize")}: <strong>{formatBytes(file.sizeBytes)}</strong></div>
                    </div>
                  ) : formatBytes(file.sizeBytes)}
                </td>
                <td className="border-b border-[var(--line)] py-2">{file.scanStatus}</td>
                <td className="border-b border-[var(--line)] py-2">{formatDateTime(file.createdAt)}</td>
                <td className="border-b border-[var(--line)] py-2">
                  <button className="button-secondary focus-ring" type="button" onClick={() => copyDownloadLink(file.objectKey)}>
                    {t("admin.oss.copyTempUrl")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 ? <EmptyState text={t("admin.oss.noFiles")} /> : null}
      </div>
    </section>
  );
}

function OSSRowsPanel({ token, title, endpoint }: { token: string; title: string; endpoint: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest<LogRow[]>(endpoint, {}, token)
      .then(setRows)
      .catch((error) => setMessage(cleanError(error)));
  }, [endpoint, token]);
  return <RowsPanel title={title} rows={rows} message={message} />;
}

function LogsPanel({ token, title, category }: { token: string; title: string; category: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [message, setMessage] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(100);
  const activeLogQuery = useRef("");
  const logRequestVersion = useRef(0);
  const displayTitle = logCategoryTitle(category, t) || title;

  const buildLogQuery = useCallback((includeFilters: boolean) => {
    const params = new URLSearchParams({
      category,
      limit: String(limit),
    });
    if (includeFilters) {
      if (query.trim()) params.set("q", query.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (level) params.set("level", level);
      if (status) params.set("status", status);
    }
    return params;
  }, [category, from, level, limit, query, status, to]);

  const replaceLogPage = useCallback(async (params: URLSearchParams) => {
    const queryString = params.toString();
    const requestVersion = ++logRequestVersion.current;
    setLoadingMore(false);
    try {
      const result = await apiRequest<LogPage>(`/api/v1/admin/logs?${queryString}`, {}, token);
      if (requestVersion !== logRequestVersion.current) return;
      activeLogQuery.current = queryString;
      setRows(result.items);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setMessage("");
    } catch (error) {
      if (requestVersion !== logRequestVersion.current) return;
      setMessage(cleanError(error));
    }
  }, [token]);

  const load = useCallback(() => replaceLogPage(buildLogQuery(true)), [buildLogQuery, replaceLogPage]);

  const loadInitial = useCallback(() => replaceLogPage(new URLSearchParams({
    category,
    limit: String(limit),
  })), [category, limit, replaceLogPage]);

  const loadMoreLogs = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore || !activeLogQuery.current) return;
    const params = new URLSearchParams(activeLogQuery.current);
    params.set("cursor", nextCursor);
    const requestVersion = ++logRequestVersion.current;
    setLoadingMore(true);
    try {
      const result = await apiRequest<LogPage>(`/api/v1/admin/logs?${params.toString()}`, {}, token);
      if (requestVersion !== logRequestVersion.current) return;
      setRows((current) => [...current, ...result.items]);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setMessage("");
    } catch (error) {
      if (requestVersion !== logRequestVersion.current) return;
      setMessage(cleanError(error));
    } finally {
      if (requestVersion === logRequestVersion.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, nextCursor, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInitial();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInitial]);

  return (
    <section className="surface rounded-lg p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{displayTitle}</h2>
          <p className="text-sm text-[var(--muted)]">{t("admin.logs.titleDesc")}</p>
        </div>
        <button className="button-primary focus-ring" type="button" onClick={() => void load()}>
          {t("admin.logs.query")}
        </button>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1.4fr_repeat(5,minmax(120px,0.6fr))]">
        <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.logs.searchPlaceholder")} />
        <input className="field" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className="field" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <select className="field" value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="">{t("admin.logs.allLevels")}</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <input className="field" value={status} onChange={(event) => setStatus(event.target.value)} placeholder={t("admin.logs.status")} />
        <input className="field" min={1} max={500} type="number" value={limit} onChange={(event) => setLimit(Math.min(500, Math.max(1, Number(event.target.value) || 100)))} />
      </div>

      <RowsPanel title={displayTitle} rows={rows} message={message} />
      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button className="button-secondary focus-ring" disabled={loadingMore} type="button" onClick={() => void loadMoreLogs()}>
            {loadingMore ? t("admin.logs.loadingMore") : t("admin.logs.loadMore")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RuntimeLogsPanel({ token, title }: { token: string; title: string }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<RuntimeLogEntry[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [level, setLevel] = useState("");
  const [limit, setLimit] = useState(300);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [followTail, setFollowTail] = useState(true);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);

  const request = useCallback(async (afterId: number, signal: AbortSignal) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (afterId > 0) params.set("afterId", String(afterId));
    if (query.trim()) params.set("q", query.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (level) params.set("level", level);
    return apiRequest<RuntimeLogResponse>(`/api/v1/admin/runtime-logs?${params.toString()}`, { signal }, token);
  }, [from, level, limit, query, to, token]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let cursor = 0;
    let first = true;
    async function poll() {
      try {
        const result = await request(cursor, controller.signal);
        if (controller.signal.aborted) return;
        if (first || result.resetNeeded) setEntries(result.items);
        else if (result.items.length) setEntries((current) => {
          const rows = new Map(current.map((entry) => [entry.id, entry]));
          for (const entry of result.items) rows.set(entry.id, entry);
          return [...rows.values()].slice(-limit);
        });
        cursor = result.lastId;
        first = false;
        setMessage("");
      } catch (error) {
        if (!controller.signal.aborted) setMessage(cleanError(error));
      } finally {
        // Schedule only after completion; slow requests cannot overlap or
        // replay the same cursor. Cleanup fences results from previous filters.
        if (autoRefresh && !controller.signal.aborted) timer = setTimeout(() => void poll(), 2500);
      }
    }
    timer = setTimeout(() => void poll(), 300);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [autoRefresh, limit, refreshAttempt, request]);

  useEffect(() => {
    if (!followTail || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [entries, followTail]);

  async function copyVisibleLogs() {
    try {
      await navigator.clipboard.writeText(entries.map((entry) => entry.line).join("\n"));
      setMessage(t("admin.runtimeLogs.copied"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  return (
    <section className="surface rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.runtimeLogs.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary focus-ring" type="button" onClick={() => void copyVisibleLogs()}>{t("admin.runtimeLogs.copy")}</button>
          <button className="button-primary focus-ring" type="button" onClick={() => setRefreshAttempt((value) => value + 1)}>{t("admin.runtimeLogs.refresh")}</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_repeat(4,minmax(130px,0.6fr))]">
        <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.runtimeLogs.searchPlaceholder")} />
        <input className="field" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className="field" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <select className="field" value={level} onChange={(event) => setLevel(event.target.value)}>
          <option value="">{t("admin.logs.allLevels")}</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <input aria-label={t("admin.runtimeLogs.limit")} className="field" min={50} max={1000} type="number" value={limit} onChange={(event) => setLimit(Math.min(1000, Math.max(50, Number(event.target.value) || 300)))} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 font-semibold"><input checked={autoRefresh} type="checkbox" onChange={(event) => setAutoRefresh(event.target.checked)} />{t("admin.runtimeLogs.autoRefresh")}</label>
          <label className="flex items-center gap-2 font-semibold"><input checked={followTail} type="checkbox" onChange={(event) => setFollowTail(event.target.checked)} />{t("admin.runtimeLogs.followTail")}</label>
        </div>
        <span className="text-[var(--muted)]">{t("admin.logs.records", { count: entries.length })}</span>
      </div>

      {message ? <div className="mt-3"><InlineMessage text={message} /></div> : null}
      <div ref={outputRef} className="mt-4 h-[min(65vh,760px)] overflow-auto rounded-lg border border-black/40 bg-[#111814] p-4 font-mono text-[13px] leading-6 text-[#d7e1da]" role="log" aria-live="polite">
        {entries.length ? entries.map((entry) => (
          <div className={entry.level === "error" ? "text-[#ff8d8d]" : entry.level === "warn" ? "text-[#ffd47a]" : "text-[#d7e1da]"} key={entry.id}>
            <span className="select-none pr-3 text-[#718078]">{entry.id}</span>{entry.line}
          </div>
        )) : <p className="text-[#8d9a92]">{t("admin.runtimeLogs.empty")}</p>}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{t("admin.runtimeLogs.scopeHint")}</p>
    </section>
  );
}

function LogCleanupPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [retention, setRetention] = useState<LogRetentionConfig | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<LogRetentionConfig>("/api/v1/admin/logs/config", {}, token)
      .then((value) => { if (!cancelled) setRetention(value); })
      .catch((error) => { if (!cancelled) setMessage(cleanError(error)); });
    return () => { cancelled = true; };
  }, [token]);

  const categories = useMemo(() => retention ? Object.keys(retention.categoryDays).sort() : [], [retention]);

  async function saveRetention() {
    if (!retention) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await apiRequest<{ config: LogRetentionConfig }>(
        "/api/v1/admin/logs/config",
        { method: "PUT", body: JSON.stringify(retention) },
        token,
      );
      setRetention(result.config);
      setMessage(t("admin.logs.policySaved"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSaving(false);
    }
  }

  async function runCleanup() {
    setCleaning(true);
    setMessage("");
    try {
      const result = await apiRequest<{ config: LogRetentionConfig; deleted: Record<string, number> }>(
        "/api/v1/admin/logs/cleanup",
        { method: "POST" },
        token,
      );
      setRetention(result.config);
      const deletedCount = Object.values(result.deleted ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
      setMessage(t("admin.logs.cleanupComplete", { count: deletedCount }));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setCleaning(false);
    }
  }

  if (!retention) {
    return <section className="surface rounded-lg p-5 text-sm text-[var(--muted)]">{message || t("common.loading")}</section>;
  }

  return (
    <section className="surface rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{t("admin.logCleanup.title")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.logCleanup.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary focus-ring" disabled={cleaning || saving} type="button" onClick={() => void runCleanup()}>
            {cleaning ? t("common.loading") : t("admin.logs.cleanupNow")}
          </button>
          <button className="button-primary focus-ring" disabled={saving || cleaning} type="button" onClick={() => void saveRetention()}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
      {message ? <div className="mt-4"><InlineMessage text={message} /></div> : null}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4 font-bold">
          <input checked={retention.enabled} type="checkbox" onChange={(event) => setRetention({ ...retention, enabled: event.target.checked })} />
          {t("admin.logs.enableRollingCleanup")}
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t("admin.logs.defaultRetentionDays")}
          <input className="field" min={1} max={3650} type="number" value={retention.defaultDays} onChange={(event) => setRetention({ ...retention, defaultDays: Number(event.target.value) })} />
        </label>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead><tr className="text-[var(--muted)]"><th className="border-b border-[var(--line)] p-3">{t("admin.logCleanup.category")}</th><th className="border-b border-[var(--line)] p-3">{t("admin.logCleanup.retentionDays")}</th></tr></thead>
          <tbody>{categories.map((category) => <tr key={category}><th className="border-b border-[var(--line)] p-3 font-semibold">{logCategoryTitle(category, t)}</th><td className="border-b border-[var(--line)] p-3"><input className="field max-w-52" min={1} max={3650} type="number" value={retention.categoryDays[category] ?? retention.defaultDays} onChange={(event) => setRetention({ ...retention, categoryDays: { ...retention.categoryDays, [category]: Number(event.target.value) } })} /></td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{t("admin.logCleanup.saveEffect")}</p>
    </section>
  );
}

function RowsPanel({ title, rows, message }: { title: string; rows: LogRow[]; message?: string }) {
  const { t } = useI18n();
  const keys = useMemo(() => orderedLogKeys(rows).slice(0, 12), [rows]);
  return (
    <section className="surface rounded-lg p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
          <span className="text-sm text-[var(--muted)]">{t("admin.logs.records", { count: rows.length })}</span>
      </div>
      {message ? <InlineMessage text={message} /> : null}
      <div className="max-h-[calc(100vh-14rem)] overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 bg-[var(--panel)] text-[var(--muted)]">
            <tr>{keys.map((key) => <th key={key} className="border-b border-[var(--line)] px-3 py-2">{key}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {keys.map((key) => (
                  <td key={key} className="max-w-xs truncate border-b border-[var(--line)] px-3 py-2">
                    {displayCell(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState text={t("admin.logs.noRecords")} /> : null}
      </div>
    </section>
  );
}

function orderedLogKeys(rows: LogRow[]) {
  const allKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const preferred = [
    "id",
    "actor_username",
    "operator_username",
    "target_username",
    "username",
    "uploader_username",
    "actor_id",
    "operator_id",
    "target_user_id",
    "user_id",
    "uploader_id",
    "category",
    "level",
    "action",
    "method",
    "path",
    "status",
    "success",
    "result",
    "ip",
    "created_at",
  ];
  return [...preferred.filter((key) => allKeys.includes(key)), ...allKeys.filter((key) => !preferred.includes(key))];
}

export { OSSConfigPanelV2, OSSFilesPanel, OSSRowsPanel, LogsPanel, RuntimeLogsPanel, LogCleanupPanel };
