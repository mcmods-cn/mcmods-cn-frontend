"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { IconFont } from "./iconfont";

type ComparisonOption = { kind: "me" | "role"; code: string; name: string };
type EffectivePermission = { code: string; allow: boolean; priority: number; source: string };
type ComparisonSubject = { kind: "me" | "role"; code: string; name: string; groups: string[]; permissions: EffectivePermission[] };
type LocalizedPermissionText = { name?: string; description?: string };
type ComparisonRow = { code: string; name: string; description: string; translations?: Record<string, LocalizedPermissionText>; left?: EffectivePermission; right?: EffectivePermission };
type ComparisonResult = { left: ComparisonSubject; right: ComparisonSubject; rows: ComparisonRow[] };
type DifferenceFilter = "all" | "different" | "left-only" | "right-only" | "same";

export function PermissionComparison() {
  const { locale, t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [options, setOptions] = useState<ComparisonOption[]>([]);
  const [left, setLeft] = useState("me:me");
  const [right, setRight] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DifferenceFilter>("different");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    apiRequest<ComparisonOption[]>("/api/v1/permissions/compare/options", {}, token)
      .then((items) => {
        if (cancelled) return;
        setOptions(items);
        const firstRole = items.find((item) => item.kind === "role");
        if (firstRole) setRight(optionValue(firstRole));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("permissions.compare.loadFailed"));
      });
    return () => { cancelled = true; };
  }, [ready, t, token]);

  useEffect(() => {
    if (!token || !left || !right) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const next = await apiRequest<ComparisonResult>(
          "/api/v1/permissions/compare",
          { method: "POST", body: JSON.stringify({ left: parseOptionValue(left), right: parseOptionValue(right) }) },
          token,
        );
        if (!cancelled) {
          setResult(next);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : t("permissions.compare.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [left, right, t, token]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (result?.rows ?? []).filter((row) => {
      if (query && !row.code.toLowerCase().includes(query) && !row.left?.source.toLowerCase().includes(query) && !row.right?.source.toLowerCase().includes(query)) return false;
      const same = Boolean(row.left && row.right && row.left.allow === row.right.allow);
      if (filter === "different") return !same;
      if (filter === "left-only") return Boolean(row.left && !row.right);
      if (filter === "right-only") return Boolean(!row.left && row.right);
      if (filter === "same") return same;
      return true;
    });
  }, [filter, result, search]);

  if (!ready) return <PageState text={t("common.loading")} />;
  if (!token) {
    return (
      <PageState text={t("permissions.compare.loginRequired")}>
        <Link className="button-primary focus-ring mt-4 inline-flex" href="/login?next=/permissions/compare">{t("common.login")}</Link>
      </PageState>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-[var(--accent)]">{t("permissions.compare.kicker")}</p>
          <h1 className="text-3xl font-bold">{t("permissions.compare.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("permissions.compare.description")}</p>
        </div>

        <section className="surface grid gap-4 p-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
          <SubjectSelector label={t("permissions.compare.leftSubject")} options={options} value={left} onChange={setLeft} />
          <button className="button-secondary focus-ring h-11 px-4" type="button" onClick={() => { setLeft(right); setRight(left); }} aria-label={t("permissions.compare.swap")} title={t("permissions.compare.swap")}><IconFont name="swap" fallback="⇄" /></button>
          <SubjectSelector label={t("permissions.compare.rightSubject")} options={options} value={right} onChange={setRight} />
        </section>

        {message ? <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">{message}</p> : null}

        {result ? (
          <section className="surface mt-4 overflow-hidden">
            <header className="grid gap-3 border-b border-[var(--line)] p-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="grid gap-3 sm:grid-cols-2">
                <SubjectSummary subject={result.left} count={result.left.permissions.length} />
                <SubjectSummary subject={result.right} count={result.right.permissions.length} />
              </div>
              <span className="text-sm font-semibold text-[var(--muted)]">{loading ? t("common.loading") : t("permissions.compare.visibleCount", { count: visibleRows.length })}</span>
            </header>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-4">
              <input className="field min-w-56 flex-1" type="search" placeholder={t("permissions.compare.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
              <div className="flex flex-wrap gap-1" role="group" aria-label={t("permissions.compare.filter")}> 
                {(["all", "different", "left-only", "right-only", "same"] as DifferenceFilter[]).map((item) => (
                  <button key={item} className={filter === item ? "button-primary focus-ring" : "button-secondary focus-ring"} type="button" onClick={() => setFilter(item)}>{t(`permissions.compare.filters.${item}`)}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-[var(--panel-subtle)] text-[var(--muted)]">
                  <tr><th className="px-4 py-3">{t("permissions.compare.permission")}</th><th className="px-4 py-3">{result.left.name}</th><th className="px-4 py-3">{result.right.name}</th><th className="px-4 py-3">{t("permissions.compare.difference")}</th></tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.code} className="border-t border-[var(--line)]">
                      <PermissionIdentity locale={locale} row={row} />
                      <PermissionValue entry={row.left} />
                      <PermissionValue entry={row.right} />
                      <td className="px-4 py-3 font-semibold">{differenceLabel(row, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleRows.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">{t("permissions.compare.empty")}</p> : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function PermissionIdentity({ locale, row }: { locale: string; row: ComparisonRow }) {
  const localized = row.translations?.[locale];
  const name = localized?.name?.trim() || row.name?.trim();
  const description = localized?.description?.trim() || row.description?.trim();
  return (
    <td className="px-4 py-3">
      <div className="font-mono font-semibold">{row.code}</div>
      {name ? <div className="mt-1 font-semibold">{name}</div> : null}
      {description ? <div className="mt-1 max-w-xl text-xs leading-5 text-[var(--muted)]">{description}</div> : null}
    </td>
  );
}

function SubjectSelector({ label, options, value, onChange }: { label: string; options: ComparisonOption[]; value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  return <label className="text-sm font-semibold">{label}<select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option key={optionValue(option)} value={optionValue(option)}>{option.kind === "me" ? t("permissions.compare.me") : `${option.name} (${option.code})`}</option>)}</select></label>;
}

function SubjectSummary({ subject, count }: { subject: ComparisonSubject; count: number }) {
  const { t } = useI18n();
  return <div><p className="font-bold">{subject.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{t("permissions.compare.permissionCount", { count })}</p><p className="mt-1 truncate font-mono text-xs text-[var(--muted)]">{subject.groups.map((group) => `group.${group}`).join(", ") || t("permissions.compare.noGroup")}</p></div>;
}

function PermissionValue({ entry }: { entry?: EffectivePermission }) {
  const { t } = useI18n();
  if (!entry) return <td className="px-4 py-3 text-[var(--muted)]">{t("permissions.compare.notGranted")}</td>;
  return <td className="px-4 py-3"><span className={entry.allow ? "font-bold text-[var(--accent)]" : "font-bold text-red-600"}>{String(entry.allow)}</span><span className="ml-2 font-mono text-xs text-[var(--muted)]">{entry.source}</span></td>;
}

function differenceLabel(row: ComparisonRow, t: (key: string) => string) {
  if (row.left && !row.right) return t("permissions.compare.leftOnly");
  if (!row.left && row.right) return t("permissions.compare.rightOnly");
  if (row.left?.allow !== row.right?.allow) return t("permissions.compare.valueDifferent");
  return t("permissions.compare.same");
}

function optionValue(option: ComparisonOption) { return `${option.kind}:${option.code}`; }
function parseOptionValue(value: string) { const [kind, ...parts] = value.split(":"); return { kind, code: parts.join(":") }; }

function PageState({ text, children }: { text: string; children?: React.ReactNode }) {
  return <main className="grid min-h-[60vh] place-items-center px-4"><div className="surface w-full max-w-lg p-6 text-center"><p className="text-sm text-[var(--muted)]">{text}</p>{children}</div></main>;
}
