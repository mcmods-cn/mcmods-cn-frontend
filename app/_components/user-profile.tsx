"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { loadPublicPlayerProfiles, PlayerProfile, skinTextureURL } from "../_lib/skin-api";
import { UserHome } from "./user-home";
import { SkinPreview2D } from "./skin-preview";

type PublicUserProfile = {
  id: string;
  username: string;
  status: string;
  createdAt: string;
  followers: number;
  following: number;
  isOwn: boolean;
  isFollowing: boolean;
  canFollow: boolean;
  canMessage: boolean;
  avatarUrl: string;
  signature: string;
  profileBackgroundUrl: string;
};

export function UserProfile({ userId }: { userId: string }) {
  const { t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "1";
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [playerProfiles, setPlayerProfiles] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      Promise.allSettled([
        apiRequest<PublicUserProfile>(`/api/v1/users/${userId}/profile`, {}, token || undefined),
        loadPublicPlayerProfiles(userId, token || undefined),
      ]).then(([profileResult, playersResult]) => {
        if (profileResult.status === "fulfilled") {
          setProfile(profileResult.value);
          setMessage("");
        } else {
          setMessage(profileResult.reason instanceof Error ? profileResult.reason.message : t("user.profileLoadFailed"));
        }
        if (playersResult.status === "fulfilled") setPlayerProfiles(playersResult.value);
      }).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, t, token, userId]);

  async function toggleFollow() {
    if (!token || !profile) return;
    try {
      const result = await apiRequest<{ following: boolean }>(
        `/api/v1/users/${profile.id}/follow`,
        { method: profile.isFollowing ? "DELETE" : "POST" },
        token,
      );
      setProfile({
        ...profile,
        isFollowing: result.following,
        followers: Math.max(0, profile.followers + (result.following ? 1 : -1)),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.followFailed"));
    }
  }

  if (loading) {
    return <ProfileState text={t("common.loading")} />;
  }
  if (!profile) {
    return <ProfileState text={message || t("user.profileLoadFailed")} />;
  }
  if (profile.isOwn && !preview) {
    return <UserHome />;
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-8">
        <div
          className="surface relative overflow-hidden p-6"
          style={profile.profileBackgroundUrl ? {
            backgroundImage: `url("${profile.profileBackgroundUrl.replaceAll('"', "%22")}")`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          } : undefined}
        >
          {profile.profileBackgroundUrl ? (
            <div className="absolute inset-0 bg-[var(--background)] opacity-80" aria-hidden="true" />
          ) : null}
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="flex w-full min-w-0 items-center gap-4 sm:w-auto sm:flex-1">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent)] text-3xl font-black text-white">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="h-full w-full object-cover" src={profile.avatarUrl} />
              ) : profile.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--accent)]">{preview ? t("user.previewMode") : t("user.publicProfile")}</p>
              <h1 className="truncate text-2xl font-black">{profile.username}</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">ID {profile.id}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">{t("user.joinedAt", { time: new Date(profile.createdAt).toLocaleDateString() })}</p>
                {profile.signature ? <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6">{profile.signature}</p> : null}
              </div>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              {preview ? (
                <Link className="button-primary focus-ring" href={`/user/${profile.id}`}>
                  {t("user.exitPreview")}
                </Link>
              ) : user ? (
                <>
                  <button className="button-primary focus-ring" disabled={!profile.canFollow && !profile.isFollowing} type="button" onClick={() => void toggleFollow()}>
                    {profile.isFollowing ? t("user.unfollow") : t("user.follow")}
                  </button>
                  <Link className={`button-secondary focus-ring ${profile.canMessage ? "" : "pointer-events-none opacity-50"}`} href={`/messages?user=${profile.id}`}>
                    {t("user.privateMessage")}
                  </Link>
                </>
              ) : (
                <Link className="button-primary focus-ring w-full justify-center sm:w-auto" href={`/login?next=/user/${profile.id}`}>
                  {t("user.loginToInteract")}
                </Link>
              )}
            </div>
          </div>
          {message ? <p className="relative z-10 mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2 text-sm">{message}</p> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="surface p-5">
            <div className="text-sm font-semibold text-[var(--muted)]">{t("user.followers")}</div>
            <div className="mt-1 text-3xl font-black">{profile.followers}</div>
          </div>
          <div className="surface p-5">
            <div className="text-sm font-semibold text-[var(--muted)]">{t("user.following")}</div>
            <div className="mt-1 text-3xl font-black">{profile.following}</div>
          </div>
        </div>

        <section className="surface p-5">
          <h2 className="text-xl font-black">{t("skins.publicPlayerProfiles")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("skins.publicPlayerProfilesDescription")}</p>
          {playerProfiles.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{playerProfiles.map((item) => <PublicPlayerCard key={item.publicId} profile={item} />)}</div> : <p className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">{t("skins.noPublicProfiles")}</p>}
        </section>
      </section>
    </main>
  );
}

function PublicPlayerCard({ profile }: { profile: PlayerProfile }) {
  const { t } = useI18n();
  return <Link className="focus-ring grid grid-cols-[86px_minmax(0,1fr)] items-center gap-4 overflow-hidden rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]" href={`/players/${profile.publicId}`}><SkinPreview2D className="h-28 w-[86px] rounded-md" kind="skin" label={profile.name} model={profile.skin?.model || "default"} src={skinTextureURL(profile.skin)} /><span className="min-w-0"><strong className="block truncate text-lg">{profile.name}</strong><code className="mt-1 block truncate text-[10px] text-[var(--muted)]">{profile.uuid}</code>{profile.isDefault ? <span className="mt-2 inline-block rounded-md bg-[var(--accent)] px-2 py-1 text-[10px] font-bold text-white">{t("skins.defaultProfile")}</span> : null}</span></Link>;
}

function ProfileState({ text }: { text: string }) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4">
      <div className="surface w-full max-w-lg p-6 text-center text-sm text-[var(--muted)]">{text}</div>
    </main>
  );
}
