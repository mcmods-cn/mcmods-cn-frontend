"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type WheelEvent as ReactWheelEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL, apiRequest } from "../_lib/api";
import { canAccessAdmin, canAccessReviewQueue, clearAuth, type AuthUser, useAuthSnapshot } from "../_lib/auth";
import { isBackendUnavailable, reportBackendAvailability } from "../_lib/backend-status";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { realtimeQueryCoordinator, realtimeQueryKeys } from "../_lib/realtime-query-cache.mts";
import { useTheme } from "./theme-provider";
import { useSiteBrand } from "./site-brand-provider";

type SiteShellProps = {
  children: React.ReactNode;
};

type HeaderNavItem = {
  labelKey: string;
  href: string;
  external?: boolean;
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
  { labelKey: "nav.addons", href: "/addons" },
  { labelKey: "nav.datapacks", href: "/datapacks" },
  { labelKey: "nav.maps", href: "/maps" },
  { labelKey: "nav.resourcePacks", href: "/resource-packs" },
  { labelKey: "nav.shaders", href: "/shaders" },
  { labelKey: "nav.authors", href: "/authors" },
  { labelKey: "nav.tutorials", href: "/tutorials" },
  { labelKey: "nav.issues", href: "/issues" },
  { labelKey: "nav.news", href: "/news" },
  { labelKey: "nav.discussions", href: "/discussions" },
  { labelKey: "nav.servers", href: "/servers" },
  { labelKey: "nav.skins", href: "/skins" },
  { labelKey: "nav.blueprints", href: "/blueprints" },
  { labelKey: "nav.tools", href: "/tools" },
  {
    labelKey: "nav.siteAffairs",
    href: "/site-affairs/about",
    children: [
      { labelKey: "nav.aboutSite", href: "/site-affairs/about" },
      { labelKey: "nav.siteChangelogs", href: "/site-affairs/changelogs" },
      { labelKey: "nav.blackroom", href: "/site-affairs/blackroom" },
      { labelKey: "nav.externalWiki", href: "https://wiki.mcmods.cn", external: true },
    ],
  },
];

export function SiteShell({ children }: SiteShellProps) {
  const pathname = usePathname();
  const admin = pathname?.startsWith("/admin");
  return (
    <>
      <SitePresence />
      <RealtimeBridge />
      {admin ? <BackendStatusBanner /> : <SiteHeader />}
      {children}
      <SiteNoticeDialog />
    </>
  );
}

function RealtimeBridge() {
  const { token, user } = useAuthSnapshot();

  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    let source: EventSource | null = null;
    let timer: number | null = null;
    let retryIndex = 0;
    const seenEventIds = new Set<string>();
    const delays = [2_000, 5_000, 10_000, 30_000] as const;
    const eventTypes = ["message.created", "notification.created", "notification.changed", "unread.changed"];
    const close = () => { source?.close(); source = null; if (timer !== null) window.clearTimeout(timer); timer = null; };
    const connect = () => {
      close();
      if (cancelled || document.visibilityState !== "visible") return;
      source = new EventSource(`${API_BASE_URL}/api/v1/realtime/events`, { withCredentials: true });
      source.onopen = () => { retryIndex = 0; };
      for (const type of eventTypes) {
        source.addEventListener(type, (event) => {
          const message = event as MessageEvent<string>;
          if (message.lastEventId) {
            if (seenEventIds.has(message.lastEventId)) return;
            seenEventIds.add(message.lastEventId);
            if (seenEventIds.size > 200) {
              const oldest = seenEventIds.values().next().value;
              if (oldest) seenEventIds.delete(oldest);
            }
          }
          let data: unknown = null;
          try { data = JSON.parse(message.data); } catch { data = message.data; }
          realtimeQueryCoordinator.routeRealtimeEvent(user.id, { id: message.lastEventId, type, data });
        });
      }
      source.onerror = () => {
        source?.close(); source = null;
        const delay = delays[Math.min(retryIndex++, delays.length - 1)];
        timer = window.setTimeout(connect, delay);
      };
    };
    const visibility = () => { if (document.visibilityState === "visible") connect(); else close(); };
    connect();
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; close(); document.removeEventListener("visibilitychange", visibility); };
  }, [token, user]);

  return null;
}

