"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccessAdmin, type AuthUser, useAuthSnapshot } from "../_lib/auth";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { useTheme } from "./theme-provider";

type SiteShellProps = {
  children: React.ReactNode;
};

type HeaderNavItem = {
  labelKey: string;
  href: string;
  children?: HeaderNavItem[];
};

const navItems: HeaderNavItem[] = [
  { labelKey: "nav.mods", href: "/mods" },
  { labelKey: "nav.modpacks", href: "/modpacks" },
  { labelKey: "nav.plugins", href: "/plugins" },
  {
    labelKey: "nav.derivatives",
    href: "/derivatives",
    children: [
      { labelKey: "nav.tacz", href: "/derivatives/tacz" },
      { labelKey: "nav.kubejs", href: "/derivatives/kubejs" },
      { labelKey: "nav.modConfigs", href: "/derivatives/mod-configs" },
      { labelKey: "nav.pluginConfigs", href: "/derivatives/plugin-configs" },
    ],
  },
  { labelKey: "nav.datapacks", href: "/datapacks" },
  { labelKey: "nav.maps", href: "/maps" },
  { labelKey: "nav.resourcePacks", href: "/resource-packs" },
  { labelKey: "nav.shaders", href: "/shaders" },
  { labelKey: "nav.skins", href: "/skins" },
  { labelKey: "nav.authors", href: "/authors" },
  { labelKey: "nav.tutorials", href: "/tutorials" },
  { labelKey: "nav.news", href: "/news" },
  { labelKey: "nav.discussions", href: "/discussions" },
  { labelKey: "nav.tools", href: "/tools" },
  {
    labelKey: "nav.servers",
    href: "/servers",
    children: [
      { labelKey: "nav.serverList", href: "/servers/list" },
      { labelKey: "nav.serverPacks", href: "/servers/packs" },
    ],
  },
];

export function SiteShell({ children }: SiteShellProps) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return <>{children}</>;
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}

function SiteHeader() {
  const { t, locale, setLocale } = useI18n();
  const { toggleTheme } = useTheme();
  const { user } = useAuthSnapshot();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link className="flex shrink-0 items-center gap-3" href="/" aria-label={t("common.home")}>
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-black text-white">M</span>
          <span className="hidden text-lg font-black tracking-normal sm:block">{t("common.appName")}</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label={t("site.mainNavigation")}>
          {navItems.map((item) => (
            <HeaderNavLink key={item.href} item={item} />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <select
            aria-label={t("common.language")}
            className="hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2 py-2 text-sm font-semibold outline-none lg:block"
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
          <button className="button-secondary focus-ring hidden px-3 py-2 text-sm lg:inline-flex" type="button" onClick={toggleTheme}>
            {t("common.toggleTheme")}
          </button>
          {canAccessAdmin(user) ? (
            <Link className="button-secondary focus-ring hidden px-3 py-2 text-sm xl:inline-flex" href="/admin">
              {t("common.admin")}
            </Link>
          ) : null}
          {user ? (
            <>
              <Link
                className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel-subtle)] text-sm font-black text-[var(--accent)]"
                href="/user"
                title={user.displayName || user.username}
              >
                {avatarText(user)}
              </Link>
              <Link
                className="focus-ring relative grid h-10 min-w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-bold hover:border-[var(--accent)]"
                href="/messages"
                title={t("site.messageCenter")}
              >
                {t("common.messages")}
              </Link>
            </>
          ) : (
            <Link className="button-primary focus-ring px-4 py-2 text-sm" href="/login">
              {t("common.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderNavLink({ item }: { item: HeaderNavItem }) {
  const { t } = useI18n();
  if (!item.children) {
    return (
      <Link
        className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]"
        href={item.href}
      >
        {t(item.labelKey)}
      </Link>
    );
  }

  return (
    <details className="group relative shrink-0">
      <summary className="list-none whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]">
        {t(item.labelKey)}
      </summary>
      <div className="absolute left-0 top-10 z-50 grid min-w-44 gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-xl">
        <Link className="rounded-md px-3 py-2 text-sm font-bold hover:bg-[var(--panel-subtle)]" href={item.href}>
          {t(item.labelKey)}
        </Link>
        {item.children.map((child) => (
          <Link key={child.href} className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]" href={child.href}>
            {t(child.labelKey)}
          </Link>
        ))}
      </div>
    </details>
  );
}

function avatarText(user: AuthUser) {
  const name = user.displayName || user.username || String(user.id);
  return name.trim().slice(0, 1).toUpperCase();
}
