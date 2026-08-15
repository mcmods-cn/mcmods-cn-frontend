"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { loadPublicUserProfile, type PublicUserProfile } from "../_lib/user-api";

type NetworkType = "followers" | "following";

type UserConnection = {
  id: string;
  username: string;
  avatarUrl: string;
  signature: string;
};

type UserConnectionsPayload = {
  items: UserConnection[];
  page: number;
  pageSize: number;
  total: number;
};

export function UserNetworkList({ network, userId }: { network: NetworkType; userId: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [payload, setPayload] = useState<UserConnectionsPayload | null>(null);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void Promise.all([
      loadPublicUserProfile(userId, token || undefined),
      apiRequest<UserConnectionsPayload>(`/api/v1/users/${userId}/${network}?page=${page}&pageSize=24`, {}, token || undefined),
    ]).then(([nextProfile, nextPayload]) => {
      if (cancelled) return;
      setProfile(nextProfile);
      setPayload(nextPayload);
      setMessage("");
    }).catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : t("user.networkLoadFailed"));
    });
    return () => { cancelled = true; };
  }, [network, page, ready, t, token, userId]);

  const pages = useMemo(() => Math.max(1, Math.ceil((payload?.total || 0) / (payload?.pageSize || 24))), [payload]);
  const profileHref = `/user/${encodeURIComponent(userId)}`;
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="mx-auto grid max-w-5xl gap-4">
        <Link className="focus-ring w-fit font-bold text-[var(--accent)] hover:underline" href={profileHref}>← {t("user.backToProfile")}</Link>
        <section className="surface p-5 sm:p-6">
          <p className="text-sm font-bold text-[var(--accent)]">{profile?.username || t("common.loading")}</p>
          <h1 className="mt-1 text-2xl font-black">{t(network === "followers" ? "user.followersTitle" : "user.followingTitle")}</h1>
          <nav className="mt-5 flex overflow-x-auto border-b border-[var(--line)]" aria-label={t("user.networkTabs")}>
            <NetworkTab active={network === "followers"} count={profile?.followers} href={`${profileHref}/followers`} label={t("user.followers")} />
            <NetworkTab active={network === "following"} count={profile?.following} href={`${profileHref}/following`} label={t("user.following")} />
          </nav>
          {message ? <p className="mt-5 rounded-lg border border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]">{message}</p> : !payload ? <p className="mt-5 text-sm text-[var(--muted)]">{t("common.loading")}</p> : payload.items.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {payload.items.map((item) => <UserConnectionCard item={item} key={item.id} />)}
            </div>
          ) : <p className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">{t(network === "followers" ? "user.noFollowers" : "user.noFollowing")}</p>}
          {payload && pages > 1 ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
              <button className="button-secondary focus-ring" disabled={page <= 1} type="button" onClick={() => { setPayload(null); setPage((value) => Math.max(1, value - 1)); }}>{t("common.previous")}</button>
              <span className="text-sm font-bold text-[var(--muted)]">{t("user.networkPage", { page, pages })}</span>
              <button className="button-secondary focus-ring" disabled={page >= pages} type="button" onClick={() => { setPayload(null); setPage((value) => Math.min(pages, value + 1)); }}>{t("common.next")}</button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function NetworkTab({ active, count, href, label }: { active: boolean; count?: number; href: string; label: string }) {
  return <Link className={`focus-ring whitespace-nowrap border-b-2 px-5 py-3 font-black ${active ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`} href={href}>{label} {count ?? "-"}</Link>;
}

function UserConnectionCard({ item }: { item: UserConnection }) {
  return (
    <Link className="focus-ring flex min-w-0 items-center gap-4 rounded-lg border border-[var(--line)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]" href={`/user/${encodeURIComponent(item.id)}`}>
      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent)] text-xl font-black text-white">
        {item.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="h-full w-full object-cover" src={item.avatarUrl} />
        ) : item.username.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-lg">{item.username}</strong>
        <small className="mt-1 block truncate text-[var(--muted)]">ID {item.id}</small>
        {item.signature ? <span className="mt-2 line-clamp-2 block text-sm leading-6 text-[var(--muted)]">{item.signature}</span> : null}
      </span>
    </Link>
  );
}