const presenceStorageKey = "mcmods.presence.visitor";

function SitePresence() {
  const { token } = useAuthSnapshot();

  useEffect(() => {
    let cancelled = false;
    let visitorId = window.localStorage.getItem(presenceStorageKey) ?? "";
    const touch = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      void apiRequest<{ online: boolean; visitorId?: string }>(
        "/api/v1/site/presence",
        { method: "POST", body: JSON.stringify({ visitorId }) },
        token,
      ).then((response) => {
        if (response.visitorId) {
          visitorId = response.visitorId;
          window.localStorage.setItem(presenceStorageKey, visitorId);
        }
      }).catch(() => undefined);
    };
    touch();
    const timer = window.setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", touch);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [token]);

  return null;
}

type SiteNotice = { message: string; title?: string; tone?: "danger" | "success" | "info" };

function BackendStatusBanner() {
  const { t } = useI18n();
  const [available, setAvailable] = useState(() => !isBackendUnavailable());

  useEffect(() => {
    let cancelled = false;
    let unavailable = isBackendUnavailable();
    let retryIndex = 0;
    let timer: number | null = null;
    const delays = [5_000, 10_000, 20_000, 30_000] as const;

    const clearRetry = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clearRetry();
      if (cancelled || !unavailable || document.visibilityState !== "visible") return;
      const delay = delays[Math.min(retryIndex, delays.length - 1)];
      timer = window.setTimeout(check, delay);
    };
    const update = (nextAvailable: boolean) => {
      unavailable = !nextAvailable;
      setAvailable(nextAvailable);
      if (nextAvailable) {
        retryIndex = 0;
        clearRetry();
      } else {
        schedule();
      }
    };
    const receive = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (typeof detail?.available === "boolean") update(detail.available);
    };
    function check() {
      clearRetry();
      if (cancelled || document.visibilityState !== "visible" || !unavailable) return;
      void apiRequest<{ status: "ready" | "not_ready" }>("/ready", { cache: "no-store" })
        .then((health) => {
          if (cancelled) return;
          const nextAvailable = health.status === "ready";
          reportBackendAvailability(nextAvailable);
          update(nextAvailable);
        })
        .catch(() => {
          if (cancelled) return;
          retryIndex = Math.min(retryIndex + 1, delays.length - 1);
          reportBackendAvailability(false);
          update(false);
        });
    }
    const checkAfterOnline = () => {
      if (unavailable) check();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") schedule();
      else clearRetry();
    };
    window.addEventListener("mcmods-backend-status", receive);
    window.addEventListener("online", checkAfterOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    if (unavailable) schedule();
    return () => {
      cancelled = true;
      clearRetry();
      window.removeEventListener("mcmods-backend-status", receive);
      window.removeEventListener("online", checkAfterOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  if (available) return null;
  return <div className="bg-red-700 px-4 py-2 text-center text-sm font-bold text-white" role="alert">{t("site.backendUnavailable")}</div>;
}

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
  const pathname = usePathname();
  const { toggleTheme } = useTheme();
  const { token, user } = useAuthSnapshot();
  const brand = useSiteBrand();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const navigationRef = useRef<HTMLElement>(null);
  const navigationScrollTimerRef = useRef<number | null>(null);
  const [navigationEdges, setNavigationEdges] = useState({ left: true, right: false });

  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    const queryKey = realtimeQueryKeys.unreadSummary(user.id);
    const load = (force = false) => {
      if (document.visibilityState !== "visible") return;
      void realtimeQueryCoordinator.readQuery(
        queryKey,
        () => apiRequest<{ total: number }>("/api/v1/me/unread-summary", {}, token),
        { maxAgeMs: force ? 0 : 1_000 },
      )
        .then((result) => {
          if (!cancelled) setUnread(result.total);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(() => load(true), 300_000);
    const unsubscribe = realtimeQueryCoordinator.subscribe(queryKey, load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [token, user]);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const updateEdges = () => {
      const maximum = Math.max(0, navigation.scrollWidth - navigation.clientWidth);
      setNavigationEdges({
        left: navigation.scrollLeft <= 1,
        right: navigation.scrollLeft >= maximum - 1,
      });
    };
    updateEdges();
    navigation.addEventListener("scroll", updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(navigation);
    return () => {
      navigation.removeEventListener("scroll", updateEdges);
      observer.disconnect();
    };
  }, []);

  useEffect(() => () => {
    if (navigationScrollTimerRef.current !== null) window.clearInterval(navigationScrollTimerRef.current);
  }, []);

  function scrollNavigation(direction: -1 | 1, smooth = true) {
    navigationRef.current?.scrollBy({ left: direction * 240, behavior: smooth ? "smooth" : "auto" });
  }

  function stopNavigationScroll() {
    if (navigationScrollTimerRef.current === null) return;
    window.clearInterval(navigationScrollTimerRef.current);
    navigationScrollTimerRef.current = null;
  }

  function startNavigationScroll(direction: -1 | 1) {
    stopNavigationScroll();
    scrollNavigation(direction);
    navigationScrollTimerRef.current = window.setInterval(() => scrollNavigation(direction, false), 90);
  }

  function handleNavigationWheel(event: ReactWheelEvent<HTMLElement>) {
    const navigation = navigationRef.current;
    if (!navigation || navigation.scrollWidth <= navigation.clientWidth) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!delta) return;
    event.preventDefault();
    navigation.scrollLeft += delta;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] backdrop-blur">
      <BackendStatusBanner />
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link className="flex shrink-0 items-center gap-3" href="/" aria-label={t("common.home")}>
          {brand.logoUrl ? <img alt="" className="h-10 w-10 rounded-lg object-contain" src={brand.logoUrl} /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-black text-white">M</span>}
          <span className="hidden text-lg font-black tracking-normal sm:block">{brand.siteName}</span>
        </Link>

        <HeaderNavScrollButton
          direction={-1}
          disabled={navigationEdges.left}
          label={t("site.scrollNavigationLeft")}
          onClick={scrollNavigation}
          onMouseEnter={startNavigationScroll}
          onMouseLeave={stopNavigationScroll}
          onWheel={handleNavigationWheel}
        />
        <nav ref={navigationRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t("site.mainNavigation")} onWheel={handleNavigationWheel}>
          {navItems.map((item) => (
            <HeaderNavLink key={item.href} item={item} />
          ))}
        </nav>
        <HeaderNavScrollButton
          direction={1}
          disabled={navigationEdges.right}
          label={t("site.scrollNavigationRight")}
          onClick={scrollNavigation}
          onMouseEnter={startNavigationScroll}
          onMouseLeave={stopNavigationScroll}
          onWheel={handleNavigationWheel}
        />

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
                    title={user.username}
                >
                  {user.avatarUrl ? (
                    <img alt="" className="h-full w-full object-cover" src={user.avatarUrl} />
                  ) : avatarText(user)}
                </Link>
                <div className="invisible absolute right-0 top-full z-50 w-64 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-2xl">
                    <div className="border-b border-[var(--line)] px-4 py-3">
                    <p className="truncate font-black">{user.username}</p>
                      <p className="truncate text-xs text-[var(--muted)]">@{user.username}</p>
                    </div>
                    <nav className="grid p-2" aria-label={t("user.accountSections")}>
                      <ProfileMenuLink href={`/user/${user.id}`}>{t("user.title")}</ProfileMenuLink>
                      <ProfileMenuLink href="/user?section=favorites">{t("favorites.title")}</ProfileMenuLink>
                      <ProfileMenuLink href="/user?section=files">{t("user.fileManager")}</ProfileMenuLink>
                      <ProfileMenuLink href="/user?section=economy">{t("user.economyAndProgression")}</ProfileMenuLink>
                      <ProfileMenuLink href="/user?section=players">{t("skins.playerProfiles")}</ProfileMenuLink>
                      <ProfileMenuLink href="/user?section=settings">{t("user.settings")}</ProfileMenuLink>
                      {canAccessReviewQueue(user) ? <ProfileMenuLink href="/reviews">{t("admin.reviews.projectQueueTitle")}</ProfileMenuLink> : null}
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
            <Link className="button-primary focus-ring px-4 py-2 text-sm" href={`/login?next=${encodeURIComponent(pathname || "/")}`}>
              {t("common.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderNavScrollButton({
  direction,
  disabled,
  label,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onWheel,
}: {
  direction: -1 | 1;
  disabled: boolean;
  label: string;
  onClick: (direction: -1 | 1) => void;
  onMouseEnter: (direction: -1 | 1) => void;
  onMouseLeave: () => void;
  onWheel: (event: ReactWheelEvent<HTMLElement>) => void;
}) {
  return (
    <button
      aria-label={label}
      className="focus-ring grid h-9 w-7 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-[var(--panel)] text-lg font-black text-[var(--muted)] disabled:cursor-default disabled:opacity-30"
      disabled={disabled}
      title={label}
      type="button"
      onClick={() => onClick(direction)}
      onMouseEnter={() => onMouseEnter(direction)}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
    >
      {direction < 0 ? "‹" : "›"}
    </button>
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

  return <HeaderNavMenu item={item} />;
}

function HeaderNavMenu({ item }: { item: HeaderNavItem }) {
  const { t } = useI18n();
  const menuId = useId();
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  function cancelClose() {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function openMenu() {
    cancelClose();
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const menuWidth = 208;
    setPosition({
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - menuWidth - 8)),
      top: bounds.bottom,
    });
  }

  function closeMenu() {
    cancelClose();
    setPosition(null);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setPosition(null);
      closeTimerRef.current = null;
    }, 120);
  }

  useEffect(() => {
    if (!position) return;
    const closeForViewportChange = () => setPosition(null);
    window.addEventListener("resize", closeForViewportChange);
    window.addEventListener("scroll", closeForViewportChange, true);
    return () => {
      window.removeEventListener("resize", closeForViewportChange);
      window.removeEventListener("scroll", closeForViewportChange, true);
    };
  }, [position]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  return (
    <>
      <span className="shrink-0" onBlur={scheduleClose} onFocus={openMenu} onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
        <Link
          ref={triggerRef}
          aria-controls={menuId}
          aria-expanded={position !== null}
          aria-haspopup="menu"
          className="block whitespace-nowrap rounded-md px-3 py-2 text-sm font-bold text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]"
          href={item.href}
          onClick={closeMenu}
        >
          {t(item.labelKey)}
        </Link>
      </span>
      {position ? createPortal(
        <div
          id={menuId}
          className="fixed z-[90] w-52 pt-2"
          role="menu"
          style={{ left: position.left, top: position.top }}
          onBlur={scheduleClose}
          onFocus={cancelClose}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            closeMenu();
            triggerRef.current?.focus();
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="grid gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-2xl">
            <Link className="rounded-md px-3 py-2 text-sm font-bold hover:bg-[var(--panel-subtle)]" href={item.href} role="menuitem" onClick={closeMenu}>
              {t(item.labelKey)}
            </Link>
            {item.children?.map((child) => (
              child.external ? <a key={child.href} className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]" href={child.href} rel="noopener noreferrer external" role="menuitem" target="_blank" onClick={closeMenu}>{t(child.labelKey)} ↗</a>
                : <Link key={child.href} className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]" href={child.href} role="menuitem" onClick={closeMenu}>{t(child.labelKey)}</Link>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function avatarText(user: AuthUser) {
  const name = user.username || String(user.id);
  return name.trim().slice(0, 1).toUpperCase();
}
