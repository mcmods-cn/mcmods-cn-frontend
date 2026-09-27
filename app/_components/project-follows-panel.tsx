"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FollowedProject, loadFollowedProjects, setProjectFollowNotifications, unfollowProject } from "../_lib/project-follow-api";
import { mergeFollowedProjectPage } from "../_lib/project-follow-pagination";
import { useI18n } from "../_lib/i18n-provider";

export function ProjectFollowsPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<FollowedProject[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor = "") => {
    const append = Boolean(cursor);
    const generation = ++requestGeneration.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setItems([]);
      setNextCursor("");
    }
    try {
      const result = await loadFollowedProjects(token, query, type, cursor, controller.signal);
      if (requestGeneration.current !== generation) return;
      setItems((current) => append ? mergeFollowedProjectPage(current, result.items) : result.items);
      setNextCursor(result.hasMore ? result.nextCursor : "");
      setError("");
    } catch (reason) {
      if (requestGeneration.current !== generation || (reason as { name?: string }).name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : t("projectFollows.loadFailed"));
    } finally {
      if (requestGeneration.current === generation) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [query, t, token, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => {
      window.clearTimeout(timer);
      requestGeneration.current += 1;
      requestController.current?.abort();
    };
  }, [load]);

  async function updateNotifications(item: FollowedProject, notificationsEnabled: boolean) {
    setSavingId(item.id);
    setError("");
    try {
      const result = await setProjectFollowNotifications(token, item.id, notificationsEnabled);
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, notificationsEnabled: result.notificationsEnabled }
        : entry));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("projectFollows.saveFailed"));
    } finally {
      setSavingId("");
    }
  }

  return <section className="surface p-5 sm:p-6">
    <h2 className="text-xl font-black">{t("projectFollows.title")}</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">{t("projectFollows.description")}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
      <input className="field" value={query} onChange={(event) => { setLoading(true); setQuery(event.target.value); }} placeholder={t("projectFollows.search")} />
      <select className="field" value={type} onChange={(event) => { setLoading(true); setType(event.target.value); }}>
        <option value="">{t("projectFollows.allTypes")}</option>
        {["mod", "modpack", "plugin", "map", "resource_pack", "shader_pack", "datapack", "addon", "minecraft_server", "community_post", "blueprint", "skin"].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
    {error ? <p className="mt-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-3 font-bold text-[var(--danger)]" role="alert">{error}</p> : null}
    {loading ? <p className="py-10 text-center text-[var(--muted)]">{t("common.loading")}</p> : items.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {items.map((item) => <article className="rounded-lg border border-[var(--line)] p-4" key={`${item.type}:${item.id}`}>
        {item.unavailable
          ? <span className="font-black text-[var(--muted)]">{t("projectFollows.unavailable")}</span>
          : <Link className="font-black hover:text-[var(--accent)]" href={item.url}>{item.name}</Link>}
        <p className="mt-1 text-xs text-[var(--muted)]">{item.type}{item.unavailable ? null : ` · ${new Date(item.updatedAt).toLocaleString(locale)}`}</p>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold">
          <input
            checked={item.notificationsEnabled}
            disabled={savingId === item.id}
            type="checkbox"
            onChange={(event) => void updateNotifications(item, event.target.checked)}
          />
          {t("projectFollows.notifications")}
        </label>
        <button className="focus-ring mt-3 rounded px-2 py-1 text-sm font-bold text-[var(--danger)]" type="button" onClick={async () => {
          await unfollowProject(token, item.id);
          setItems((current) => current.filter((entry) => entry.id !== item.id));
        }}>{t("projectFollows.unfollow")}</button>
      </article>)}
    </div> : <p className="py-10 text-center text-[var(--muted)]">{t("projectFollows.empty")}</p>}
    {nextCursor && !loading ? <button className="button-secondary focus-ring mt-5 w-full" disabled={loadingMore} type="button" onClick={() => void load(nextCursor)}>{loadingMore ? t("common.loading") : t("projectFollows.loadMore")}</button> : null}
  </section>;
}
