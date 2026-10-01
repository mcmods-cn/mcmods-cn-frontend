"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FollowedProject, loadFollowedProjects, unfollowProject } from "../_lib/project-follow-api";
import { useI18n } from "../_lib/i18n-provider";

export function ProjectFollowsPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<FollowedProject[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      loadFollowedProjects(token, query, type)
        .then((result) => { if (!cancelled) { setItems(result.items); setError(""); } })
        .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("projectFollows.loadFailed")); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, t, token, type]);

  async function removeProject(id: string) {
    if (removing.includes(id)) return;
    setRemoving((current) => [...current, id]);
    setError("");
    try {
      await unfollowProject(token, id);
      setItems((current) => current.filter((entry) => entry.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("projectFollows.loadFailed"));
    } finally {
      setRemoving((current) => current.filter((value) => value !== id));
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
        <Link className="font-black hover:text-[var(--accent)]" href={item.url}>{item.name}</Link>
        <p className="mt-1 text-xs text-[var(--muted)]">{item.type} · {new Date(item.updatedAt).toLocaleString(locale)}</p>
        <button className="focus-ring mt-3 rounded px-2 py-1 text-sm font-bold text-[var(--danger)]" disabled={removing.includes(item.id)} type="button" onClick={() => void removeProject(item.id)}>{t("projectFollows.unfollow")}</button>
      </article>)}
    </div> : <p className="py-10 text-center text-[var(--muted)]">{t("projectFollows.empty")}</p>}
  </section>;
}
