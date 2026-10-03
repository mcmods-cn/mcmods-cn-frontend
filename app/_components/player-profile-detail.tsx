"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { loadPlayerProfile, PlayerProfile, skinTextureURL } from "../_lib/skin-api";
import { SkinPreview2D } from "./skin-preview";
import { CommentSection } from "./comment-section";

const SkinViewerCanvas = dynamic(
  () => import("@/components/minecraft-skin/SkinViewerCanvas").then((module) => module.SkinViewerCanvas),
  { ssr: false },
);

export function PlayerProfileDetail({ publicId }: { publicId: string }) {
  const { token, user } = useAuthSnapshot();
  return <PlayerProfileDetailContent key={`${user?.id || "guest"}:${publicId}:${token}`} publicId={publicId} />;
}

function PlayerProfileDetailContent({ publicId }: { publicId: string }) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setLoading(true); });
    loadPlayerProfile(publicId, token || undefined)
      .then((result) => { if (!cancelled) { setProfile(result); setError(""); } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("skins.profileLoadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadAttempt, publicId, ready, t, token]);

  if (loading) return <ProfileState text={t("common.loading")} />;
  if (!profile) return <ProfileState text={error || t("skins.notFound")} action={error ? <button className="button-secondary focus-ring mt-4" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>{t("common.retry")}</button> : undefined} />;
  const ownerName = profile.owner?.username || t("skins.anonymous");
  const own = Boolean(user && profile.owner?.id === user.id);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <article className="mx-auto max-w-6xl px-4 py-8">
        {error ? <div className="mb-4"><p role="alert" className="text-sm text-[var(--red)]">{error}</p><button className="button-secondary focus-ring mt-2" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>{t("common.retry")}</button></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3"><Link className="text-sm font-black text-[var(--accent)]" href="/skins">← {t("skins.title")}</Link>{own ? <Link className="button-secondary focus-ring" href="/user?section=players">{t("skins.manageProfiles")}</Link> : null}</div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="surface overflow-hidden rounded-lg bg-[var(--panel-subtle)]">
            <SkinViewerCanvas capeUrl={skinTextureURL(profile.cape)} className="h-[640px]" model={profile.skin?.model || "default"} skinUrl={skinTextureURL(profile.skin)} />
          </section>
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="surface rounded-lg p-5">
              <p className="text-sm font-black text-[var(--accent)]">{t("skins.profileDetail")}</p>
              <h1 className="mt-1 break-words text-3xl font-black">{profile.name}</h1>
              <code className="mt-3 block break-all text-xs text-[var(--muted)]">{profile.publicId}</code>
              <dl className="mt-5 grid gap-3 border-y border-[var(--line)] py-4 text-sm">
                <InfoLine label={t("skins.uuid")} value={<code className="break-all text-xs">{profile.uuid}</code>} />
                <InfoLine label={t("skins.owner")} value={profile.owner?.id ? <Link className="text-[var(--accent)]" href={`/user/${profile.owner.id}`}>{ownerName}</Link> : ownerName} />
                <InfoLine label={t("skins.visibility")} value={t(`skins.visibility${capitalize(profile.visibility)}`)} />
                <InfoLine label={t("skins.createdAt")} value={formatDate(profile.createdAt, locale)} />
              </dl>
              {profile.bio ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--muted)]">{profile.bio}</p> : null}
            </section>
            <TextureCard label={t("skins.skinSlot")} texture={profile.skin} />
            <TextureCard label={t("skins.capeSlot")} texture={profile.cape} />
          </aside>
        </div>
        <CommentSection targetKey={publicId} targetType="player_profile" />
      </article>
    </main>
  );
}

function TextureCard({ label, texture }: { label: string; texture?: PlayerProfile["skin"] }) {
  const { t } = useI18n();
  return <section className="surface overflow-hidden rounded-lg"><div className="border-b border-[var(--line)] px-4 py-3 font-black">{label}</div>{texture ? <Link className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4 p-4 hover:bg-[var(--panel-subtle)]" href={`/skins/${texture.publicId}`}><SkinPreview2D className="h-28 w-[88px] rounded-md" kind={texture.kind} label={texture.name} model={texture.model} src={skinTextureURL(texture)} /><span className="min-w-0"><strong className="block truncate">{texture.name}</strong><code className="mt-1 block truncate text-xs text-[var(--muted)]">{texture.publicId}</code></span></Link> : <p className="p-5 text-sm text-[var(--muted)]">{t("skins.none")}</p>}</section>;
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid gap-1"><dt className="text-[var(--muted)]">{label}</dt><dd className="font-bold">{value}</dd></div>;
}

function ProfileState({ text, action }: { text: string; action?: React.ReactNode }) {
  return <main className="grid min-h-[65vh] place-items-center px-4"><div className="surface w-full max-w-lg rounded-lg p-8 text-center font-bold text-[var(--muted)]"><p>{text}</p>{action}</div></main>;
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

function capitalize(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
