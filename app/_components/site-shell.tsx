"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { canAccessAdmin, clearAuth, type AuthUser, useAuthSnapshot } from "../_lib/auth";
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
  {
    labelKey: "nav.mods",
    href: "/mods",
    children: [
      { labelKey: "nav.modsTags", href: "/mods-tag" },
      { labelKey: "nav.recipeTypes", href: "/recipe-types" },
    ],
  },
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
  { labelKey: "nav.blueprints", href: "/blueprints" },
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
      <SiteNoticeDialog />
    </>
  );
}

type SiteNotice = { message: string; title?: string; tone?: "danger" | "success" | "info" };

function SiteNoticeDialog() {
  const { t } = useI18n();
  const [notice, setNotice] = useState<SiteNotice | null>(null);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (detail && typeof detail.message === "string") setNotice(detail as SiteNotice);
    };
    window.addEventListener("mcmods-site-notice", receive);
    return () => window.removeEventListener("mcmods-site-notice", receive);
  }, []);

  if (!notice) return null;
  const danger = notice.tone === "danger";
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={() => setNotice(null)}>
      <section className="surface w-full max-w-lg rounded-lg border border-[var(--line)] p-6 shadow-2xl" role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <h2 className={`text-xl font-black ${danger ? "text-[var(--red)]" : ""}`}>{notice.title || t("common.notice")}</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{notice.message}</p>
        <div className="mt-6 flex justify-end"><button className="button-primary focus-ring" type="button" onClick={() => setNotice(null)}>{t("common.close")}</button></div>
      </section>
    </div>
  );
}

function SiteHeader() {
  const { t, locale, setLocale } = useI18n();
  const { toggleTheme } = useTheme();
  const { token, user } = useAuthSnapshot();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [backendAvailable, setBackendAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const checkBackend = () => {
      void apiRequest<{ status: string }>("/health")
        .then(() => {
          if (!cancelled) setBackendAvailable(true);
        })
        .catch(() => {
          if (!cancelled) setBackendAvailable(false);
        });
    };
    checkBackend();
    const timer = window.setInterval(checkBackend, 10_000);
    window.addEventListener("online", checkBackend);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", checkBackend);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => {
      void apiRequest<{ total: number }>("/api/v1/notifications/unread", {}, token)
        .then((result) => {
          if (!cancelled) setUnread(result.total);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 20_000);
    window.addEventListener("mcmods-unread-change", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("mcmods-unread-change", load);
    };
  }, [token]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] backdrop-blur">
      {!backendAvailable ? (
        <div className="bg-red-700 px-4 py-2 text-center text-sm font-bold text-white" role="alert">
          {t("site.backendUnavailable")}
        </div>
      ) : null}
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
          {user ? (
            <>
              <div className="group relative">
                <Link
                  className="focus-ring grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-[var(--line)] bg-[var(--panel-subtle)] text-sm font-black text-[var(--accent)]"
                  href={`/user/${user.id}`}
                  title={user.displayName || user.username}
                >
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="h-full w-full object-cover" src={user.avatarUrl} />
                  ) : avatarText(user)}
                </Link>
                <div className="invisible absolute right-0 top-full z-50 w-64 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-2xl">
                    <div className="border-b border-[var(--line)] px-4 py-3">
                      <p className="truncate font-black">{user.displayName || user.username}</p>
                      <p className="truncate text-xs text-[var(--muted)]">@{user.username}</p>
                    </div>
                    <nav className="grid p-2" aria-label={t("user.accountSections")}>
                      <ProfileMenuLink href={`/user/${user.id}`}>{t("user.title")}</ProfileMenuLink>
                      <ProfileMenuLink href="/user?section=favorites">{t("favorites.title")}</ProfileMenuLink>
                      <ProfileMenuLink href="/user?section=files">{t("user.fileManager")}</ProfileMenuLink>
                      <ProfileMenuLink href="/user?section=settings">{t("user.settings")}</ProfileMenuLink>
                      {canAccessAdmin(user) ? <ProfileMenuLink href="/admin">{t("common.admin")}</ProfileMenuLink> : null}
                    </nav>
                    <div className="border-t border-[var(--line)] p-2">
                      <button className="focus-ring w-full rounded-md px-3 py-2 text-left text-sm font-bold text-[var(--red)] hover:bg-[var(--panel-subtle)]" type="button" onClick={() => { clearAuth(); router.replace("/"); router.refresh(); }}>
                        {t("common.logout")}
                      </button>
                    </div>
                  </section>
                </div>
              </div>
              <Link
                className="focus-ring relative grid h-10 min-w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-bold hover:border-[var(--accent)]"
                href="/messages"
                title={t("site.messageCenter")}
              >
                {t("common.messages")}
                {token && unread > 0 ? <span className="ml-1 rounded-full bg-[var(--red)] px-1.5 py-0.5 text-[10px] leading-none text-white">{unread > 99 ? "99+" : unread}</span> : null}
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

function ProfileMenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="focus-ring rounded-md px-3 py-2 text-sm font-bold hover:bg-[var(--panel-subtle)] hover:text-[var(--accent)]" href={href}>{children}</Link>;
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
