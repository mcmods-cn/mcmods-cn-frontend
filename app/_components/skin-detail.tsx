"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import {
  addToWardrobe,
  deleteSkin,
  loadMyPlayerProfiles,
  loadSkin,
  PlayerProfile,
  removeFromWardrobe,
  skinTextureURL,
  SkinTexture,
  SkinVisibility,
  updatePlayerTextures,
  updateSkin,
} from "../_lib/skin-api";
import { notifySite } from "../_lib/site-notice";
import { SkinPreview2D } from "./skin-preview";

const SkinViewerCanvas = dynamic(
  () => import("@/components/minecraft-skin/SkinViewerCanvas").then((module) => module.SkinViewerCanvas),
  { ssr: false },
);

export function SkinDetail({ publicId }: { publicId: string }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const router = useRouter();
  const [texture, setTexture] = useState<SkinTexture | null>(null);
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [view3D, setView3D] = useState(true);
  const [outerLayer, setOuterLayer] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", tags: "", visibility: "public" as SkinVisibility, model: "default" as "default" | "slim" });

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setLoading(true); setError(""); } });
    Promise.allSettled([
      loadSkin(publicId, token || undefined),
      token ? loadMyPlayerProfiles(token) : Promise.resolve([]),
    ]).then(([textureResult, profileResult]) => {
      if (cancelled) return;
      if (textureResult.status === "rejected") {
        setError(textureResult.reason instanceof Error ? textureResult.reason.message : t("skins.loadFailed"));
      } else {
        const nextTexture = textureResult.value;
        setTexture(nextTexture);
        setDraft({
          name: nextTexture.name,
          description: nextTexture.description || "",
          tags: nextTexture.tags.join(", "),
          visibility: nextTexture.visibility,
          model: nextTexture.model,
        });
      }
      if (profileResult.status === "fulfilled") {
        setProfiles(profileResult.value);
        setSelectedProfile((value) => value || profileResult.value[0]?.publicId || "");
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [publicId, ready, t, token]);

  async function toggleWardrobe() {
    if (!token || !texture) return;
    setBusy("wardrobe");
    try {
      if (texture.inWardrobe) await removeFromWardrobe(texture.publicId, token);
      else await addToWardrobe(texture.publicId, token);
      setTexture({ ...texture, inWardrobe: !texture.inWardrobe });
      notifySite(t(texture.inWardrobe ? "skins.wardrobeRemoved" : "skins.wardrobeAdded"), texture.name, "success");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.actionFailed")), texture.name, "danger");
    } finally {
      setBusy("");
    }
  }

  async function applyTexture() {
    if (!token || !texture || !selectedProfile) return;
    setBusy("apply");
    try {
      const updated = await updatePlayerTextures(
        selectedProfile,
        texture.kind === "skin" ? { skinPublicId: texture.publicId } : { capePublicId: texture.publicId },
        token,
      );
      setProfiles((items) => items.map((item) => item.publicId === updated.publicId ? updated : item));
      notifySite(t("skins.applied"), texture.name, "success");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.actionFailed")), texture.name, "danger");
    } finally {
      setBusy("");
    }
  }

  async function saveMetadata() {
    if (!token || !texture || !draft.name.trim()) return;
    setBusy("save");
    try {
      const updated = await updateSkin(texture.publicId, {
        name: draft.name.trim(),
        description: draft.description,
        tags: parseTags(draft.tags),
        visibility: draft.visibility,
        model: texture.kind === "skin" ? draft.model : "default",
      }, token);
      setTexture(updated);
      setEditing(false);
      notifySite(t("skins.textureSaved"), updated.name, "success");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.saveFailed")), texture.name, "danger");
    } finally {
      setBusy("");
    }
  }

  async function removeTexture() {
    if (!token || !texture || !window.confirm(t("skins.deleteConfirm", { name: texture.name }))) return;
    setBusy("delete");
    try {
      await deleteSkin(texture.publicId, token);
      router.replace("/skins");
    } catch (reason) {
      notifySite(errorMessage(reason, t("skins.deleteFailed")), texture.name, "danger");
      setBusy("");
    }
  }

  if (loading) return <StatePanel text={t("common.loading")} />;
  if (!texture) return <StatePanel text={error || t("skins.notFound")} />;

  const textureURL = skinTextureURL(texture);
  const ownerName = texture.owner?.displayName || texture.owner?.username || t("skins.anonymous");
  const selected = profiles.find((profile) => profile.publicId === selectedProfile);
  const viewerSkin = texture.kind === "skin" ? textureURL : skinTextureURL(selected?.skin);
  const viewerCape = texture.kind === "cape" ? textureURL : skinTextureURL(selected?.cape);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <article className="mx-auto max-w-7xl px-4 py-7">
        <Link className="text-sm font-black text-[var(--accent)] hover:underline" href="/skins">← {t("skins.backLibrary")}</Link>
        <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-5">
            <section className="surface overflow-hidden rounded-lg">
              <div className="grid min-h-[520px] place-items-center bg-[var(--panel-subtle)]">
                {view3D ? (
                  <SkinViewerCanvas autoRotate={autoRotate} capeUrl={viewerCape} className="h-[520px] w-full" model={texture.model} showOuterLayer={outerLayer} skinUrl={viewerSkin} />
                ) : (
                  <SkinPreview2D className="h-[520px] w-full p-12" kind={texture.kind} label={texture.name} model={texture.model} src={textureURL} />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] p-3">
                <button className={`focus-ring rounded-md px-3 py-2 text-sm font-bold ${!view3D ? "bg-[var(--accent)] text-white" : "bg-[var(--panel-subtle)]"}`} type="button" onClick={() => setView3D(false)}>{t("skins.preview2D")}</button>
                <button className={`focus-ring rounded-md px-3 py-2 text-sm font-bold ${view3D ? "bg-[var(--accent)] text-white" : "bg-[var(--panel-subtle)]"}`} type="button" onClick={() => setView3D(true)}>{t("skins.preview3D")}</button>
                {view3D ? <label className="ml-auto flex items-center gap-2 text-sm font-bold"><input checked={outerLayer} type="checkbox" onChange={(event) => setOuterLayer(event.target.checked)} />{t("skins.outerLayer")}</label> : null}
                {view3D ? <label className="flex items-center gap-2 text-sm font-bold"><input checked={autoRotate} type="checkbox" onChange={(event) => setAutoRotate(event.target.checked)} />{t("skins.autoRotate")}</label> : null}
              </div>
            </section>

            <section className="surface rounded-lg p-5">
              <h2 className="text-xl font-black">{t("skins.description")}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--muted)]">{texture.description || t("skins.noDescription")}</p>
              {texture.tags.length ? <div className="mt-4 flex flex-wrap gap-2">{texture.tags.map((tag) => <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold" key={tag}>#{tag}</span>)}</div> : null}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="surface rounded-lg p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--accent)]">{texture.kind === "cape" ? t("skins.kindCape") : texture.model === "slim" ? t("skins.modelSlim") : t("skins.modelDefault")}</p>
                  <h1 className="mt-1 break-words text-3xl font-black">{texture.name}</h1>
                  <code className="mt-2 block text-xs text-[var(--muted)]">{texture.publicId}</code>
                </div>
                <StatusBadge status={texture.reviewStatus} />
              </div>
              <dl className="mt-5 grid gap-3 border-y border-[var(--line)] py-4 text-sm">
                <DetailLine label={t("skins.owner")} value={texture.owner?.id ? <Link className="font-bold text-[var(--accent)]" href={`/user/${texture.owner.id}`}>{ownerName}</Link> : ownerName} />
                <DetailLine label={t("skins.visibility")} value={t(`skins.visibility${capitalize(texture.visibility)}`)} />
                <DetailLine label={t("skins.downloads")} value={Math.max(0, texture.downloads || 0).toLocaleString(locale)} />
                <DetailLine label={t("skins.createdAt")} value={formatDate(texture.createdAt, locale)} />
              </dl>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <a className="button-primary focus-ring text-center" download href={textureURL} target="_blank" rel="noopener noreferrer">{t("skins.download")}</a>
                {token ? <button className="button-secondary focus-ring" disabled={busy === "wardrobe"} type="button" onClick={() => void toggleWardrobe()}>{texture.inWardrobe ? t("skins.removeWardrobe") : t("skins.addWardrobe")}</button> : <Link className="button-secondary focus-ring text-center" href={`/login?next=/skins/${texture.publicId}`}>{t("skins.loginToUse")}</Link>}
              </div>
            </section>

            {token && profiles.length ? (
              <section className="surface rounded-lg p-5">
                <h2 className="font-black">{t("skins.applyToProfile")}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{t("skins.selectProfileHint")}</p>
                <select className="field mt-4" value={selectedProfile} onChange={(event) => setSelectedProfile(event.target.value)}>
                  {profiles.map((profile) => <option key={profile.publicId} value={profile.publicId}>{profile.name}</option>)}
                </select>
                <button className="button-primary focus-ring mt-3 w-full" disabled={!selectedProfile || busy === "apply" || (!texture.canUse && !texture.inWardrobe)} type="button" onClick={() => void applyTexture()}>{busy === "apply" ? t("skins.saving") : t("skins.apply")}</button>
              </section>
            ) : null}

            {texture.canEdit ? (
              <section className="surface rounded-lg p-5">
                <div className="flex items-center justify-between gap-3"><h2 className="font-black">{t("skins.manageTexture")}</h2><button className="text-sm font-bold text-[var(--accent)]" type="button" onClick={() => setEditing((value) => !value)}>{editing ? t("common.close") : t("common.edit")}</button></div>
                {editing ? <div className="mt-4 grid gap-3">
                  <label className="text-sm font-bold">{t("skins.name")}<input className="field mt-1" maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                  <label className="text-sm font-bold">{t("skins.description")}<textarea className="field mt-1 min-h-28" maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
                  <label className="text-sm font-bold">{t("skins.tags")}<input className="field mt-1" value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></label>
                  <label className="text-sm font-bold">{t("skins.visibility")}<select className="field mt-1" value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value as SkinVisibility })}><VisibilityOptions /></select></label>
                  {texture.kind === "skin" ? <label className="text-sm font-bold">{t("skins.model")}<select className="field mt-1" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value as "default" | "slim" })}><option value="default">{t("skins.modelDefault")}</option><option value="slim">{t("skins.modelSlim")}</option></select></label> : null}
                  <button className="button-primary focus-ring" disabled={busy === "save" || !draft.name.trim()} type="button" onClick={() => void saveMetadata()}>{busy === "save" ? t("skins.saving") : t("common.save")}</button>
                </div> : null}
                <button className="mt-4 text-sm font-bold text-[var(--red)] hover:underline" disabled={busy === "delete"} type="button" onClick={() => void removeTexture()}>{t("skins.deleteTexture")}</button>
              </section>
            ) : null}
          </aside>
        </div>
      </article>
    </main>
  );
}

function VisibilityOptions() {
  const { t } = useI18n();
  return <><option value="public">{t("skins.visibilityPublic")}</option><option value="unlisted">{t("skins.visibilityUnlisted")}</option><option value="private">{t("skins.visibilityPrivate")}</option></>;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const color = status === "approved" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : status === "rejected" ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return <span className={`rounded-md px-2 py-1 text-xs font-black ${color}`}>{t(`skins.review${capitalize(status)}`)}</span>;
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-[var(--muted)]">{label}</dt><dd className="text-right font-bold">{value}</dd></div>;
}

function StatePanel({ text }: { text: string }) {
  return <main className="grid min-h-[65vh] place-items-center px-4"><div className="surface w-full max-w-lg rounded-lg p-8 text-center font-bold text-[var(--muted)]">{text}</div></main>;
}

function parseTags(value: string) {
  return [...new Set(value.split(/[,，\n]/).map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 16);
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

function capitalize(value: string) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : "Pending";
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
