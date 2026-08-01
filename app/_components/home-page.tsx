"use client";

import Link from "next/link";
import { useI18n } from "../_lib/i18n-provider";

type HomeCategory = {
  titleKey: string;
  descriptionKey: string;
  href: string;
  meta: string;
  children?: Array<{ titleKey: string; href: string }>;
};

const primaryCategories: HomeCategory[] = [
  { titleKey: "nav.mods", descriptionKey: "home.categories.modsDesc", href: "/mods", meta: "Mods" },
  { titleKey: "nav.modpacks", descriptionKey: "home.categories.modpacksDesc", href: "/modpacks", meta: "Modpacks" },
  { titleKey: "nav.plugins", descriptionKey: "home.categories.pluginsDesc", href: "/plugins", meta: "Plugin" },
  {
    titleKey: "nav.derivatives",
    descriptionKey: "home.categories.derivativesDesc",
    href: "/derivatives",
    meta: "Resources",
    children: [
      { titleKey: "nav.tacz", href: "/derivatives/tacz" },
      { titleKey: "nav.kubejs", href: "/derivatives/kubejs" },
      { titleKey: "nav.modConfigs", href: "/derivatives/mod-configs" },
      { titleKey: "nav.pluginConfigs", href: "/derivatives/plugin-configs" },
    ],
  },
  { titleKey: "nav.datapacks", descriptionKey: "home.categories.datapacksDesc", href: "/datapacks", meta: "Datapack" },
  { titleKey: "nav.maps", descriptionKey: "home.categories.mapsDesc", href: "/maps", meta: "Map" },
  { titleKey: "nav.resourcePacks", descriptionKey: "home.categories.resourcePacksDesc", href: "/resource-packs", meta: "Resource Pack" },
  { titleKey: "nav.shaders", descriptionKey: "home.categories.shadersDesc", href: "/shaders", meta: "Shader" },
  { titleKey: "nav.skins", descriptionKey: "home.categories.skinsDesc", href: "/skins", meta: "Skin" },
  { titleKey: "nav.authors", descriptionKey: "home.categories.authorsDesc", href: "/authors", meta: "Creators" },
  { titleKey: "nav.tutorials", descriptionKey: "home.categories.tutorialsDesc", href: "/tutorials", meta: "Guides" },
  { titleKey: "nav.news", descriptionKey: "home.categories.newsDesc", href: "/news", meta: "News" },
  { titleKey: "nav.discussions", descriptionKey: "home.categories.discussionsDesc", href: "/discussions", meta: "Community" },
  { titleKey: "nav.tools", descriptionKey: "home.categories.toolsDesc", href: "/tools", meta: "Tools" },
  { titleKey: "nav.servers", descriptionKey: "home.categories.serversDesc", href: "/servers", meta: "Servers" },
];

const quickLinks = [
  { titleKey: "home.quickSubmit", href: "/projects/new" },
  { titleKey: "home.quickTools", href: "/tools" },
  { titleKey: "home.quickPlayground", href: "/tools/playground" },
  { titleKey: "home.quickDiscussions", href: "/discussions" },
];

export function HomePage() {
  const { t } = useI18n();
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[1fr_360px] lg:py-12">
          <div>
            <p className="text-sm font-bold text-[var(--accent)]">{t("home.kicker")}</p>
            <h1 className="mt-3 max-w-4xl text-3xl font-black leading-tight md:text-5xl">{t("home.heroTitle")}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--muted)]">{t("home.heroDescription")}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input className="field h-12" placeholder={t("home.searchPlaceholder")} />
              <button className="button-primary focus-ring h-12 px-6" type="button">
                {t("home.searchAction")}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {quickLinks.map((link) => (
                <Link key={link.href} className="button-secondary focus-ring px-3 py-2 text-sm" href={link.href}>
                  {t(link.titleKey)}
                </Link>
              ))}
            </div>
          </div>

          <aside className="surface rounded-lg p-5">
            <h2 className="text-lg font-black">{t("home.siteActivity")}</h2>
            <div className="mt-4 grid gap-3">
              <StatLine label={t("home.projectCount")} value={t("home.preparing")} />
              <StatLine label={t("home.updatedToday")} value={t("home.preparing")} />
              <StatLine label={t("home.pendingReview")} value={t("home.preparing")} />
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{t("home.activityHint")}</p>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
          <h2 className="font-black">{t("home.quickBrowse")}</h2>
          <div className="mt-3 grid gap-1">
            {primaryCategories.slice(0, 10).map((item) => (
              <Link key={item.href} className="rounded-md px-3 py-2 text-sm font-bold text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--foreground)]" href={item.href}>
                {t(item.titleKey)}
              </Link>
            ))}
          </div>
        </aside>

        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[var(--accent)]">{t("home.categoryKicker")}</p>
              <h2 className="text-2xl font-black">{t("home.categoryTitle")}</h2>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {primaryCategories.map((item) => (
              <CategoryCard key={item.href} item={item} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function CategoryCard({ item }: { item: HomeCategory }) {
  const { t } = useI18n();
  return (
    <section className="surface flex min-h-44 flex-col rounded-lg p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <Link className="text-xl font-black hover:text-[var(--accent)]" href={item.href}>
          {t(item.titleKey)}
        </Link>
        <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-xs font-black text-[var(--muted)]">{item.meta}</span>
      </div>
      <p className="mt-3 flex-1 text-sm leading-6 text-[var(--muted)]">{t(item.descriptionKey)}</p>
      {item.children ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.children.map((child) => (
            <Link key={child.href} className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={child.href}>
              {t(child.titleKey)}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] px-3 py-2">
      <span className="text-sm font-bold text-[var(--muted)]">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );
}
