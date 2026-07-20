"use client";

import Link from "next/link";

export type UnifiedRecipeMaterial = {
  id: string;
  name: string;
  amount: string;
};

export function UnifiedRecipeCard({
  title,
  badge,
  materials,
  visual,
  note,
  recipeType,
  recipeTypeHref,
  source,
  sourceHref,
  technicalInfo,
  editAction,
  labels,
}: {
  title: string;
  badge?: string;
  materials: UnifiedRecipeMaterial[];
  visual: React.ReactNode;
  note?: string;
  recipeType?: string;
  recipeTypeHref?: string;
  source?: string;
  sourceHref?: string;
  technicalInfo: Record<string, string>;
  editAction?: React.ReactNode;
  labels: { materials: string; note: string; noNote: string; technical: string; recipeType: string; source: string };
}) {
  return <article className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
      <div className="min-w-0"><code className="block truncate font-bold">{title}</code>{badge ? <span className="mt-1 inline-block rounded bg-[var(--panel-subtle)] px-2 py-0.5 text-xs font-bold">{badge}</span> : null}</div>
      <div className="flex shrink-0 items-center gap-2">{editAction}<span className="group relative"><button aria-label={labels.technical} className="focus-ring grid h-7 w-7 place-items-center rounded-full border border-[var(--line)] text-xs font-black" type="button">i</button><span className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-72 rounded-md bg-[#242424] p-3 text-left text-xs text-white shadow-xl group-hover:block group-focus-within:block">{Object.entries(technicalInfo).map(([key, value]) => <span className="grid grid-cols-[90px_1fr] gap-2 py-1" key={key}><strong>{key}</strong><code className="break-all opacity-80">{value || "-"}</code></span>)}</span></span></div>
    </header>
    <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_220px]">
      <aside className="border-b border-[var(--line)] p-4 lg:border-b-0 lg:border-r"><strong className="text-sm">{labels.materials}</strong>{materials.length ? <ul className="mt-3 grid gap-2">{materials.map((material, index) => <li className="min-w-0 text-sm" key={`${material.id}:${index}`} title={material.id}><span className="block truncate font-bold">{material.name}<span className="ml-1 text-[var(--muted)]">× {material.amount}</span></span><code className="block truncate text-[10px] text-[var(--muted)]">{material.id}</code></li>)}</ul> : <span className="mt-3 block text-sm text-[var(--muted)]">-</span>}</aside>
      <div className="min-w-0 overflow-auto bg-[#c6c6c6] p-4">{visual}</div>
      <aside className="border-t border-[var(--line)] p-4 lg:border-l lg:border-t-0"><strong className="text-sm">{labels.note}</strong><p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{note || labels.noNote}</p></aside>
    </div>
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] px-4 py-3 text-xs">
      {recipeType ? <span><strong className="mr-2 text-[var(--muted)]">{labels.recipeType}</strong>{recipeTypeHref ? <Link className="font-mono font-bold text-[var(--accent)] hover:underline" href={recipeTypeHref}>{recipeType}</Link> : <code>{recipeType}</code>}</span> : null}
      {source ? <span><strong className="mr-2 text-[var(--muted)]">{labels.source}</strong>{sourceHref ? <Link className="font-mono font-bold text-[var(--accent)] hover:underline" href={sourceHref}>{source}</Link> : <code>{source}</code>}</span> : null}
    </footer>
  </article>;
}
