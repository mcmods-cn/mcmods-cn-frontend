"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { loadPublicUserProfile, type PublicUserProfile } from "../_lib/user-api";
import { advanceUserNetworkCursor, rewindUserNetworkCursor, userNetworkPagePath } from "../_lib/user-network-pagination.mts";

type NetworkType = "followers" | "following" | "blocked";

type UserConnection = {
  id: string;
  username: string;
  avatarUrl: string;
  signature: string;
};

type UserConnectionsPayload = {
  items: UserConnection[];
  page?: number;
  pageSize?: number;
  total?: number;
  limit?: number;
  hasMore?: boolean;
  nextCursor?: string;
};

export function UserNetworkList({ network, userId }: { network: NetworkType; userId: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [payload, setPayload] = useState<UserConnectionsPayload | null>(null);
  const [page, setPage] = useState(1);
  const [cursorHistory, setCursorHistory] = useState<string[]>([""]);
  const [message, setMessage] = useState("");
  const currentCursor = cursorHistory[cursorHistory.length - 1] || "";
  const canLoadNetwork = profile !== null && (network !== "blocked" || profile.isOwn);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const nextProfile = await loadPublicUserProfile(userId, token || undefined);
        if (cancelled) return;
        setProfile(nextProfile);
        if (network === "blocked" && !nextProfile.isOwn) {
          setPayload(null);
          setMessage(t("user.blacklistPrivate"));
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("user.networkLoadFailed"));
      }
    })();
    return () => { cancelled = true; };
  }, [network, ready, t, token, userId]);

  useEffect(() => {
    if (!ready || !canLoadNetwork) return;
    let cancelled = false;
    void (async () => {
      try {
        const endpoint = network === "blocked"
          ? `/api/v1/users/me/blocks?page=${page}&pageSize=24`
          : userNetworkPagePath(userId, network, 24, currentCursor);
        const nextPayload = await apiRequest<UserConnectionsPayload>(endpoint, {}, token || undefined);
        if (cancelled) return;
        setPayload(nextPayload);
        setMessage("");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("user.networkLoadFailed"));
      }
    })();
    return () => { cancelled = true; };
  }, [canLoadNetwork, currentCursor, network, page, ready, t, token, userId]);

  async function unblockUser(item: UserConnection) {
    if (!token) return;
    try {
      await apiRequest<{ blocked: boolean }>(`/api/v1/users/${encodeURIComponent(item.id)}/block`, { method: "DELETE" }, token);
      setPayload((current) => current ? {
        ...current,
        items: current.items.filter((value) => value.id !== item.id),
        total: Math.max(0, (current.total || 0) - 1),
      } : current);
      setProfile((current) => current ? { ...current, blocked: Math.max(0, current.blocked - 1) } : current);
      setMessage(t("user.unblockSucceeded"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("user.unblockFailed"));
    }
  }

  const pages = useMemo(() => Math.max(1, Math.ceil((payload?.total || 0) / (payload?.pageSize || 24))), [payload]);
  const showPagination = Boolean(payload && (network === "blocked" ? pages > 1 : cursorHistory.length > 1 || payload.hasMore));
  const profileHref = `/user/${encodeURIComponent(userId)}`;
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="mx-auto grid max-w-5xl gap-4">
        <Link className="focus-ring w-fit font-bold text-[var(--accent)] hover:underline" href={profileHref}>← {t("user.backToProfile")}</Link>
        <section className="surface p-5 sm:p-6">
          <p className="text-sm font-bold text-[var(--accent)]">{profile?.username || t("common.loading")}</p>
          <h1 className="mt-1 text-2xl font-black">{t(networkTitleKey(network))}</h1>
          <nav className="mt-5 flex overflow-x-auto border-b border-[var(--line)]" aria-label={t("user.networkTabs")}>
            <NetworkTab active={network === "followers"} count={profile?.followers} href={`${profileHref}/followers`} label={t("user.followers")} />
            <NetworkTab active={network === "following"} count={profile?.following} href={`${profileHref}/following`} label={t("user.following")} />
            {profile?.isOwn ? <NetworkTab active={network === "blocked"} count={profile.blocked} href={`${profileHref}/blocked`} label={t("user.blocked")} /> : null}
          </nav>
          {message ? <p className="mt-5 rounded-lg border border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]">{message}</p> : !payload ? <p className="mt-5 text-sm text-[var(--muted)]">{t("common.loading")}</p> : payload.items.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {payload.items.map((item) => <UserConnectionCard item={item} key={item.id} onUnblock={network === "blocked" ? unblockUser : undefined} />)}
            </div>
          ) : <p className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">{t(networkEmptyKey(network))}</p>}
          {showPagination ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
              <button className="button-secondary focus-ring" disabled={network === "blocked" ? page <= 1 : cursorHistory.length <= 1} type="button" onClick={() => { setPayload(null); if (network === "blocked") setPage((value) => Math.max(1, value - 1)); else setCursorHistory(rewindUserNetworkCursor); }}>{t("common.previous")}</button>
              <span className="text-sm font-bold text-[var(--muted)]">{network === "blocked" ? t("user.networkPage", { page, pages }) : t("user.networkCursorPage", { page: cursorHistory.length })}</span>
              <button className="button-secondary focus-ring" disabled={network === "blocked" ? page >= pages : !payload?.hasMore} type="button" onClick={() => { setPayload(null); if (network === "blocked") setPage((value) => Math.min(pages, value + 1)); else setCursorHistory((history) => advanceUserNetworkCursor(history, payload?.nextCursor || "")); }}>{t("common.next")}</button>
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

function UserConnectionCard({ item, onUnblock }: { item: UserConnection; onUnblock?: (item: UserConnection) => void }) {
  const { t } = useI18n();
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] p-4 transition hover:border-[var(--accent)]">
      <Link className="focus-ring flex min-w-0 flex-1 items-center gap-4" href={`/user/${encodeURIComponent(item.id)}`}>
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
      {onUnblock ? <button className="button-secondary focus-ring shrink-0" type="button" onClick={() => onUnblock(item)}>{t("user.unblock")}</button> : null}
    </article>
  );
}

function networkTitleKey(network: NetworkType) {
  if (network === "followers") return "user.followersTitle";
  if (network === "following") return "user.followingTitle";
  return "user.blockedTitle";
}

function networkEmptyKey(network: NetworkType) {
  if (network === "followers") return "user.noFollowers";
  if (network === "following") return "user.noFollowing";
  return "user.noBlocked";
}
