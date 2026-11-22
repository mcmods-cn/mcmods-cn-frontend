"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { canAccessAdmin, clearAuth, useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { useTheme } from "./theme-provider";
import { useSiteBrand } from "./site-brand-provider";
import { AdminGateMessage, AdminNotice, AdminNoticeDialog } from "./admin-console-shared";

import { adminNavGroups, adminPanels, panelAccess, type PanelId } from "./admin-panels";

export function AdminConsole() {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const { t } = useI18n();
  const brand = useSiteBrand();
  const auth = useAuthSnapshot();
  const [activePanel, setActivePanel] = useState<PanelId>("overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [expanded, setExpanded] = useState(["workbench"]);
  const [noticeDialog, setNoticeDialog] = useState<AdminNotice | null>(null);
  const authReady = auth.ready;
  const allowed = canAccessAdmin(auth.user);
  const visiblePanel = panelAccess(auth.user, activePanel).read ? activePanel : "overview";

  const selected = adminPanels[visiblePanel];
  const access = panelAccess(auth.user, visiblePanel);

  useEffect(() => {
    function handlePermissionDenied(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const message = typeof detail?.message === "string" ? detail.message : "";
      setNoticeDialog({
        title: t("admin.permissionDeniedTitle"),
        message: message || t("admin.permissionDeniedBody"),
        tone: "danger",
      });
    }
    function handleAdminNotice(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const message = typeof detail?.message === "string" ? detail.message : "";
      if (!message) return;
      const title = typeof detail?.title === "string" ? detail.title : t("admin.noticeTitle");
      const tone = detail?.tone === "danger" ? "danger" : "info";
      setNoticeDialog({ title, message, tone });
    }
    window.addEventListener("mcmods-permission-denied", handlePermissionDenied);
    window.addEventListener("mcmods-admin-notice", handleAdminNotice);
    return () => {
      window.removeEventListener("mcmods-permission-denied", handlePermissionDenied);
      window.removeEventListener("mcmods-admin-notice", handleAdminNotice);
    };
  }, [t]);

  useEffect(() => {
    if (!authReady || auth.logoutStatus) return;
    if (!auth.token) {
      router.replace("/login?next=/admin");
      return;
    }
    if (!allowed) {
      router.replace("/");
      return;
    }
  }, [allowed, auth.token, auth.logoutStatus, authReady, router]);

  function toggleGroup(groupId: string) {
    setExpanded((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
  }

  function logout() {
    void clearAuth();
  }

  const noticeModal = (
    <AdminNoticeDialog
      notice={noticeDialog}
      onClose={() => setNoticeDialog(null)}
    />
  );

  if (!authReady || !auth.token) {
    return (
      <>
        <AdminGateMessage text={t("admin.checkingAuth")} />
        {noticeModal}
      </>
    );
  }

  if (!allowed) {
    return (
      <>
        <AdminGateMessage text={t("admin.noPermissionReturning")} />
        {noticeModal}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--panel)] lg:static lg:z-auto lg:border-b-0 lg:border-r">
          <div className="flex max-h-[80vh] flex-col lg:sticky lg:top-0 lg:h-screen lg:max-h-none">
            <div className="flex items-center gap-3 border-b border-[var(--line)] p-3 lg:block lg:p-4">
              <Link className="flex min-w-0 flex-1 items-center gap-3" href="/">
                {brand.logoUrl ? <img alt="" className="h-10 w-10 rounded-lg object-contain" src={brand.logoUrl} /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] font-bold text-[var(--on-accent)]">M</span>}
                <span>
                  <span className="block text-sm font-semibold text-[var(--muted)]">{brand.siteName}</span>
                  <span className="block text-xl font-bold">{t("admin.title")}</span>
                </span>
              </Link>
              <button aria-controls="admin-navigation" aria-expanded={mobileNavigationOpen} aria-label={t("admin.navigation")} className="button-secondary focus-ring shrink-0 px-3 py-2 lg:hidden" type="button" onClick={() => setMobileNavigationOpen((value) => !value)}>{mobileNavigationOpen ? "×" : "☰"}</button>
            </div>

            <nav id="admin-navigation" className={`${mobileNavigationOpen ? "block" : "hidden"} min-h-0 flex-1 overflow-y-auto p-3 lg:block`}>
              {adminNavGroups.map((group) => {
                const visibleItems = group.panels.filter(panel => panelAccess(auth.user, panel).read);
                if (visibleItems.length === 0) return null;
                const open = expanded.includes(group.id);
                return (
                  <section key={group.id} className="mb-2">
                    <button
                      aria-expanded={open}
                      data-admin-group={group.id}
                      className="focus-ring flex w-full items-center justify-between rounded-lg px-3 py-3 text-left font-bold hover:bg-[var(--panel-subtle)]"
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                    >
                      {t(group.title)}
                      <span className="text-lg text-[var(--muted)]">{open ? "-" : "+"}</span>
                    </button>
                    {open ? (
                      <div className="mt-1 grid gap-1 pl-2">
                        {visibleItems.map((panel) => (
                          <button
                            key={panel}
                            aria-current={visiblePanel === panel ? "page" : undefined}
                            data-admin-panel={panel}
                            className={`focus-ring rounded-lg px-3 py-2 text-left ${
                              visiblePanel === panel
                                ? "bg-[var(--accent)] text-[var(--on-accent)]"
                                : "text-[var(--muted)] hover:bg-[var(--panel-subtle)] hover:text-[var(--foreground)]"
                            }`}
                            type="button"
                            onClick={() => { setActivePanel(panel); setMobileNavigationOpen(false); }}
                          >
                            <span className="block text-sm font-semibold">{t(adminPanels[panel].title)}</span>
                            <span className="mt-0.5 block text-xs opacity-80">{t(adminPanels[panel].description)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </nav>

            <div className={`${mobileNavigationOpen ? "block" : "hidden"} border-t border-[var(--line)] p-3 lg:block`}>
              <button className="button-secondary focus-ring w-full" type="button" onClick={toggleTheme}>
                {t("common.toggleTheme")}
              </button>
              {auth.user ? (
                <button className="button-secondary focus-ring mt-2 w-full" type="button" onClick={logout}>
                  {t("common.logout")}
                </button>
              ) : (
                <Link className="button-primary focus-ring mt-2 block w-full text-center" href="/login?next=/admin">
                  {t("admin.loginAdmin")}
                </Link>
              )}
            </div>
          </div>
        </aside>

        <section key={`${auth.generation}:${auth.user?.id}:${auth.user?.permissionVersion}:${auth.user?.rbacVersion}:${visiblePanel}:${access.write}:${access.execute}`} className="min-w-0 px-4 py-5 md:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{t(selected.title)}</h1>
            </div>
            {auth.user ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
                {auth.user.username} / {(auth.user.roleCodes ?? []).join(", ") || t("admin.ungrouped")}
              </div>
            ) : null}
          </div>

          {selected.render({ user: auth.user, token: auth.token, access, title: t(selected.title) })}
        </section>
      </div>
      {noticeModal}
    </main>
  );
}
