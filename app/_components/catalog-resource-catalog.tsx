"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { localizedCatalogResourceName, resolveAvailableLocalization } from "../_lib/content-language";
import { catalogResourceKindCodes, loadCatalogResourceForEditing, loadGlobalResourceBindings, type GlobalResourceBinding } from "../_lib/catalog-resource-api";
import { catalogResourceIconURL, loadCatalogResources } from "../_lib/editor-api";
import type { CatalogResourcePage, CatalogResourceRef, LocalizedContentFields, LocalizationVersion } from "../_lib/editor-types";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { ContentTranslationControl } from "./editor/content-translation-control";
import { LocalizationStatusBadge } from "./editor/localization-status-badge";
import { MarkdownRenderer } from "./markdown-renderer";

const pageSize = 36;

export function CatalogResourceCatalog({ basePath = "/admin/global-resources" }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const publicId = searchParams.get("publicId") ?? "";
  if (publicId) return <CatalogResourceDetail basePath={basePath} publicId={publicId} />;
  return <CatalogResourceList basePath={basePath} />;
}

function CatalogResourceDetail({ basePath, publicId }: { basePath: string; publicId: string }) {
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadCatalogResourceForEditing>>>();
  const [resolvedLocalization, setResolvedLocalization] = useState<LocalizationVersion<LocalizedContentFields>>();
  const [error, setError] = useState("");
  const [bindings, setBindings] = useState<GlobalResourceBinding[]>([]);
  const [bindingTotal, setBindingTotal] = useState(0);
  const [bindingQueryInput, setBindingQueryInput] = useState("");
  const [bindingQuery, setBindingQuery] = useState("");
  const [bindingStatus, setBindingStatus] = useState("");
  const [bindingOffset, setBindingOffset] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    loadCatalogResourceForEditing(publicId, token).then((value) => {
      if (!cancelled) { setDetail(value); setError(""); }
    }).catch((reason: unknown) => {
      if (!cancelled && !(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason));
    });
    return () => { cancelled = true; controller.abort(); };
  }, [publicId, token]);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    loadGlobalResourceBindings(publicId, token, { query: bindingQuery, status: bindingStatus, limit: 50, offset: bindingOffset }, controller.signal)
      .then((value) => { setBindings(value.items); setBindingTotal(value.total); })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason));
      });
    return () => controller.abort();
  }, [bindingOffset, bindingQuery, bindingStatus, publicId, token]);
  if (!detail) return <CatalogResourceFrame><div className="grid min-h-72 place-items-center">{error || t("common.loading")}</div></CatalogResourceFrame>;
  const fallback = resolveAvailableLocalization(detail.localizations, locale, "", detail.defaultLocale);
  const localization = resolvedLocalization ?? fallback;
  const iconURL = catalogResourceIconURL(detail.iconUrl);
  const renderURL = catalogResourceIconURL(detail.renderUrl);
  return <CatalogResourceFrame>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
      <Link className="font-bold text-[var(--accent)] hover:underline" href={basePath}>{t("resourceEditor.back")}</Link>
    </div>
    <article className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-lg bg-[var(--panel-subtle)]">
            {iconURL ? <Image unoptimized alt="" className="object-contain [image-rendering:pixelated]" fill sizes="80px" src={iconURL} /> : <strong className="text-xs text-[var(--muted)]">{detail.kindCode.slice(0, 3).toUpperCase()}</strong>}
          </div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="break-all text-3xl font-black">{localization?.fields.name || detail.canonicalId}</h1>{localization ? <LocalizationStatusBadge version={localization} /> : null}</div><code className="mt-1 block break-all text-sm text-[var(--muted)]">{detail.canonicalId}</code><span className="mt-2 block text-xs font-bold text-[var(--muted)]">{detail.kindCode}</span></div>
        </div>
        <ContentTranslationControl publicId={publicId} onResolved={setResolvedLocalization} />
        {localization?.fields.summary ? <p className="mt-5 text-base leading-7 text-[var(--muted)]">{localization.fields.summary}</p> : null}
        {localization?.fields.contentMarkdown ? <div className="markdown-preview mt-5"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={localization.fields.contentMarkdown} /></div> : null}
        <section className="mt-7"><h2 className="text-xl font-black">{t("catalogEditor.definition")}</h2><pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4 text-xs">{JSON.stringify(detail.definition, null, 2)}</pre></section>
        <section className="mt-7">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-xl font-black">绑定的普通资源</h2><p className="mt-1 text-sm text-[var(--muted)]">共 {bindingTotal} 条绑定，仅具备技术关系查看权限的管理员可见。</p></div></div>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setBindingOffset(0); setBindingQuery(bindingQueryInput.trim()); }}><input className="field min-w-56 flex-1" placeholder="搜索所属模组或资料版本" type="search" value={bindingQueryInput} onChange={(event) => setBindingQueryInput(event.target.value)} /><select className="field min-w-36" value={bindingStatus} onChange={(event) => { setBindingStatus(event.target.value); setBindingOffset(0); }}><option value="">全部状态</option><option value="active">有效</option><option value="pending">待审核</option><option value="archived">已归档</option></select><button className="button-secondary" type="submit">筛选</button></form>
          {bindings.length ? <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--panel-subtle)]"><tr><th className="p-3">资源</th><th className="p-3">所属模组</th><th className="p-3">资料版本</th><th className="p-3">Minecraft 版本</th><th className="p-3">状态</th></tr></thead><tbody>{bindings.map((binding) => <tr className="border-t border-[var(--line)]" key={`${binding.projectId}:${binding.versionId}`}><td className="p-3 font-bold">{binding.resourceName || detail.canonicalId}</td><td className="p-3"><Link className="text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(binding.projectSiteId || binding.projectId)}`}>{binding.projectName || binding.projectId}</Link></td><td className="p-3">{binding.versionLabel}</td><td className="p-3">{binding.minecraftVersions.join(" / ") || "-"}</td><td className="p-3">{binding.status}</td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">未绑定普通资源</p>}
          {bindingTotal > 50 ? <div className="mt-3 flex items-center justify-end gap-2"><button className="button-secondary" disabled={bindingOffset === 0} type="button" onClick={() => setBindingOffset(Math.max(0, bindingOffset - 50))}>上一页</button><span className="text-sm font-bold text-[var(--muted)]">{Math.floor(bindingOffset / 50) + 1} / {Math.ceil(bindingTotal / 50)}</span><button className="button-secondary" disabled={bindingOffset + 50 >= bindingTotal} type="button" onClick={() => setBindingOffset(bindingOffset + 50)}>下一页</button></div> : null}
        </section>
      </div>
      <aside>{renderURL ? <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)]"><Image unoptimized alt="" className="object-contain [image-rendering:pixelated]" fill sizes="360px" src={renderURL} /></div> : null}</aside>
    </article>
  </CatalogResourceFrame>;
}

function CatalogResourceList({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useI18n();
  const { token } = useAuthSnapshot();
  const page = positivePage(searchParams.get("page"));
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [kind, setKind] = useState(searchParams.get("kind") ?? "");
  const [registry, setRegistry] = useState(searchParams.get("registry") ?? "");
  const [status, setStatus] = useState<"active" | "pending" | "archived">(resourceStatus(searchParams.get("status")));
  const [hasBindings, setHasBindings] = useState<"" | "true" | "false">(bindingFilter(searchParams.get("hasBindings")));
  const [result, setResult] = useState<CatalogResourcePage>({ items: [], total: 0, limit: pageSize, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    loadCatalogResources({
      query: searchParams.get("q") ?? "",
      kind: searchParams.get("kind") ?? "",
      registry: searchParams.get("registry") ?? "",
      status: resourceStatus(searchParams.get("status")),
      hasBindings: bindingFilter(searchParams.get("hasBindings")),
      admin: true,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }, token, controller.signal).then((value) => {
      if (!cancelled) { setResult(value); setError(""); }
    }).catch((reason: unknown) => {
      if (!cancelled && !(reason instanceof DOMException && reason.name === "AbortError")) setError(errorText(reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [page, searchParams, token]);

  function search(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (kind.trim()) next.set("kind", kind.trim());
    if (registry.trim()) next.set("registry", registry.trim());
    if (status !== "active") next.set("status", status);
    if (hasBindings) next.set("hasBindings", hasBindings);
    router.push(`${basePath}${next.size ? `?${next}` : ""}`);
  }

  return <CatalogResourceFrame>
    <div className="mt-5 flex flex-wrap items-end gap-3">
      <form className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_160px_140px_150px_auto]" onSubmit={search}>
        <label className="grid gap-1.5 text-sm font-bold">
          <span>{t("resourceEditor.search")}</span>
          <input className="field" placeholder={t("resourceEditor.searchPlaceholder")} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-bold"><span>状态</span><select className="field" value={status} onChange={(event) => setStatus(resourceStatus(event.target.value))}><option value="active">有效</option><option value="pending">待审核</option><option value="archived">已归档</option></select></label>
        <label className="grid gap-1.5 text-sm font-bold"><span>绑定关系</span><select className="field" value={hasBindings} onChange={(event) => setHasBindings(bindingFilter(event.target.value))}><option value="">全部</option><option value="true">已有绑定</option><option value="false">尚未绑定</option></select></label>
        <label className="grid gap-1.5 text-sm font-bold">
          <span>{t("resourceEditor.kind")}</span>
          <input className="field font-mono" list="catalog-directory-kinds" placeholder={t("resourceEditor.allKinds")} value={kind} onChange={(event) => setKind(event.target.value)} />
          <datalist id="catalog-directory-kinds">{catalogResourceKindCodes.map((value) => <option key={value} value={value} />)}</datalist>
        </label>
        <label className="grid gap-1.5 text-sm font-bold">
          <span>{t("catalogEditor.registry")}</span>
          <input className="field font-mono" placeholder={t("resourceEditor.allRegistries")} value={registry} onChange={(event) => setRegistry(event.target.value)} />
        </label>
        <button className="button-primary focus-ring h-11 self-end" type="submit">{t("globalCatalog.searchAction")}</button>
      </form>
    </div>
    {error ? <p className="mt-4 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]" role="alert">{error}</p> : null}
    {loading ? <div className="grid min-h-72 place-items-center font-bold text-[var(--muted)]">{t("common.loading")}</div> : result.items.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {result.items.map((resource) => <ResourceCard basePath={basePath} key={resource.publicId} locale={locale} resource={resource} />)}
    </div> : <div className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-12 text-center text-[var(--muted)]">{t("resourceEditor.empty")}</div>}
    <Pagination basePath={basePath} page={page} searchParams={searchParams} total={result.total} />
  </CatalogResourceFrame>;
}

function ResourceCard({ basePath, resource, locale }: { basePath: string; resource: CatalogResourceRef; locale: string }) {
  const { t } = useI18n();
  const name = localizedCatalogResourceName(resource, locale);
  const iconURL = catalogResourceIconURL(resource.iconUrl);
  return <article className="flex min-h-28 items-center gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
    <Link className="contents" href={`${basePath}?publicId=${encodeURIComponent(resource.publicId)}`}>
    <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--panel-subtle)]">
      {iconURL ? <Image unoptimized alt="" className="object-contain [image-rendering:pixelated]" fill sizes="64px" src={iconURL} /> : <strong className="text-xs text-[var(--muted)]">{resource.kind.slice(0, 3).toUpperCase()}</strong>}
    </div>
    <div className="min-w-0 flex-1">
      <strong className="block truncate text-lg">{name}</strong>
      <code className="mt-1 block truncate text-xs text-[var(--muted)]">{resource.id}</code>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--muted)]">
        <span>{resource.kind}</span>
        {resource.source?.siteId ? <span>{resource.source.name || resource.source.siteId}</span> : <span>{t("resourceEditor.globalResource")}</span>}
        <span>{resource.bindingCount ?? 0} 个绑定</span>
      </div>
    </div></Link>
  </article>;
}

function CatalogResourceFrame({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]">
    <div className="mx-auto max-w-[1600px]">
      <header className="border-b border-[var(--line)] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--accent)]">{t("globalCatalog.kicker")}</p>
            <h1 className="mt-1 text-3xl font-black">{t("resourceEditor.catalogTitle")}</h1>
            <p className="mt-2 max-w-3xl text-[var(--muted)]">{t("resourceEditor.catalogDescription")}</p>
          </div>
          <nav className="flex flex-wrap rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1">
            <Link className="rounded-md px-4 py-2 font-bold" href="/mods-tag">{t("globalCatalog.tags.short")}</Link>
            <Link className="rounded-md px-4 py-2 font-bold" href="/recipe-types">{t("globalCatalog.recipeTypes.short")}</Link>
            <Link className="rounded-md bg-[var(--accent)] px-4 py-2 font-bold text-[var(--on-accent)]" href="/admin/global-resources">{t("resourceEditor.catalogShort")}</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  </main>;
}

function Pagination({ basePath, page, total, searchParams }: { basePath: string; page: number; total: number; searchParams: { toString: () => string } }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (nextPage: number) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(nextPage));
    return `${basePath}?${next}`;
  };
  return <nav className="mt-7 flex items-center justify-center gap-3">
    <Link className={`button-secondary focus-ring ${page <= 1 ? "pointer-events-none opacity-40" : ""}`} href={href(Math.max(1, page - 1))}>{t("globalCatalog.previous")}</Link>
    <span className="text-sm font-bold text-[var(--muted)]">{page} / {pages}</span>
    <Link className={`button-secondary focus-ring ${page >= pages ? "pointer-events-none opacity-40" : ""}`} href={href(Math.min(pages, page + 1))}>{t("globalCatalog.next")}</Link>
  </nav>;
}

function positivePage(value: string | null) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function resourceStatus(value: string | null): "active" | "pending" | "archived" {
  return value === "pending" || value === "archived" ? value : "active";
}

function bindingFilter(value: string | null): "" | "true" | "false" {
  return value === "true" || value === "false" ? value : "";
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
