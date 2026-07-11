"use client";

import Link from "next/link";
import { useI18n } from "../_lib/i18n-provider";
import { IconFont } from "./iconfont";

const tools = [
  {
    key: "playground",
    href: "/tools/playground",
    accent: "bg-emerald-500",
  },
  {
    key: "drawio",
    href: "/tools/drawio",
    accent: "bg-sky-500",
  },
  {
    key: "permissions",
    href: "/permissions/compare",
    accent: "bg-amber-600",
  },
];

export function ToolsIndex() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold text-[var(--accent)]">{t("tools.index.kicker")}</p>
          <h1 className="text-3xl font-bold">{t("tools.index.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("tools.index.description")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <Link
              key={tool.key}
              className="surface focus-ring group flex min-h-44 flex-col justify-between rounded-lg p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg"
              href={tool.href}
            >
              <span className={`grid h-12 w-12 place-items-center rounded-lg ${tool.accent} font-bold text-white`}>
                <IconFont className="text-2xl" name={tool.key} fallback={t(`tools.cards.${tool.key}.short`)} />
              </span>
              <span>
                <span className="block text-xl font-bold group-hover:text-[var(--accent)]">
                  {t(`tools.cards.${tool.key}.title`)}
                </span>
                <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">
                  {t(`tools.cards.${tool.key}.description`)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
