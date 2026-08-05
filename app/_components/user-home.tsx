"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { saveAuth, useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { formatBytes, OSSFileRecord, uploadUserFileToOSS } from "../_lib/oss-upload";
import { createFavoriteCollection, deleteFavoriteCollection, FavoriteCollection, FavoriteCollectionItem, loadFavoriteCollections, loadFavoriteItems } from "../_lib/favorite-api";
import { UserEconomyPanel } from "./user-economy-panel";
import { UserPlayerProfilesPanel } from "./user-player-profiles-panel";
import { ContentLanguagePreferences } from "./content-language-preferences";
import { TimezonePicker } from "./timezone-picker";
import { UserCommentWatchesPanel } from "./user-comment-watches-panel";
import { UserDraftsPanel } from "./user-drafts-panel";

type FileQuota = {
  daily: QuotaItem;
  total: QuotaItem;
  single: Pick<QuotaItem, "limitBytes" | "unlimited">;
  allowedExtensions: string[];
};

type QuotaItem = {
  usedBytes: number;
  limitBytes: number;
  sourceUsedBytes?: number;
  storedUsedBytes?: number;
  unlimited: boolean;
};

type ProfileSettings = {
  publicId: string;
  username: string;
  signature: string;
  signatureMaxBytes: number;
  avatarUrl: string;
  profileBackgroundUrl: string;
  timezone: string;
  messageReceive: boolean;
  canUpdateAvatar: boolean;
  canUseAnimatedAvatar: boolean;
};

type AIBalance = {
  usedTokens: number;
  reservedTokens: number;
  limitTokens: number;
  remainingTokens: number;
  unlimited: boolean;
};

type UserOverview = {
  followers: number;
  following: number;
  aiBalance: AIBalance;
};

