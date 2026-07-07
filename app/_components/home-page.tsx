"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { canAccessAdmin, clearAuth, type AuthUser } from "../_lib/auth";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { useTheme } from "./theme-provider";

type NavItem = {
  key: string;
  href: string;
  children?: NavItem[];
};

const moduleNav: NavItem[] = [
  { key: "nav.mods", href: "/mods" },
  { key: "nav.modpacks", href: "/modpacks" },
  { key: "nav.plugins", href: "/plugins" },
  {
    key: "nav.derivatives",
    href: "/derivatives",
    children: [
      { key: "nav.tacz", href: "/derivatives/tacz" },
      { key: "nav.kubejs", href: "/derivatives/kubejs" },
      { key: "nav.modConfigs", href: "/derivatives/mod-configs" },
      { key: "nav.pluginConfigs", href: "/derivatives/plugin-configs" },
    ],
  },
  { key: "nav.datapacks", href: "/datapacks" },
  { key: "nav.maps", href: "/maps" },
  { key: "nav.resourcePacks", href: "/resource-packs" },
  { key: "nav.shaders", href: "/shaders" },
  { key: "nav.skins", href: "/skins" },
  { key: "nav.authors", href: "/authors" },
  { key: "nav.tutorials", href: "/tutorials" },
  { key: "nav.news", href: "/news" },
  { key: "nav.discussions", href: "/discussions" },
  { key: "nav.tools", href: "/tools" },
  {
    key: "nav.servers",
    href: "/servers",
    children: [
      { key: "nav.serverList", href: "/servers/list" },
      { key: "nav.serverPacks", href: "/servers/packs" },
    ],
  },
];

const topNav: NavItem[] = [
  { key: "common.home", href: "/" },
  { key: "nav.mods", href: "/mods" },
  { key: "nav.modpacks", href: "/modpacks" },
  { key: "nav.plugins", href: "/plugins" },
  { key: "nav.derivatives", href: "/derivatives" },
  { key: "nav.tutorials", href: "/tutorials" },
  { key: "nav.news", href: "/news" },
  { key: "nav.discussions", href: "/discussions" },
  { key: "nav.tools", href: "/tools" },
  { key: "nav.servers", href: "/servers" },
  { key: "nav.authors", href: "/authors" },
];

export function HomePage() {
  const { t, locale, setLocale } = useI18n();
  const { toggleTheme } = useTheme();
  const authSnapshot = useSyncExternalStore(subscribeAuth, readAuthText, () => "");
  const auth = useMemo(() => parseAuthText(authSnapshot), [authSnapshot]);
  const showAdmin = canAccessAdmin(auth.user);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-bold text-white">
              M
            </span>
            <span className="text-xl font-bold">{t("common.appName")}</span>
          </Link>
          <nav className="order-last flex w-full gap-1 overflow-x-auto lg:order-none lg:w-auto" aria-label={t("common.home")}>
            {topNav.map((item) => (
              <Link
                key={item.key}
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]"
                href={item.href}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="ui-locale">
              {t("common.language")}
            </label>
            <select
              id="ui-locale"
              className="field w-auto min-w-36 py-2"
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {supportedLocales.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <button className="button-secondary focus-ring" type="button" onClick={toggleTheme}>
              {t("common.toggleTheme")}
            </button>
            {showAdmin ? (
              <Link className="button-secondary focus-ring" href="/admin">
                {t("common.admin")}
              </Link>
            ) : null}
            {auth.user ? (
              <button className="button-secondary focus-ring" type="button" onClick={clearAuth}>
                {t("common.logout")}
              </button>
            ) : (
              <Link className="button-primary focus-ring" href="/login">
                {t("common.login")}
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[320px_1fr]">
        <aside className="surface h-fit rounded-lg p-4">
          <h1 className="text-2xl font-bold">{t("home.title")}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("home.subtitle")}</p>
          <input className="field mt-4" placeholder={t("home.searchPlaceholder")} />
        </aside>

        <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("home.title")}>
          {moduleNav.map((item) => (
            <ModuleLink key={item.key} item={item} />
          ))}
        </nav>
      </section>
    </main>
  );
}

function ModuleLink({ item }: { item: NavItem }) {
  const { t } = useI18n();
  return (
    <section className="surface rounded-lg p-4">
      <Link className="block text-lg font-bold hover:text-[var(--accent)]" href={item.href}>
        {t(item.key)}
      </Link>
      {item.children ? (
        <div className="mt-3 grid gap-2">
          {item.children.map((child) => (
            <Link
              key={child.key}
              className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              href={child.href}
            >
              {t(child.key)}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function subscribeAuth(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("mcmods-auth-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("mcmods-auth-change", onStoreChange);
  };
}

function readAuthText() {
  const token =
    window.localStorage.getItem("mcmods-token") ??
    window.localStorage.getItem("mcmods-admin-token") ??
    "";
  const savedUser =
    window.localStorage.getItem("mcmods-user") ??
    window.localStorage.getItem("mcmods-admin-user") ??
    "";
  return JSON.stringify({ token, savedUser });
}

function parseAuthText(snapshot: string): { token: string; user: AuthUser | null } {
  if (!snapshot) {
    return { token: "", user: null };
  }
  try {
    const parsed = JSON.parse(snapshot) as { token: string; savedUser: string };
    return { token: parsed.token, user: parsed.savedUser ? JSON.parse(parsed.savedUser) : null };
  } catch {
    return { token: "", user: null };
  }
}
