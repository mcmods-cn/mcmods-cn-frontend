"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { localizedSimpleProject, simpleProjectConfig, type SimpleProjectList, type SimpleProjectRecord, type SimpleProjectType } from "../_lib/simple-project-api";

export function SimpleProjectCatalog({ projectType }: { projectType: SimpleProjectType }) {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const config = simpleProjectConfig(projectType);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [loader, setLoader] = useState("");
  const [version, setVersion] = useState("");
  const [items, setItems] = useState<SimpleProjectRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const parameters = new URLSearchParams({ limit: "100" });
    if (query) parameters.set("q", query);
    if (category) parameters.set("category", category);
    if (loader) parameters.set("loader", loader);
    if (version) parameters.set("version", version);
    try {
      const result = await apiRequest<SimpleProjectList>(`/api/v1/content-projects/${projectType}?${parameters}`, {}, token);
      setItems(result.items);
      setTotal(result.total);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("largeProjects.catalog.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [category, loader, projectType, query, ready, t, token, version]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);
  const versions = useMemo(() => [...new Set(items.flatMap((item) => item.minecraftVersions))].sort().reverse(), [items]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setQuery(queryInput.trim());
  }

  function clearFilters() {
    setQueryInput("");
    setQuery("");
    setCategory("");
    setLoader("");
    setVersion("");
  }

  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)] lg:px-6"><div className="mx-auto max-w-[1500px]">
    <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--line)] pb-6">
      <div><p className="text-sm font-black text-[var(--accent)]">{t("largeProjects.kicker")}</p><h1 className="mt-1 text-3xl font-black md:text-4xl">{t(`largeProjects.types.${projectType}`)}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t(`largeProjects.descriptions.${projectType}`)}</p></div>
      <Link className="button-primary focus-ring" href={`${config.path}/new`}>+ {t("largeProjects.catalog.create")}</Link>
    </header>
    <form className="mt-6 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submitSearch}><input className="field" placeholder={t("largeProjects.catalog.searchPlaceholder")} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} /><button className="button-primary focus-ring" type="submit">{t("common.search")}</button></form>
    <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:sticky lg:top-20">
        <FilterSelect label={t("largeProjects.fields.minecraftVersions")} options={versions} value={version} onChange={setVersion} />
        {config.loaders.length ? <FilterSelect label={t("largeProjects.fields.loaders")} options={config.loaders} value={loader} onChange={setLoader} labelFor={(value) => t(`largeProjects.options.${value}`)} /> : null}
        {config.categories.length ? <FilterSelect label={t("largeProjects.fields.categories")} options={config.categories} value={category} onChange={setCategory} labelFor={(value) => t(`largeProjects.options.${value}`)} /> : null}
        <button className="m-4 button-secondary focus-ring w-[calc(100%-2rem)]" type="button" onClick={clearFilters}>{t("common.clear")}</button>
      </aside>
      <section>
        <div className="mb-4 flex items-center justify-between gap-3"><strong>{t("largeProjects.catalog.total", { count: total })}</strong>{loading ? <span className="text-sm text-[var(--muted)]">{t("common.loading")}</span> : null}</div>
        {message ? <p className="rounded-xl border border-[var(--red)] p-4 font-bold text-[var(--red)]">{message}</p> : null}
        {!loading && !message && !items.length ? <div className="grid min-h-80 place-items-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] p-8 text-center"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-xl bg-[var(--panel-subtle)] text-2xl font-black">0</div><h2 className="mt-5 text-2xl font-black">{t("largeProjects.catalog.empty")}</h2><p className="mt-2 text-[var(--muted)]">{t("largeProjects.catalog.emptyHint")}</p><button className="button-primary focus-ring mt-5" type="button" onClick={clearFilters}>{t("common.clear")}</button></div></div> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <ProjectCard item={item} locale={locale} path={config.path} key={item.id} />)}</div>
      </section>
    </div>
  </div></main>;
}

function ProjectCard({ item, locale, path }: { item: SimpleProjectRecord; locale: string; path: string }) {
  const { t } = useI18n();
  const localization = localizedSimpleProject(item, locale);
  const name = localization.name || item.siteId;
  return <Link className="group min-w-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg" href={`${path}/${item.siteId}`}>
    <div className="flex gap-4"><ProjectIcon icon={item.iconUrl} name={name} /><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-black group-hover:text-[var(--accent)]">{name}</h2><code className="mt-1 block truncate text-xs text-[var(--muted)]">{item.siteId}</code><p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--muted)]">{localization.summary || t("largeProjects.catalog.noSummary")}</p></div></div>
    <div className="mt-4 flex flex-wrap gap-2">{item.minecraftVersions.slice(0, 3).map((value) => <Badge key={value}>{value}</Badge>)}{item.loaders.slice(0, 2).map((value) => <Badge key={value}>{t(`largeProjects.options.${value}`)}</Badge>)}</div>
  </Link>;
}

function ProjectIcon({ icon, name }: { icon: string; name: string }) {
  return icon ? <Image unoptimized alt="" className="h-16 w-16 shrink-0 rounded-lg border border-[var(--line)] object-contain" height={64} src={icon} width={64} /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-lg font-black text-[var(--accent)]">{[...name].slice(0, 2).join("")}</span>;
}

function FilterSelect({ label, options, value, labelFor = (item) => item, onChange }: { label: string; options: readonly string[]; value: string; labelFor?: (value: string) => string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  return <label className="block border-b border-[var(--line)] p-4 text-sm font-black">{label}<select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t("common.all")}</option>{options.map((option) => <option key={option} value={option}>{labelFor(option)}</option>)}</select></label>;
}

function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold text-[var(--muted)]">{children}</span>; }
