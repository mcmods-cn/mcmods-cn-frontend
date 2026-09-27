"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../_lib/i18n-provider";
import {
  createPlayerProfile,
  deleteLauncherCredential,
  deleteLauncherSession,
  deletePlayerProfile,
  LauncherSession,
  launcherServiceURL,
  loadLauncherSessions,
  loadMyPlayerProfiles,
  loadSkinService,
  loadWardrobe,
  PlayerProfile,
  removeFromWardrobe,
  saveLauncherCredential,
  SkinServiceInfo,
  SkinTexture,
  skinTextureURL,
  SkinVisibility,
  updatePlayerProfile,
  updatePlayerTextures,
} from "../_lib/skin-api";
import { notifySite } from "../_lib/site-notice";
import { SkinPreview2D } from "./skin-preview";

const SkinViewerCanvas = dynamic(
  () => import("@/components/minecraft-skin/SkinViewerCanvas").then((module) => module.SkinViewerCanvas),
  { ssr: false },
);

const playerProfileNamePattern = /^[A-Za-z0-9_]{3,16}$/;

export function UserPlayerProfilesPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [service, setService] = useState<SkinServiceInfo | null>(null);
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [wardrobe, setWardrobe] = useState<SkinTexture[]>([]);
  const [wardrobeTotal, setWardrobeTotal] = useState(0);
  const [wardrobeHasMore, setWardrobeHasMore] = useState(false);
  const [wardrobeNextCursor, setWardrobeNextCursor] = useState("");
  const [sessions, setSessions] = useState<LauncherSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [draft, setDraft] = useState({ name: "", bio: "", visibility: "public" as SkinVisibility, isDefault: false });
  const [skinId, setSkinId] = useState("");
  const [capeId, setCapeId] = useState("");
  const [launcherPassword, setLauncherPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      loadSkinService(token),
      loadMyPlayerProfiles(token),
      loadWardrobe(token, { limit: 100 }),
      loadLauncherSessions(token),
    ]);
    const [serviceResult, profileResult, wardrobeResult, sessionResult] = results;
    if (serviceResult.status === "fulfilled") setService(serviceResult.value);
    if (profileResult.status === "fulfilled") {
      setProfiles(profileResult.value);
      setSelectedId((current) => profileResult.value.some((item) => item.publicId === current) ? current : profileResult.value[0]?.publicId || "");
    }
    if (wardrobeResult.status === "fulfilled") {
      setWardrobe(wardrobeResult.value.items);
      setWardrobeTotal(wardrobeResult.value.total);
      setWardrobeHasMore(wardrobeResult.value.hasMore);
      setWardrobeNextCursor(wardrobeResult.value.nextCursor);
    }
    if (sessionResult.status === "fulfilled") setSessions(sessionResult.value);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") setMessage(errorMessage(failure.reason, t("skins.profileLoadFailed")));
    else setMessage("");
    setLoading(false);
  }, [t, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = profiles.find((profile) => profile.publicId === selectedId) ?? null;
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDraft({ name: selected.name, bio: selected.bio || "", visibility: selected.visibility, isDefault: selected.isDefault });
      setSkinId(selected.skin?.publicId || "");
      setCapeId(selected.cape?.publicId || "");
    });
    return () => { cancelled = true; };
  }, [selected]);

  const skins = useMemo(() => wardrobeTextureOptions(wardrobe, selected?.skin, "skin"), [selected?.skin, wardrobe]);
  const capes = useMemo(() => wardrobeTextureOptions(wardrobe, selected?.cape, "cape"), [selected?.cape, wardrobe]);

  async function loadMoreWardrobe() {
    if (!wardrobeHasMore || !wardrobeNextCursor || busy) return;
    setBusy("wardrobe:more");
    try {
      const page = await loadWardrobe(token, { limit: 100, cursor: wardrobeNextCursor });
      setWardrobe((items) => {
        const byID = new Map(items.map((item) => [item.publicId, item]));
        for (const item of page.items) byID.set(item.publicId, item);
        return [...byID.values()];
      });
      setWardrobeTotal(page.total);
      setWardrobeHasMore(page.hasMore);
      setWardrobeNextCursor(page.nextCursor);
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.profileLoadFailed")), t("skins.wardrobe"), "danger");
    } finally {
      setBusy("");
    }
  }

  async function createProfile() {
    if (!playerProfileNamePattern.test(newProfileName.trim())) return;
    setBusy("create");
    try {
      const created = await createPlayerProfile({ name: newProfileName.trim(), visibility: "public" }, token);
      setProfiles((items) => [...items, created]);
      setSelectedId(created.publicId);
      setNewProfileName("");
      notifySite(t("skins.profileCreated"), created.name, "success");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.createFailed")), t("skins.playerProfiles"), "danger");
    } finally {
      setBusy("");
    }
  }

  async function saveProfile() {
    if (!selected || !playerProfileNamePattern.test(draft.name.trim())) return;
    setBusy("profile");
    try {
      const updated = await updatePlayerProfile(selected.publicId, { ...draft, name: draft.name.trim() }, token);
      replaceProfile(updated);
      notifySite(t("skins.profileSaved"), updated.name, "success");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.saveFailed")), selected.name, "danger");
    } finally {
      setBusy("");
    }
  }

  async function saveTextures() {
    if (!selected) return;
    setBusy("textures");
    try {
      const updated = await updatePlayerTextures(selected.publicId, { skinPublicId: skinId || null, capePublicId: capeId || null }, token);
      replaceProfile(updated);
      notifySite(t("skins.textureAssignmentSaved"), updated.name, "success");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.saveFailed")), selected.name, "danger");
    } finally {
      setBusy("");
    }
  }

  async function removeProfile() {
    if (!selected || !window.confirm(t("skins.deleteProfileConfirm", { name: selected.name }))) return;
    setBusy("delete-profile");
    try {
      await deletePlayerProfile(selected.publicId, token);
      const remaining = profiles.filter((item) => item.publicId !== selected.publicId);
      setProfiles(remaining);
      setSelectedId(remaining[0]?.publicId || "");
      notifySite(t("skins.profileDeleted"), selected.name, "success");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.deleteFailed")), selected.name, "danger");
    } finally {
      setBusy("");
    }
  }

  async function removeWardrobeItem(texture: SkinTexture) {
    if (!window.confirm(t("skins.removeWardrobeConfirm", { name: texture.name }))) return;
    setBusy(`wardrobe:${texture.publicId}`);
    try {
      await removeFromWardrobe(texture.publicId, token);
      setWardrobe((items) => items.filter((item) => item.publicId !== texture.publicId));
      setWardrobeTotal((total) => Math.max(0, total - 1));
      notifySite(t("skins.wardrobeRemoved"), texture.name, "success");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.actionFailed")), texture.name, "danger");
    } finally {
      setBusy("");
    }
  }

  async function updateCredential() {
    if (service?.enabled !== true) {
      setMessage(t("skins.launcherServiceUnavailable"));
      return;
    }
    if (launcherPassword.length < 12) {
      setMessage(t("skins.launcherPasswordTooShort"));
      return;
    }
    setBusy("credential");
    try {
      const result = await saveLauncherCredential(launcherPassword, token);
      setService((current) => current ? {
        ...current,
        launcher: {
          ...current.launcher,
          enabled: result.enabled ?? true,
          accountUuid: result.accountUuid || current.launcher?.accountUuid,
        },
      } : current);
      setLauncherPassword("");
      setShowPassword(false);
      setMessage(t("skins.credentialSaved"));
      notifySite(t("skins.credentialSaved"), t("skins.launcherLogin"), "success");
    } catch (reason) {
      setMessage(errorMessage(reason, t("skins.saveFailed")));
    } finally {
      setBusy("");
    }
  }

  async function revokeCredential() {
    if (!window.confirm(t("skins.revokeCredentialConfirm"))) return;
    setBusy("revoke-credential");
    try {
      await deleteLauncherCredential(token);
      setService((current) => current ? {
        ...current,
        launcher: { ...current.launcher, enabled: false },
      } : current);
      setSessions([]);
      setMessage(t("skins.credentialRevoked"));
    } catch (reason) {
      setMessage(errorMessage(reason, t("skins.deleteFailed")));
    } finally {
      setBusy("");
    }
  }

  async function revokeSession(session: LauncherSession) {
    setBusy(`session:${session.id}`);
    try {
      await deleteLauncherSession(session.id, token);
      setSessions((items) => items.filter((item) => String(item.id) !== String(session.id)));
    } catch (reason) {
      setMessage(errorMessage(reason, t("skins.deleteFailed")));
    } finally {
      setBusy("");
    }
  }

  function replaceProfile(updated: PlayerProfile) {
    setProfiles((items) => items.map((item) => item.publicId === updated.publicId ? updated : item));
  }

  async function copyValue(kind: "root" | "authlib", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? "" : current), 1600);
    } catch {
      setMessage(t("skins.copyFailed"));
    }
  }

  const apiRoot = launcherServiceURL(service);
  const launcherServiceEnabled = service?.enabled === true;
  const authlibValue = `authlib-injector:yggdrasil-server:${encodeURIComponent(apiRoot)}`;

  return (
    <section className="grid gap-4">
      <div className="surface rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-black">{t("skins.playerProfiles")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("skins.playerProfilesDescription")}</p></div>
          <button className="button-secondary focus-ring" disabled={loading} type="button" onClick={() => void load()}>{loading ? t("common.loading") : t("skins.refresh")}</button>
        </div>
        {message ? <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 text-sm">{message}</p> : null}
        <div className="mt-5 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input className="field" maxLength={16} minLength={3} pattern="[A-Za-z0-9_]{3,16}" placeholder={t("skins.profileName")} value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createProfile(); } }} />
              <button className="button-primary focus-ring" disabled={!playerProfileNamePattern.test(newProfileName.trim()) || busy === "create" || Boolean(service?.profileLimit && profiles.length >= service.profileLimit)} type="button" onClick={() => void createProfile()}>+</button>
            </div>
            {service?.profileLimit ? <p className="text-xs text-[var(--muted)]">{t("skins.profileLimit", { used: profiles.length, limit: service.profileLimit })}</p> : null}
            <div className="grid gap-2">
              {profiles.map((profile) => (
                <button className={`focus-ring flex items-center gap-3 rounded-lg border p-3 text-left ${selectedId === profile.publicId ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`} key={profile.publicId} type="button" onClick={() => setSelectedId(profile.publicId)}>
                  <SkinPreview2D className="h-20 w-14 shrink-0 rounded-md" kind="skin" label={profile.name} model={profile.skin?.model || "default"} src={skinTextureURL(profile.skin)} />
                  <span className="min-w-0"><span className="block truncate font-black">{profile.name}</span><code className="mt-1 block truncate text-[10px] text-[var(--muted)]">{profile.uuid}</code>{profile.isDefault ? <span className="mt-1 inline-block rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">{t("skins.defaultProfile")}</span> : null}</span>
                </button>
              ))}
              {!loading && profiles.length === 0 ? <p className="rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">{t("skins.noProfiles")}</p> : null}
            </div>
          </aside>

          {selected ? <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(320px,1.1fr)]">
            <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)]">
              <SkinViewerCanvas capeUrl={skinTextureURL(selected.cape)} className="h-[480px]" model={selected.skin?.model || "default"} skinUrl={skinTextureURL(selected.skin)} />
              <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--panel)] p-3"><span className="min-w-0 truncate font-mono text-xs text-[var(--muted)]">{selected.publicId}</span><Link className="text-sm font-black text-[var(--accent)]" href={`/players/${selected.publicId}`}>{t("skins.openPublicProfile")}</Link></div>
            </section>
            <div className="space-y-4">
              <section className="rounded-lg border border-[var(--line)] p-4">
                <h3 className="font-black">{t("skins.profileSettings")}</h3>
                <div className="mt-3 grid gap-3">
                  <label className="text-sm font-bold">{t("skins.profileName")}<input className="field mt-1" maxLength={16} minLength={3} pattern="[A-Za-z0-9_]{3,16}" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                  <label className="text-sm font-bold">{t("skins.profileBio")}<textarea className="field mt-1 min-h-20" maxLength={500} value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} /></label>
                  <label className="text-sm font-bold">{t("skins.visibility")}<select className="field mt-1" value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value as SkinVisibility })}><option value="public">{t("skins.visibilityPublic")}</option><option value="unlisted">{t("skins.visibilityUnlisted")}</option><option value="private">{t("skins.visibilityPrivate")}</option></select></label>
                  <label className="flex items-center gap-2 text-sm font-bold"><input checked={draft.isDefault} type="checkbox" onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })} />{t("skins.makeDefault")}</label>
                  <button className="button-primary focus-ring" disabled={!playerProfileNamePattern.test(draft.name.trim()) || busy === "profile"} type="button" onClick={() => void saveProfile()}>{busy === "profile" ? t("skins.saving") : t("skins.saveProfile")}</button>
                </div>
              </section>
              <section className="rounded-lg border border-[var(--line)] p-4">
                <h3 className="font-black">{t("skins.textureSlots")}</h3>
                <div className="mt-3 grid gap-3">
                  <label className="text-sm font-bold">{t("skins.skinSlot")}<select className="field mt-1" value={skinId} onChange={(event) => setSkinId(event.target.value)}><option value="">{t("skins.none")}</option>{skins.map((item) => <option key={item.publicId} value={item.publicId}>{item.name} · {item.model === "slim" ? t("skins.modelSlim") : t("skins.modelDefault")}</option>)}</select></label>
                  <label className="text-sm font-bold">{t("skins.capeSlot")}<select className="field mt-1" value={capeId} onChange={(event) => setCapeId(event.target.value)}><option value="">{t("skins.none")}</option>{capes.map((item) => <option key={item.publicId} value={item.publicId}>{item.name}</option>)}</select></label>
                  <button className="button-primary focus-ring" disabled={busy === "textures"} type="button" onClick={() => void saveTextures()}>{busy === "textures" ? t("skins.saving") : t("skins.saveTextures")}</button>
                </div>
              </section>
              <button className="text-sm font-bold text-[var(--red)] hover:underline" disabled={busy === "delete-profile"} type="button" onClick={() => void removeProfile()}>{t("skins.deleteProfile")}</button>
            </div>
          </div> : null}
        </div>
      </div>

      <section className="surface rounded-lg p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-black">{t("skins.wardrobe")}</h2><span className="text-xs text-[var(--muted)]">{t("skins.wardrobeLoaded", { loaded: wardrobe.length, total: wardrobeTotal })}</span></div>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("skins.wardrobeDescription")}</p>
        {wardrobe.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{wardrobe.map((texture) => <article className="overflow-hidden rounded-lg border border-[var(--line)]" key={texture.publicId}><Link href={`/skins/${texture.publicId}`}><SkinPreview2D className="h-48 w-full p-4" kind={texture.kind} label={texture.name} model={texture.model} src={skinTextureURL(texture)} /></Link><div className="p-3"><div className="flex items-start justify-between gap-2"><span className="min-w-0"><Link className="block truncate font-black hover:text-[var(--accent)]" href={`/skins/${texture.publicId}`}>{texture.name}</Link><span className="text-xs text-[var(--muted)]">{texture.kind === "cape" ? t("skins.kindCape") : texture.model === "slim" ? t("skins.modelSlim") : t("skins.modelDefault")}</span></span><button className="text-xs font-bold text-[var(--red)]" disabled={busy === `wardrobe:${texture.publicId}`} type="button" onClick={() => void removeWardrobeItem(texture)}>{t("common.delete")}</button></div></div></article>)}</div> : <p className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-10 text-center text-sm text-[var(--muted)]">{t("skins.wardrobeEmpty")}</p>}
        {wardrobeHasMore ? <div className="mt-5 text-center"><button className="button-secondary focus-ring" disabled={Boolean(busy)} type="button" onClick={() => void loadMoreWardrobe()}>{busy === "wardrobe:more" ? t("common.loading") : t("skins.wardrobeLoadMore")}</button></div> : null}
      </section>

      <section className="surface rounded-lg p-5">
        <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-black">{t("skins.launcherLogin")}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-black ${service?.launcher?.enabled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-[var(--panel-subtle)] text-[var(--muted)]"}`}>{service?.launcher?.enabled ? t("skins.launcherCredentialEnabled") : t("skins.launcherCredentialDisabled")}</span></div>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--muted)]">{t("skins.launcherDescription")}</p>
        {service?.launcher?.accountUuid ? <p className="mt-2 text-xs text-[var(--muted)]">{t("skins.launcherAccountId")}: <code>{service.launcher.accountUuid}</code></p> : null}
        {!launcherServiceEnabled ? <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200">{t("skins.launcherServiceUnavailable")}</p> : null}
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="grid content-start gap-4">
            {launcherServiceEnabled ? <><CopyCard copied={copied === "root"} label={t("skins.serviceAddress")} value={apiRoot} onCopy={() => void copyValue("root", apiRoot)} /><CopyCard copied={copied === "authlib"} draggable label={t("skins.authlibValue")} value={authlibValue} onCopy={() => void copyValue("authlib", authlibValue)} /></> : null}
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200">{t("skins.launcherPasswordSecurity")}</p>
            <label className="text-sm font-black">{t("skins.launcherPassword")}
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input autoComplete="new-password" className="field" disabled={!launcherServiceEnabled} maxLength={256} minLength={12} type={showPassword ? "text" : "password"} value={launcherPassword} onChange={(event) => setLauncherPassword(event.target.value)} /><button className="button-secondary focus-ring" disabled={!launcherServiceEnabled} type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? t("login.hidePassword") : t("login.showPassword")}</button></div>
              <span className="mt-2 block text-xs font-normal text-[var(--muted)]">{t("skins.launcherPasswordHint")}</span>
            </label>
            <div className="flex flex-wrap gap-2"><button className="button-primary focus-ring" disabled={!launcherServiceEnabled || launcherPassword.length < 12 || launcherPassword.length > 256 || busy === "credential"} type="button" onClick={() => void updateCredential()}>{t("skins.saveCredential")}</button><button className="button-secondary focus-ring border-[var(--red)] text-[var(--red)]" disabled={!service?.launcher?.enabled || busy === "revoke-credential"} type="button" onClick={() => void revokeCredential()}>{t("skins.revokeCredential")}</button></div>
          </div>
          <div>
            <h3 className="font-black">{t("skins.launcherSessions")}</h3>
            <div className="mt-3 grid gap-2">{sessions.map((session) => <div className="rounded-lg border border-[var(--line)] p-3" key={String(session.id)}><div className="flex items-start justify-between gap-3"><span className="min-w-0"><strong className="block truncate">{session.deviceName || session.userAgent || t("skins.unknownDevice")}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{t("skins.lastSeen")}: {formatTime(session.lastSeenAt || session.updatedAt || session.createdAt, locale)}{session.ip ? ` · ${session.ip}` : ""}</span></span><button className="text-xs font-bold text-[var(--red)]" disabled={busy === `session:${session.id}`} type="button" onClick={() => void revokeSession(session)}>{t("skins.revokeSession")}</button></div></div>)}{sessions.length === 0 ? <p className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">{t("skins.noSessions")}</p> : null}</div>
          </div>
        </div>
      </section>
    </section>
  );
}

function CopyCard({ label, value, copied, draggable = false, onCopy }: { label: string; value: string; copied: boolean; draggable?: boolean; onCopy: () => void }) {
  const { t } = useI18n();
  return <div className="rounded-lg border border-[var(--line)] p-3"><span className="text-xs font-black text-[var(--muted)]">{label}</span><div className="mt-2 flex items-start gap-2"><code className="min-w-0 flex-1 break-all rounded bg-[var(--panel-subtle)] p-2 text-xs" draggable={draggable} title={draggable ? t("skins.dragToLauncher") : undefined} onDragStart={(event) => { if (draggable) event.dataTransfer.setData("text/plain", value); }}>{value}</code><button className="button-secondary focus-ring shrink-0 px-3 py-2 text-xs" type="button" onClick={onCopy}>{copied ? t("skins.copied") : t("skins.copyAddress")}</button></div></div>;
}

function formatTime(value: string | undefined, locale: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function wardrobeTextureOptions(items: SkinTexture[], selected: SkinTexture | null | undefined, kind: "skin" | "cape") {
  const options = items.filter((item) => item.kind === kind);
  if (selected?.kind === kind && !options.some((item) => item.publicId === selected.publicId)) {
    return [selected, ...options];
  }
  return options;
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
