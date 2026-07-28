"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { advancementConnectedGroups } from "../_lib/advancement-graph";
import { useRotatingValue } from "./rotating-resource";

export type ResourceIndexEntry = {
  key: string;
  id: string;
  name: string;
  iconURL: string;
  iconURLs?: string[];
  href: string;
  parentId?: string;
  x?: number;
  y?: number;
  frame?: string;
};

export type CompactResourceGroup = {
  key: string;
  label: string;
  entries: ResourceIndexEntry[];
  depth?: number;
};

export function CompactResourceIndex({ groups, openInNewTab = false }: { groups: CompactResourceGroup[]; openInNewTab?: boolean }) {
  return <div className="mt-6 divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
    {groups.map((group) => <section className="grid lg:grid-cols-[140px_minmax(0,1fr)]" key={group.key}>
      <h2
        className="bg-[var(--panel-subtle)] p-4 font-black text-[var(--accent)]"
        style={{ paddingInlineStart: `${16 + (group.depth ?? 0) * 16}px` }}
      >
        {group.label}
      </h2>
      <div className="flex flex-wrap content-start gap-x-3 gap-y-2 p-4">
        {group.entries.map((entry) => <CompactResourceLink entry={entry} key={entry.key} openInNewTab={openInNewTab} />)}
      </div>
    </section>)}
  </div>;
}

export function AdvancementResourceIndex({ entries, openInNewTab = false }: { entries: ResourceIndexEntry[]; openInNewTab?: boolean }) {
  const groups = useMemo(() => advancementGroups(entries), [entries]);
  return <div className="mt-6 space-y-5">{groups.map((group) => <AdvancementBoard entries={group} key={group[0]?.key} openInNewTab={openInNewTab} />)}</div>;
}

function AdvancementBoard({ entries, openInNewTab }: { entries: ResourceIndexEntry[]; openInNewTab: boolean }) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const positions = entries.map((entry, index) => ({
    entry,
    x: (entry.x ?? advancementDepth(entry, byId)) * 170 + 70,
    y: (entry.y ?? index) * 74 + 60,
  }));
  const width = Math.max(760, ...positions.map((item) => item.x + 170));
  const height = Math.max(260, ...positions.map((item) => item.y + 90));
  const points = new Map(positions.map((item) => [item.entry.id, item]));

  return <section className="overflow-auto rounded-lg border border-[#4a4335] bg-[#2b261f] shadow-inner">
    <div className="relative" style={{ width, height, backgroundImage: "linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      <svg className="pointer-events-none absolute inset-0" height={height} width={width}>{positions.map(({ entry, x, y }) => {
        const parent = entry.parentId ? points.get(entry.parentId) : undefined;
        return parent ? <path d={`M ${parent.x + 24} ${parent.y + 24} H ${x - 18} V ${y + 24} H ${x}`} fill="none" key={entry.key} stroke="#8b8b8b" strokeWidth="3" /> : null;
      })}</svg>
      {positions.map(({ entry, x, y }) => <div className="absolute" key={entry.key} style={{ left: x, top: y }}>
        <CompactResourceLink entry={entry} openInNewTab={openInNewTab} />
        <span className={`pointer-events-none absolute -inset-1 rounded border-2 ${entry.frame === "challenge" ? "border-fuchsia-500" : entry.frame === "goal" ? "border-amber-400" : "border-slate-400"}`} />
      </div>)}
    </div>
  </section>;
}

function CompactResourceLink({ entry, openInNewTab }: { entry: ResourceIndexEntry; openInNewTab: boolean }) {
  return <Link
    className="focus-ring flex max-w-72 items-center gap-2 rounded bg-[var(--panel)] px-1.5 py-1 text-left text-[var(--accent)] hover:bg-[var(--panel-subtle)]"
    href={entry.href}
    rel={openInNewTab ? "noopener noreferrer" : undefined}
    target={openInNewTab ? "_blank" : undefined}
    title={`${entry.name}\n${entry.id}`}
  >
    <CompactResourceIcon sources={entry.iconURLs?.length ? entry.iconURLs : entry.iconURL ? [entry.iconURL] : []} />
    <strong className="min-w-0 truncate">{entry.name}</strong>
  </Link>;
}

function CompactResourceIcon({ sources }: { sources: string[] }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const availableSources = useMemo(() => sources.filter((source) => !failedSources.includes(source)), [failedSources, sources]);
  const src = useRotatingValue(availableSources, 1000) || "";
  if (!src) {
    return <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--panel-subtle)] text-[10px] font-bold text-[var(--muted)]" aria-hidden="true">?</span>;
  }
  return <Image
    unoptimized
    alt=""
    className="h-8 w-8 shrink-0 object-contain [image-rendering:pixelated]"
    height={32}
    onError={() => setFailedSources((current) => current.includes(src) ? current : [...current, src])}
    src={src}
    width={32}
  />;
}

function advancementGroups(entries: ResourceIndexEntry[]) {
  return advancementConnectedGroups(entries, (entry) => entry.id, (entry) => entry.parentId ?? "");
}

function advancementDepth(entry: ResourceIndexEntry, entries: Map<string, ResourceIndexEntry>) {
  let depth = 0;
  let current = entry;
  const visited = new Set<string>();
  while (current.parentId && entries.has(current.parentId) && !visited.has(current.id)) {
    visited.add(current.id);
    current = entries.get(current.parentId)!;
    depth += 1;
  }
  return depth;
}
