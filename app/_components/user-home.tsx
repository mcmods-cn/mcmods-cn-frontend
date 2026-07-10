"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes, OSSFileRecord } from "../_lib/oss-upload";

type FileQuota = {
  daily: QuotaItem;
  total: QuotaItem;
  single: Pick<QuotaItem, "limitBytes" | "unlimited">;
  allowedExtensions: string[];
};

type QuotaItem = {
  usedBytes: number;
  limitBytes: number;
  unlimited: boolean;
};

export function UserHome() {
  const { t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const [showFiles, setShowFiles] = useState(false);
  const [files, setFiles] = useState<OSSFileRecord[]>([]);
  const [quota, setQuota] = useState<FileQuota | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadFiles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const [nextFiles, nextQuota] = await Promise.all([
        apiRequest<OSSFileRecord[]>("/api/v1/users/me/files", {}, token),
        apiRequest<FileQuota>("/api/v1/users/me/files/quota", {}, token),
      ]);
      setFiles(nextFiles);
      setQuota(nextQuota);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.readFilesFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  async function downloadFile(file: OSSFileRecord) {
    if (!token) return;
    try {
      const result = await apiRequest<{ url: string }>("/api/v1/users/me/files/presign", { method: "POST", body: JSON.stringify({ objectKey: file.objectKey }) }, token);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.downloadFailed"));
    }
  }

  async function deleteFile(file: OSSFileRecord) {
    if (!token) return;
    const name = file.originalName || file.objectKey;
    if (!window.confirm(t("user.deleteConfirm", { name }))) return;
    setLoading(true);
    setMessage("");
    try {
      await apiRequest<{ deleted: boolean }>(
        "/api/v1/users/me/files",
        { method: "DELETE", body: JSON.stringify({ objectKey: file.objectKey }) },
        token,
      );
      setMessage(t("user.deleted"));
      await loadFiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.deleteFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-6">
        {!user ? (
          <div className="surface rounded-lg p-6">
            <h1 className="text-2xl font-bold">{t("user.loginRequiredTitle")}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{t("user.loginRequiredDescription")}</p>
            <Link className="button-primary focus-ring mt-4 inline-flex" href="/login">
              {t("user.goLogin")}
            </Link>
          </div>
        ) : (
          <>
            <div className="surface rounded-lg p-6">
              <p className="text-sm font-semibold text-[var(--accent)]">{t("user.title")}</p>
              <h1 className="text-2xl font-bold">{user.displayName || user.username}</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">@{user.username} · ID {user.id}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="button-primary focus-ring"
                  type="button"
                  onClick={() => {
                    setShowFiles((value) => !value);
                    if (!showFiles) void loadFiles();
                  }}
                >
                  {t("user.fileManager")}
                </button>
                <Link className="button-secondary focus-ring" href="/tools/playground">
                  {t("user.openPlayground")}
                </Link>
              </div>
            </div>

            {showFiles ? (
              <section className="surface rounded-lg p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{t("user.userFiles")}</h2>
                    <p className="text-sm text-[var(--muted)]">{t("user.userFilesDescription")}</p>
                  </div>
                  <button className="button-secondary focus-ring" disabled={loading} type="button" onClick={() => void loadFiles()}>
                    {loading ? t("user.refreshing") : t("user.refresh")}
                  </button>
                </div>
                {message ? <p className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm">{message}</p> : null}
                {quota ? <FileQuotaSummary quota={quota} /> : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[840px] text-left text-sm">
                    <thead className="text-[var(--muted)]">
                      <tr>
                        <th className="border-b border-[var(--line)] py-2">{t("user.file")}</th>
                        <th className="border-b border-[var(--line)] py-2">{t("user.source")}</th>
                        <th className="border-b border-[var(--line)] py-2">{t("user.size")}</th>
                        <th className="border-b border-[var(--line)] py-2">{t("user.uploadedAt")}</th>
                        <th className="border-b border-[var(--line)] py-2">{t("user.operation")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr key={file.objectKey}>
                          <td className="border-b border-[var(--line)] py-2">
                            <div className="font-semibold">{file.originalName || file.objectKey}</div>
                            <div className="max-w-xl truncate font-mono text-xs text-[var(--muted)]">{file.objectKey}</div>
                          </td>
                          <td className="border-b border-[var(--line)] py-2">{file.source || file.category}</td>
                          <td className="border-b border-[var(--line)] py-2">{formatBytes(file.sizeBytes)}</td>
                          <td className="border-b border-[var(--line)] py-2">{file.createdAt ? new Date(file.createdAt).toLocaleString() : "-"}</td>
                          <td className="border-b border-[var(--line)] py-2">
                            <button className="button-secondary focus-ring" type="button" onClick={() => void downloadFile(file)}>
                              {t("user.download")}
                            </button>
                            <button className="button-secondary focus-ring ml-2 border-[var(--red)] text-[var(--red)]" type="button" onClick={() => void deleteFile(file)}>
                              {t("common.delete")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {files.length === 0 ? <p className="py-8 text-center text-sm text-[var(--muted)]">{t("user.noUserFiles")}</p> : null}
                </div>
              </section>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function FileQuotaSummary({ quota }: { quota: FileQuota }) {
  const { t } = useI18n();
  return (
    <div className="mb-4 grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <QuotaProgress title={t("user.dailyUpload")} quota={quota.daily} />
        <QuotaProgress title={t("user.totalUpload")} quota={quota.total} />
      </div>
      <div className="grid gap-3 md:grid-cols-[260px_1fr]">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="text-sm font-bold">{t("user.singleFileLimit")}</div>
          <div className="mt-1 text-lg font-black text-[var(--accent)]">{quota.single.unlimited ? t("user.unlimited") : formatBytes(quota.single.limitBytes)}</div>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="text-sm font-bold">{t("user.allowedFormats")}</div>
          <div className="mt-2 flex max-h-24 flex-wrap gap-2 overflow-y-auto">
            {quota.allowedExtensions.map((extension) => (
              <span key={extension} className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 font-mono text-xs font-bold text-[var(--muted)]">
                {extension}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuotaProgress({ title, quota }: { title: string; quota: QuotaItem }) {
  const { t } = useI18n();
  const percent = quota.unlimited || quota.limitBytes <= 0 ? 0 : Math.min(100, Math.round((quota.usedBytes / quota.limitBytes) * 100));
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">{title}</span>
        <span className="text-xs font-semibold text-[var(--muted)]">
          {formatBytes(quota.usedBytes)} / {quota.unlimited ? t("user.unlimited") : formatBytes(quota.limitBytes)}
        </span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--panel-subtle)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: quota.unlimited ? "100%" : `${percent}%` }} />
      </div>
      <div className="mt-1 text-right text-xs font-semibold text-[var(--muted)]">{quota.unlimited ? t("user.unlimited") : `${percent}%`}</div>
    </div>
  );
}