export function UserHome() {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [files, setFiles] = useState<OSSFileRecord[]>([]);
  const [quota, setQuota] = useState<FileQuota | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [username, setUsername] = useState("");
  const [signature, setSignature] = useState("");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [savingProfile, setSavingProfile] = useState(false);
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const activeSection = accountSection(searchParams.get("section"));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.allSettled([
      apiRequest<{ emailEnabled: boolean }>("/api/v1/users/me/notification-settings", {}, token),
      apiRequest<ProfileSettings>("/api/v1/users/me/profile-settings", {}, token),
      apiRequest<UserOverview>("/api/v1/users/me/overview", {}, token),
    ])
      .then(([notificationResult, profileResult, overviewResult]) => {
        if (cancelled) return;
        if (notificationResult.status === "fulfilled") setEmailNotifications(notificationResult.value.emailEnabled);
        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
          setUsername(profileResult.value.username);
          setSignature(profileResult.value.signature);
          setTimezone(profileResult.value.timezone);
        }
        if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function updateProfile(payload: Record<string, unknown>) {
    if (!token) return null;
    const nextProfile = await apiRequest<ProfileSettings>(
      "/api/v1/users/me/profile-settings",
      { method: "PUT", body: JSON.stringify(payload) },
      token,
    );
    setProfile(nextProfile);
    setUsername(nextProfile.username);
    setSignature(nextProfile.signature);
    setTimezone(nextProfile.timezone);
    if (user) {
      saveAuth({ token, user: { ...user, username: nextProfile.username, avatarUrl: nextProfile.avatarUrl, signature: nextProfile.signature } });
    }
    return nextProfile;
  }

  async function saveSignature() {
    if (!profile) return;
    if (utf8Bytes(signature) > profile.signatureMaxBytes) {
      setMessage(t("user.signatureTooLong", { count: profile.signatureMaxBytes }));
      return;
    }
    setSavingProfile(true);
    setMessage("");
    try {
      await updateProfile({ signature });
      setMessage(t("user.profileSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.profileSaveFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveUsername() {
    const validation = validateEditableUsername(username);
    if (validation) {
      setMessage(t(validation));
      return;
    }
    setSavingProfile(true);
    setMessage("");
    try {
      await updateProfile({ username });
      setMessage(t("user.usernameSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.profileSaveFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveTimezone() {
    if (!profile || timezone === profile.timezone) return;
    setSavingProfile(true);
    setMessage("");
    try {
      await updateProfile({ timezone });
      setMessage(t("user.timezoneSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.profileSaveFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function updateMessageReceive(enabled: boolean) {
    if (!profile) return;
    setSavingProfile(true);
    setMessage("");
    try {
      await updateProfile({ messageReceive: enabled });
      setMessage(t("user.privateMessageSettingSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.profileSaveFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!profile || !token) return;
    const apng = await isAPNG(file);
    const animated = apng || /\.(gif|apng)$/i.test(file.name) || file.type === "image/gif" || file.type === "image/apng";
    if (animated && !profile.canUseAnimatedAvatar) {
      setMessage(t("user.animatedAvatarPermissionRequired"));
      return;
    }
    setSavingProfile(true);
    setMessage("");
    try {
      const uploadFile = apng && file.type !== "image/apng"
        ? new File([file], file.name, { type: "image/apng", lastModified: file.lastModified })
        : file;
      const uploaded = await uploadUserFileToOSS(uploadFile, token, "avatar");
      await updateProfile({ avatarFileId: uploaded.id });
      setMessage(t("user.avatarUpdated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.avatarUpdateFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

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

  useEffect(() => {
    if (activeSection !== "files") return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadFiles(); });
    return () => { cancelled = true; };
  }, [activeSection, loadFiles]);

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
    if (!token || file.locked) return;
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

  async function updateEmailNotifications(enabled: boolean) {
    if (!token) return;
    setSavingSettings(true);
    try {
      const settings = await apiRequest<{ emailEnabled: boolean }>(
        "/api/v1/users/me/notification-settings",
        { method: "PUT", body: JSON.stringify({ emailEnabled: enabled }) },
        token,
      );
      setEmailNotifications(settings.emailEnabled);
      setMessage(t("user.notificationSettingsSaved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.notificationSettingsFailed"));
    } finally {
      setSavingSettings(false);
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
            <div
              className="surface relative overflow-hidden rounded-lg p-6"
              style={profile?.profileBackgroundUrl ? {
                backgroundImage: `url("${profile.profileBackgroundUrl.replaceAll('"', "%22")}")`,
                backgroundPosition: "center",
                backgroundSize: "cover",
              } : undefined}
            >
              {profile?.profileBackgroundUrl ? (
                <div className="absolute inset-0 bg-[var(--background)] opacity-80" aria-hidden="true" />
              ) : null}
              <div className="relative z-10 flex items-center gap-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent)] text-3xl font-black text-white">
                  {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="h-full w-full object-cover" src={profile.avatarUrl} />
                  ) : user.username.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--accent)]">{t("user.title")}</p>
                  <h1 className="truncate text-2xl font-bold">{user.username}</h1>
                  <p className="mt-2 text-sm text-[var(--muted)]">ID {profile?.publicId || "-"}</p>
                </div>
              </div>
              <div className="relative z-10 mt-4 flex flex-wrap gap-2">
                <Link className="button-secondary focus-ring" href="/tools/playground">
                  {t("user.openPlayground")}
                </Link>
                {profile?.publicId ? <Link className="button-secondary focus-ring" href={`/user/${encodeURIComponent(profile.publicId)}?preview=1`}>
                  {t("user.previewAsVisitor")}
                </Link> : <button className="button-secondary focus-ring" disabled type="button">{t("user.previewAsVisitor")}</button>}
              </div>
              <div className="relative z-10 mt-5 grid border-y border-[var(--line)] sm:grid-cols-3">
                <AccountMetric label={t("user.myFollowing")} value={overview ? formatTokenCount(overview.following, locale) : "-"} />
                <AccountMetric className="sm:border-x sm:border-[var(--line)]" label={t("user.myFollowers")} value={overview ? formatTokenCount(overview.followers, locale) : "-"} />
                <AIBalanceMetric balance={overview?.aiBalance ?? null} locale={locale} />
              </div>
            </div>

            <nav className="surface flex overflow-x-auto rounded-lg border-b border-[var(--line)]" aria-label={t("user.accountSections")}>
              <button className={`focus-ring border-b-2 px-5 py-4 font-black ${activeSection === "settings" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`} type="button" onClick={() => router.replace("/user?section=settings", { scroll: false })}>{t("user.settings")}</button>
              <button className={`focus-ring border-b-2 px-5 py-4 font-black ${activeSection === "drafts" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`} type="button" onClick={() => router.replace("/user?section=drafts", { scroll: false })}>{t("drafts.title")}</button>
              <button className={`focus-ring border-b-2 px-5 py-4 font-black ${activeSection === "favorites" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`} type="button" onClick={() => router.replace("/user?section=favorites", { scroll: false })}>{t("favorites.title")}</button>
              <button className={`focus-ring border-b-2 px-5 py-4 font-black ${activeSection === "comment-watches" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`} type="button" onClick={() => router.replace("/user?section=comment-watches", { scroll: false })}>{t("commentWatches.title")}</button>
              <button className={`focus-ring border-b-2 px-5 py-4 font-black ${activeSection === "files" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`} type="button" onClick={() => router.replace("/user?section=files", { scroll: false })}>{t("user.fileManager")}</button>
              <button className={`focus-ring border-b-2 px-5 py-4 font-black ${activeSection === "economy" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`} type="button" onClick={() => router.replace("/user?section=economy", { scroll: false })}>{t("user.economyAndProgression")}</button>
              <button className={`focus-ring border-b-2 px-5 py-4 font-black ${activeSection === "players" ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`} type="button" onClick={() => router.replace("/user?section=players", { scroll: false })}>{t("skins.playerProfiles")}</button>
            </nav>

            {activeSection === "settings" ? <section className="surface rounded-lg p-4">
              <h2 className="text-lg font-bold">{t("user.settings")}</h2>
              {message ? <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm">{message}</p> : null}
              {profile ? (
                <div className="mt-3 grid gap-3">
                  <ContentLanguagePreferences token={token} />
                  <div className="rounded-lg border border-[var(--line)] p-4">
                    <p className="font-semibold">{t("user.timezone")}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{t("user.timezoneDescription")}</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                      <TimezonePicker className="min-w-0 flex-1" disabled={savingProfile} title={t("timezonePicker.settingsTitle")} value={timezone} onChange={setTimezone} />
                      <button className="button-primary focus-ring shrink-0" disabled={savingProfile || timezone === profile.timezone} type="button" onClick={() => void saveTimezone()}>{t("user.saveTimezone")}</button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] p-4">
                    <label className="font-semibold" htmlFor="profile-username">{t("user.username")}</label>
                    <p className="mt-1 text-sm text-[var(--muted)]">{t("user.usernameDescription")}</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input id="profile-username" className="field min-w-0 flex-1" maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} />
                      <button className="button-primary focus-ring shrink-0" disabled={savingProfile || Boolean(validateEditableUsername(username)) || username === profile.username} type="button" onClick={() => void saveUsername()}>{t("user.saveUsername")}</button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{t("user.avatar")}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">{t("user.avatarDescription")}</p>
                      </div>
                      {profile.canUpdateAvatar ? (
                        <label className="button-secondary focus-ring cursor-pointer">
                          {savingProfile ? t("admin.saving") : t("user.chooseAvatar")}
                          <input
                            className="sr-only"
                            accept="image/png,image/jpeg,image/webp,image/gif,image/apng,.apng"
                            disabled={savingProfile}
                            type="file"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              if (file) void uploadAvatar(file);
                            }}
                          />
                        </label>
                      ) : <span className="text-sm text-[var(--muted)]">{t("user.avatarPermissionRequired")}</span>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] p-4">
                    <label className="font-semibold" htmlFor="profile-signature">{t("user.signature")}</label>
                    <textarea id="profile-signature" className="field mt-2 min-h-24 resize-y" value={signature} onChange={(event) => setSignature(event.target.value)} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <span className={`text-xs font-semibold ${utf8Bytes(signature) > profile.signatureMaxBytes ? "text-red-600" : "text-[var(--muted)]"}`}>
                        {t("user.signatureBytes", { used: utf8Bytes(signature), limit: profile.signatureMaxBytes })}
                      </span>
                      <button className="button-primary focus-ring" disabled={savingProfile || utf8Bytes(signature) > profile.signatureMaxBytes} type="button" onClick={() => void saveSignature()}>
                        {t("user.saveProfile")}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--line)] p-4">
                    <span>
                      <span className="block font-semibold">{t("user.allowPrivateMessages")}</span>
                      <span className="mt-1 block text-sm text-[var(--muted)]">{t("user.allowPrivateMessagesDescription")}</span>
                    </span>
                    <input checked={profile.messageReceive} disabled={savingProfile} type="checkbox" onChange={(event) => void updateMessageReceive(event.target.checked)} />
                  </label>
                </div>
              ) : null}
              <label className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-[var(--line)] p-4">
                <span>
                  <span className="block font-semibold">{t("user.emailNotifications")}</span>
                  <span className="mt-1 block text-sm text-[var(--muted)]">{t("user.emailNotificationsDescription")}</span>
                </span>
                <input
                  checked={emailNotifications}
                  disabled={savingSettings}
                  type="checkbox"
                  onChange={(event) => void updateEmailNotifications(event.target.checked)}
                />
              </label>
            </section> : activeSection === "drafts" ? <UserDraftsPanel token={token} /> : activeSection === "favorites" ? <FavoriteCollectionsPanel token={token} /> : null}

            {activeSection === "files" ? (
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
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{file.originalName || file.objectKey}</span>
                              {file.converted ? <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">{t("user.convertedToWebP")}</span> : null}
                              {file.locked ? <span className="rounded-md bg-[var(--warning-soft)] px-2 py-0.5 text-xs font-bold text-[var(--warning)]">{t("user.reviewFileLocked")}</span> : null}
                            </div>
                            {file.converted ? <div className="mt-1 text-xs text-[var(--muted)]">{t("user.sourceFile")}: {file.sourceOriginalName}</div> : null}
                            <div className="max-w-xl truncate font-mono text-xs text-[var(--muted)]">{file.objectKey}</div>
                          </td>
                          <td className="border-b border-[var(--line)] py-2">{file.source || file.category}</td>
                          <td className="border-b border-[var(--line)] py-2">
                            {file.converted ? (
                              <div className="space-y-1 text-xs">
                                <div>{t("user.sourceSize")}: <strong>{formatBytes(file.sourceSizeBytes ?? file.sizeBytes)}</strong></div>
                                <div>{t("user.storedSize")}: <strong>{formatBytes(file.sizeBytes)}</strong></div>
                              </div>
                            ) : formatBytes(file.sizeBytes)}
                          </td>
                          <td className="border-b border-[var(--line)] py-2">{file.createdAt ? new Date(file.createdAt).toLocaleString() : "-"}</td>
                          <td className="border-b border-[var(--line)] py-2">
                            <button className="button-secondary focus-ring" type="button" onClick={() => void downloadFile(file)}>
                              {t("user.download")}
                            </button>
                            <button className="button-secondary focus-ring ml-2 border-[var(--red)] text-[var(--red)]" disabled={file.locked} title={file.locked ? t("user.reviewFileLocked") : undefined} type="button" onClick={() => void deleteFile(file)}>
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
            {activeSection === "economy" ? (
              <UserEconomyPanel
                token={token}
                onBackgroundChange={(profileBackgroundUrl) =>
                  setProfile((current) => current ? { ...current, profileBackgroundUrl } : current)
                }
              />
            ) : null}
            {activeSection === "players" ? <UserPlayerProfilesPanel token={token} /> : null}
            {activeSection === "comment-watches" ? <UserCommentWatchesPanel token={token} /> : null}
          </>
        )}
      </section>
    </main>
  );
}

type AccountSection = "settings" | "drafts" | "favorites" | "comment-watches" | "files" | "economy" | "players";

function accountSection(value: string | null): AccountSection {
  return value === "drafts" || value === "favorites" || value === "comment-watches" || value === "files" || value === "economy" || value === "players" ? value : "settings";
}

function FavoriteCollectionsPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [collections, setCollections] = useState<FavoriteCollection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<FavoriteCollectionItem[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refreshCollections = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadFavoriteCollections(token);
      setCollections(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("favorites.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    let cancelled = false;
    loadFavoriteCollections(token)
      .then((next) => {
        if (cancelled) return;
        setCollections(next);
        setSelectedId(next[0]?.id ?? null);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("favorites.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t, token]);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    loadFavoriteItems(token, selectedId)
      .then((result) => { if (!cancelled) setItems(result); })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : t("favorites.loadFailed")); });
    return () => { cancelled = true; };
  }, [selectedId, t, token]);

  async function createCollection() {
    const nextName = name.trim();
    if (!nextName) return;
    try {
      const created = await createFavoriteCollection(token, nextName);
      setCollections((current) => [...current, created]);
      setSelectedId(created.id);
      setName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("favorites.createFailed"));
    }
  }

  async function removeCollection(collection: FavoriteCollection) {
    if (collection.isDefault || !window.confirm(t("favorites.deleteConfirm", { name: collection.name }))) return;
    try {
      await deleteFavoriteCollection(token, collection.id);
      await refreshCollections();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("favorites.deleteFailed"));
    }
  }

  const selected = collections.find((item) => item.id === selectedId);
  return <section className="surface rounded-lg p-4"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-black">{t("favorites.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("favorites.description")}</p></div><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input className="field min-w-48" placeholder={t("favorites.newFolderName")} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createCollection(); } }} /><button className="button-primary focus-ring" disabled={!name.trim()} type="button" onClick={() => void createCollection()}>{t("favorites.createFolder")}</button></div></div>{message ? <p className="mt-4 rounded-lg border border-[var(--line)] p-3 text-sm">{message}</p> : null}<div className="mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="grid content-start gap-2">{loading ? <p className="p-3 font-bold text-[var(--muted)]">{t("common.loading")}</p> : collections.map((collection) => <div className={`flex items-center rounded-lg border ${selectedId === collection.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`} key={collection.id}><button className="focus-ring min-w-0 flex-1 px-3 py-3 text-left" type="button" onClick={() => setSelectedId(collection.id)}><span className="block truncate font-bold">{collection.isDefault ? t("favorites.defaultFolder") : collection.name}</span><span className="text-xs text-[var(--muted)]">{t("favorites.itemCount", { count: collection.itemCount })}</span></button>{!collection.isDefault ? <button className="focus-ring mr-2 rounded p-2 text-sm text-red-600" title={t("common.delete")} type="button" onClick={() => void removeCollection(collection)}>×</button> : null}</div>)}</aside><section className="min-w-0 rounded-lg border border-[var(--line)] p-4"><h3 className="font-black">{selected?.isDefault ? t("favorites.defaultFolder") : selected?.name ?? t("favorites.title")}</h3>{items.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{items.map((item) => <Link className="focus-ring rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]" href={favoriteItemHref(item)} key={`${item.entityType}:${item.entityKey}`}><span className="block truncate font-bold">{item.metadata.primaryName || item.metadata.secondaryName || item.metadata.title || item.entityKey}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{item.entityType} · {item.entityKey}</span></Link>)}</div> : <p className="py-12 text-center text-sm text-[var(--muted)]">{t("favorites.empty")}</p>}</section></div></section>;
}

function favoriteItemHref(item: FavoriteCollectionItem) {
  if (item.entityType === "mod") return `/mods/${item.metadata.slug || item.entityKey}`;
  if (item.entityType === "blueprint") return `/blueprints/${item.metadata.publicId || item.entityKey}`;
  return `/${item.entityKey}`;
}

function AccountMetric({ className = "", label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`px-3 py-4 ${className}`}>
      <div className="text-sm font-semibold text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function AIBalanceMetric({ balance, locale }: { balance: AIBalance | null; locale: string }) {
  const { t } = useI18n();
  const consumed = balance ? balance.usedTokens + balance.reservedTokens : 0;
  const percent = !balance || balance.unlimited || balance.limitTokens <= 0 ? 0 : Math.min(100, Math.round((consumed / balance.limitTokens) * 100));
  return (
    <div className="px-3 py-4">
      <div className="text-sm font-semibold text-[var(--muted)]">{t("user.todayAITokenBalance")}</div>
      <div className="mt-1 text-2xl font-black text-[var(--accent)]">
        {!balance ? "-" : balance.unlimited ? t("user.unlimited") : formatTokenCount(balance.remainingTokens, locale)}
      </div>
      {balance ? (
        <>
          {!balance.unlimited ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--panel-subtle)]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          <div className="mt-2 text-xs text-[var(--muted)]">
            {t("user.aiTokenUsage", { used: formatTokenCount(balance.usedTokens, locale), reserved: formatTokenCount(balance.reservedTokens, locale) })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatTokenCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(Math.max(0, value));
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

function validateEditableUsername(username: string) {
  const value = username.trim();
  if ([...value].length < 1 || [...value].length > 32) return "login.usernameLength";
  if (value !== username || /[\p{C}\s]/u.test(value)) return "login.usernamePattern";
  return "";
}

async function isAPNG(file: File) {
  if (!/\.png$/i.test(file.name) && file.type !== "image/png") return false;
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer());
  for (let index = 8; index + 7 < bytes.length;) {
    const length = ((bytes[index] << 24) | (bytes[index + 1] << 16) | (bytes[index + 2] << 8) | bytes[index + 3]) >>> 0;
    const type = String.fromCharCode(bytes[index + 4], bytes[index + 5], bytes[index + 6], bytes[index + 7]);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    index += 12 + length;
  }
  return false;
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
      {quota.sourceUsedBytes !== undefined && quota.storedUsedBytes !== undefined ? (
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
          <span>{t("user.sourceSize")}: {formatBytes(quota.sourceUsedBytes)}</span>
          <span>{t("user.storedSize")}: {formatBytes(quota.storedUsedBytes)}</span>
        </div>
      ) : null}
    </div>
  );
}
