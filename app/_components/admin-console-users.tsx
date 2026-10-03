"use client";

import { FormEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { hasSameI18nPlaceholders } from "../_lib/i18n-message.mts";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { AdminUserBalance, AdminUserDetails, EmptyState, InlineMessage, PanelShell, PermissionCatalog, User, aiTranslationTaskTypes, cleanError, formatDateTime, notifyAdminNotice, runAITranslationTask } from "./admin-console-shared";

function UsersPanelV2({
  catalog,
  token,
  users,
  refreshUsers,
}: {
  catalog: PermissionCatalog;
  token: string;
  users: User[];
  refreshUsers: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const createPending = useRef(false);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<AdminUserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const result = await apiRequest<User[]>(`/api/v1/admin/users?q=${encodeURIComponent(query)}`, {}, token);
        if (!cancelled) setSearchResults(result);
      } catch (error) {
        if (!cancelled) notifyAdminNotice(cleanError(error), t("admin.userSearchFailed"), "danger");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, t, token]);

  async function openUserDetails(userID: string) {
    setSelectedUserDetails(null);
    setDetailsLoading(true);
    try {
      setSelectedUserDetails(await apiRequest<AdminUserDetails>(`/api/v1/admin/users/${userID}`, {}, token));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.userDetailsLoadFailed"), "danger");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createPending.current) return;
    createPending.current = true;
    setCreating(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const roles = String(form.get("roles") ?? "")
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);
    const payload = {
      username: String(form.get("username") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      status: String(form.get("status") ?? "active"),
      roles,
    };
    try {
      await apiRequest<User>("/api/v1/admin/users", { method: "POST", body: JSON.stringify(payload) }, token);
      formElement.reset();
      setMessage(t("admin.userCreated"));
      try { await refreshUsers(); } catch (error) {
        setMessage(`${t("admin.userCreated")} ${cleanError(error)}`);
      }
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      createPending.current = false;
      setCreating(false);
    }
  }

  return (
    <PanelShell title={t("admin.userList")}>
      <form className="mb-5 grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4" onSubmit={createUser}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold">{t("admin.createUser")}</h3>
            <p className="text-sm text-[var(--muted)]">{t("admin.createUserHint")}</p>
          </div>
          <button className="button-primary focus-ring" disabled={creating} type="submit">
            {creating ? t("admin.saving") : t("admin.createUser")}
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="text-sm font-semibold">
            {t("admin.username")}
            <input className="field mt-2" name="username" placeholder="steve" required />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.email")}
            <input className="field mt-2" name="email" placeholder="name@example.com" required type="email" />
          </label>
          <label className="text-sm font-semibold">
            {t("admin.initialPassword")}
            <input className="field mt-2" minLength={8} name="password" required type="password" />
          </label>
        </div>
        <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
          <label className="text-sm font-semibold">
            {t("admin.status")}
            <select className="field mt-2" defaultValue="active" name="status">
              <option value="active">{t("admin.active")}</option>
              <option value="banned">{t("admin.banned")}</option>
              <option value="deleted">{t("admin.deleted")}</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            {t("admin.roleList")}
            <input className="field mt-2" list="create-user-role-options" name="roles" />
          </label>
        </div>
        <datalist id="create-user-role-options">
          {catalog.roles.map((role) => (
            <option key={role.code} value={role.code} />
          ))}
        </datalist>
        {message ? <InlineMessage text={message} /> : null}
      </form>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="min-w-64 flex-1">
          <span className="sr-only">{t("admin.searchUsers")}</span>
          <input
            className="field"
            placeholder={t("admin.searchUsersPlaceholder")}
            type="search"
            value={searchQuery}
            onChange={(event) => {
              const value = event.target.value;
              setSearchQuery(value);
              if (!value.trim()) {
                setSearchResults(null);
                setSearching(false);
              }
            }}
          />
        </label>
        <span className="text-sm text-[var(--muted)]">
          {searching ? t("admin.searchingUsers") : t("admin.userCount", { count: (searchResults ?? users).length })}
        </span>
      </div>
      {(searchResults ?? users).length === 0 ? (
        <EmptyState text={t("admin.noUsers")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="border-b border-[var(--line)] py-2">ID</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.users")}</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.email")}</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.registeredAt")}</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.status")}</th>
                <th className="border-b border-[var(--line)] py-2">{t("admin.roleList")}</th>
              </tr>
            </thead>
            <tbody>
              {(searchResults ?? users).map((user) => (
                <tr key={user.id}>
                  <td className="border-b border-[var(--line)] py-3">{user.id}</td>
                  <td className="border-b border-[var(--line)] py-3">
                    <button
                      className="focus-ring text-left font-semibold text-[var(--accent)] hover:underline"
                      type="button"
                      onClick={() => void openUserDetails(user.id)}
                    >
                      {user.username}
                    </button>
                  </td>
                  <td className="border-b border-[var(--line)] py-3">{user.email}</td>
                  <td className="border-b border-[var(--line)] py-3">{formatDateTime(user.createdAt)}</td>
                  <td className="border-b border-[var(--line)] py-3">{user.status}</td>
                  <td className="border-b border-[var(--line)] py-3">{(user.roleCodes ?? []).join(", ") || "member"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailsLoading ? <UserDetailsLoadingDialog /> : null}
      {selectedUserDetails ? (
        <AdminUserDetailsDialog
          details={selectedUserDetails}
          token={token}
          onClose={() => setSelectedUserDetails(null)}
          onStatusChanged={async () => {
            await refreshUsers();
            await openUserDetails(selectedUserDetails.user.id);
          }}
        />
      ) : null}
    </PanelShell>
  );
}

function UserDetailsLoadingDialog() {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4" role="dialog" aria-modal="true">
      <div className="surface w-full max-w-sm rounded-lg p-6 text-center shadow-2xl">
        <p className="font-bold">{t("admin.loadingUserDetails")}</p>
      </div>
    </div>
  );
}

function AdminUserDetailsDialog({
  details,
  token,
  onClose,
  onStatusChanged,
}: {
  details: AdminUserDetails;
  token: string;
  onClose: () => void;
  onStatusChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const user = details.user;
  const [status, setStatus] = useState(user.status);
  const [savingStatus, setSavingStatus] = useState(false);
  const registrationLocation = formatUserLocation(details.registrationCountryCode, details.registrationCity);
  const lastLoginLocation = formatUserLocation(details.lastLogin?.countryCode, details.lastLogin?.city);

  async function saveStatus() {
    setSavingStatus(true);
    try {
      await apiRequest(`/api/v1/admin/users/${user.id}/status`, { method: "PUT", body: JSON.stringify({ status }) }, token);
      notifyAdminNotice(t("admin.userStatusSaved"));
      await onStatusChanged();
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={onClose}>
      <section
        className="surface flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--line)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">UID {user.id}</p>
            <h2 id="admin-user-details-title" className="text-xl font-bold">{user.username}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p>
          </div>
          <button className="focus-ring grid h-10 w-10 place-items-center rounded-md text-xl hover:bg-[var(--panel-subtle)]" title={t("common.close")} type="button" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto">
          <section className="flex flex-wrap items-end gap-3 border-b border-[var(--line)] px-5 py-4">
            <label className="min-w-52 text-sm font-semibold">{t("admin.status")}
              <select className="field mt-2" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="active">{t("admin.active")}</option>
                <option value="banned">{t("admin.banned")}</option>
                <option value="disabled">{t("admin.disabled")}</option>
                <option value="deleted">{t("admin.deleted")}</option>
              </select>
            </label>
            <button className="button-primary focus-ring" disabled={savingStatus || status === user.status} type="button" onClick={() => void saveStatus()}>{savingStatus ? t("admin.saving") : t("common.save")}</button>
          </section>
          <section className="grid gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
            <UserDetailValue label={t("admin.status")} value={user.status} />
            <UserDetailValue label={t("admin.registeredAt")} value={formatDateTime(user.createdAt)} />
            <UserDetailValue label={t("admin.lastLoginAt")} value={formatDateTime(details.lastLogin?.at || user.lastLoginAt)} />
            <UserDetailValue label={t("admin.timezone")} value={details.timezone || "-"} />
            <UserDetailValue label={t("admin.primaryLanguage")} value={details.primaryLanguage || "-"} />
            <UserDetailValue label={t("admin.secondaryLanguage")} value={details.secondaryLanguage || "-"} />
            <UserDetailValue label={t("admin.selectedCountry")} value={details.country || "-"} />
            <UserDetailValue label={t("admin.emailVerified")} value={user.emailVerified ? t("common.yes") : t("common.no")} />
            <UserDetailValue label={t("admin.oauthBound")} value={details.oauthProviders.length > 0 ? details.oauthProviders.join(", ") : t("common.no")} />
            <UserDetailValue label={t("admin.registrationIp")} value={details.registrationIp || "-"} />
            <UserDetailValue label={t("admin.registrationLocation")} value={registrationLocation} />
            <UserDetailValue label={t("admin.lastLoginIp")} value={details.lastLogin?.ip || "-"} />
            <UserDetailValue label={t("admin.lastLoginLocation")} value={lastLoginLocation} />
            <UserDetailValue label={t("admin.lastLoginDevice")} value={details.lastLogin?.userAgent || "-"} wide />
          </section>

          <AdminUserBalanceEditor token={token} userID={user.id} />

          <section className="border-t border-[var(--line)] px-5 py-5">
            <h3 className="font-bold">{t("admin.roleList")}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(user.roleCodes ?? []).length > 0 ? (user.roleCodes ?? []).map((role) => (
                <span key={role} className="rounded-md bg-[var(--panel-subtle)] px-2.5 py-1 font-mono text-xs">{role}</span>
              )) : <span className="text-sm text-[var(--muted)]">{t("admin.noRoleAssigned")}</span>}
            </div>
          </section>

          <section className="border-t border-[var(--line)] px-5 py-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-bold">{t("admin.rootPermissions")}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.rootPermissionsHint")}</p>
              </div>
              <span className="text-sm text-[var(--muted)]">{t("admin.permissionCount", { count: details.rootPermissions.length })}</span>
            </div>
            {details.rootPermissions.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--muted)]">{t("admin.noRootPermissions")}</p>
            ) : (
              <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-[var(--line)]">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--panel)] text-[var(--muted)]">
                    <tr>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionCode")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionValue")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionSource")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionPriority")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.rootPermissions.map((permission) => (
                      <tr key={permission.code}>
                        <td className="border-b border-[var(--line)] px-3 py-2 font-mono">{permission.code}</td>
                        <td className={`border-b border-[var(--line)] px-3 py-2 font-mono font-bold ${permission.allow ? "text-[var(--accent)]" : "text-red-600"}`}>
                          {String(permission.allow)}
                        </td>
                        <td className="border-b border-[var(--line)] px-3 py-2 font-mono text-xs">{permission.source === "user" ? t("admin.directUserPermission") : permission.source}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2">{permission.priority >= 1_000_000_000 ? t("admin.highestPriority") : permission.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function AdminUserBalanceEditor({ token, userID }: { token: string; userID: string }) {
  const { locale, t } = useI18n();
  const [balances, setBalances] = useState<AdminUserBalance[]>([]);
  const [currencyCode, setCurrencyCode] = useState("");
  const [mode, setMode] = useState<"set" | "adjust">("set");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selected = balances.find((item) => item.code === currencyCode);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<{ items: AdminUserBalance[] }>(`/api/v1/admin/users/${userID}/balances`, {}, token)
      .then((result) => {
        if (cancelled) return;
        const items = result.items ?? [];
        setBalances(items);
        setCurrencyCode(items[0]?.code || "");
        setAmount(items[0] ? String(items[0].balance) : "");
      })
      .catch((error) => {
        if (!cancelled) notifyAdminNotice(cleanError(error), t("admin.userBalancesLoadFailed"), "danger");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t, token, userID]);

  async function saveBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount)) {
      notifyAdminNotice(t("admin.invalidBalanceAmount"), t("admin.noticeTitle"), "danger");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<{ balance: number }>(`/api/v1/admin/users/${userID}/balances`, {
        method: "POST",
        body: JSON.stringify({ currencyCode, mode, amount: parsedAmount, reason: reason.trim() }),
      }, token);
      setBalances((current) => current.map((item) => item.code === currencyCode ? { ...item, balance: result.balance } : item));
      setAmount(mode === "set" ? String(result.balance) : "");
      setReason("");
      notifyAdminNotice(t("admin.userBalanceSaved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-t border-[var(--line)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{t("admin.userBalances")}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.userBalancesHint")}</p>
        </div>
        {selected ? <strong className="rounded-lg bg-[var(--panel-subtle)] px-4 py-2 text-lg tabular-nums">{new Intl.NumberFormat(locale).format(selected.balance)} {selected.code}</strong> : null}
      </div>
      {loading ? <p className="mt-4 text-sm text-[var(--muted)]">{t("common.loading")}</p> : balances.length === 0 ? <p className="mt-4 text-sm text-[var(--muted)]">{t("admin.noActiveCurrencies")}</p> : (
        <form className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_150px_minmax(160px,1fr)_minmax(240px,2fr)_auto]" onSubmit={saveBalance}>
          <label className="text-sm font-semibold">{t("admin.currency")}
            <select className="field mt-2" value={currencyCode} onChange={(event) => {
              const nextCode = event.target.value;
              setCurrencyCode(nextCode);
              const nextBalance = balances.find((item) => item.code === nextCode)?.balance ?? 0;
              setAmount(mode === "set" ? String(nextBalance) : "");
            }}>
              {balances.map((item) => <option key={item.publicId} value={item.code}>{item.name || item.code} ({item.code})</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">{t("admin.balanceMode")}
            <select className="field mt-2" value={mode} onChange={(event) => {
              const nextMode = event.target.value as "set" | "adjust";
              setMode(nextMode);
              setAmount(nextMode === "set" ? String(selected?.balance ?? 0) : "");
            }}>
              <option value="set">{t("admin.setBalance")}</option>
              <option value="adjust">{t("admin.adjustBalance")}</option>
            </select>
          </label>
          <label className="text-sm font-semibold">{mode === "set" ? t("admin.targetBalance") : t("admin.balanceDelta")}
            <input className="field mt-2" required step="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="text-sm font-semibold">{t("admin.adjustmentReason")}
            <input className="field mt-2" maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button className="button-primary focus-ring self-end" disabled={saving || !currencyCode || !reason.trim()} type="submit">{saving ? t("admin.saving") : t("common.save")}</button>
        </form>
      )}
    </section>
  );
}

function UserDetailValue({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : ""}>
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatUserLocation(countryCode?: string, city?: string) {
  return [countryCode, city].filter(Boolean).join(" / ") || "-";
}

function SystemNotificationPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceLocale, setSourceLocale] = useState<Locale>(locale);
  const [sendEmail, setSendEmail] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPublishing(true);
    try {
      await apiRequest(
        "/api/v1/admin/notifications",
        { method: "POST", body: JSON.stringify({ title, body, sourceLocale, sendEmail }) },
        token,
      );
      setTitle("");
      setBody("");
      notifyAdminNotice(t("admin.notifications.queued"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="surface rounded-lg p-5">
      <div className="mb-5">
        <h2 className="text-xl font-bold">{t("admin.notifications.title")}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.notifications.description")}</p>
      </div>
      <form className="grid gap-4" onSubmit={publish}>
        <label className="text-sm font-semibold">
          {t("admin.notifications.sourceLanguage")}
          <select className="field mt-2" value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value as Locale)}>
            {supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("admin.notifications.notificationTitle")}
          <input className="field mt-2" maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          {t("admin.notifications.body")}
          <textarea className="field mt-2 min-h-56 resize-y" maxLength={10000} required value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-[var(--line)] p-4">
          <input checked={sendEmail} type="checkbox" onChange={(event) => setSendEmail(event.target.checked)} />
          <span>
            <span className="block font-semibold">{t("admin.notifications.sendEmail")}</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">{t("admin.notifications.sendEmailDescription")}</span>
          </span>
        </label>
        <div className="flex justify-end">
          <button className="button-primary focus-ring" disabled={publishing} type="submit">
            {publishing ? t("admin.notifications.publishing") : t("admin.notifications.publish")}
          </button>
        </div>
      </form>
    </section>
  );
}

type NotificationTemplateTranslation = { title: string; body: string };

type NotificationTemplateDefinition = {
  code: string;
  translations: Record<string, NotificationTemplateTranslation>;
};

function NotificationTemplatePanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [templates, setTemplates] = useState<NotificationTemplateDefinition[]>([]);
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale === "zh-CN" ? "en-US" : locale);
  const [loadedToken, setLoadedToken] = useState<string>();
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const savePending = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ templates: NotificationTemplateDefinition[] }>("/api/v1/admin/config/notifications", {}, token)
      .then((result) => {
        if (!Array.isArray(result.templates)) throw new Error("Invalid notification templates response");
        if (!cancelled) { setTemplates(result.templates); setLoadedToken(token); setLoadError(""); }
      })
      .catch((error) => { if (!cancelled) setLoadError(cleanError(error)); });
    return () => { cancelled = true; };
  }, [loadAttempt, token]);

  function updateTemplate(index: number, language: string, field: keyof NotificationTemplateTranslation, value: string) {
    setTemplates((current) => current.map((template, templateIndex) => {
      if (templateIndex !== index) return template;
      const translation = template.translations?.[language] ?? { title: "", body: "" };
      return { ...template, translations: { ...template.translations, [language]: { ...translation, [field]: value } } };
    }));
  }

  async function save() {
    if (loadedToken !== token || savePending.current) return;
    savePending.current = true;
    setSaving(true);
    try {
      const result = await apiRequest<{ templates: NotificationTemplateDefinition[] }>(
        "/api/v1/admin/config/notifications",
        { method: "PUT", body: JSON.stringify({ templates }) },
        token,
      );
      setTemplates(result.templates ?? []);
      notifyAdminNotice(t("admin.notificationTemplates.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  if (loadedToken !== token) return <section className="surface rounded-lg p-5" role="status"><p>{loadError || t("common.loading")}</p>{loadError ? <button className="button-secondary focus-ring mt-3" type="button" onClick={() => { setLoadError(""); setLoadAttempt((value) => value + 1); }}>{t("common.retry")}</button> : null}</section>;

  return <section className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-2xl font-black">{t("admin.notificationTemplates.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.notificationTemplates.description")}</p></div>
      <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button>
    </header>
    <div className="surface grid gap-4 rounded-lg p-4 sm:grid-cols-2">
      <label className="text-sm font-bold">{t("admin.notificationTemplates.sourceLanguage")}<select className="field mt-2" value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value as Locale)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      <label className="text-sm font-bold">{t("admin.notificationTemplates.targetLanguage")}<select className="field mt-2" value={targetLocale} onChange={(event) => setTargetLocale(event.target.value as Locale)}>{supportedLocales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
    </div>
    {templates.map((template, index) => {
      const source = template.translations?.[sourceLocale] ?? { title: "", body: "" };
      const target = template.translations?.[targetLocale] ?? { title: "", body: "" };
      return <section className="surface overflow-hidden rounded-lg" key={template.code}>
        <header className="border-b border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3"><code className="font-bold">{template.code}</code></header>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <TemplateTranslationEditor label={t("admin.notificationTemplates.sourceColumn")} value={source} onChange={(field, value) => updateTemplate(index, sourceLocale, field, value)} />
          <TemplateTranslationEditor label={t("admin.notificationTemplates.targetColumn")} value={target} onChange={(field, value) => updateTemplate(index, targetLocale, field, value)} />
        </div>
      </section>;
    })}
  </section>;
}

function TemplateTranslationEditor({ label, value, onChange }: { label: string; value: NotificationTemplateTranslation; onChange: (field: keyof NotificationTemplateTranslation, value: string) => void }) {
  const { t } = useI18n();
  return <div className="grid gap-3"><h3 className="font-black">{label}</h3><label className="text-sm font-bold">{t("admin.notificationTemplates.templateTitle")}<input className="field mt-2" value={value.title} onChange={(event) => onChange("title", event.target.value)} /></label><label className="text-sm font-bold">{t("admin.notificationTemplates.templateBody")}<textarea className="field mt-2 min-h-28 resize-y" value={value.body} onChange={(event) => onChange("body", event.target.value)} /></label></div>;
}

type ReviewSettings = {
  blueprintCreate: boolean;
  blueprintEdit: boolean;
  serverCreate: boolean;
  tutorialCreate: boolean;
  tutorialEdit: boolean;
  issueCreate: boolean;
  issueEdit: boolean;
  newsCreate: boolean;
  newsEdit: boolean;
  discussionCreate: boolean;
  discussionEdit: boolean;
  changelogCreate: boolean;
  changelogEdit: boolean;
  modCreate: boolean;
  modEdit: boolean;
  modpackCreate: boolean;
  modpackEdit: boolean;
  pluginCreate: boolean;
  pluginEdit: boolean;
  mapCreate: boolean;
  mapEdit: boolean;
  resourcePackCreate: boolean;
  resourcePackEdit: boolean;
  shaderPackCreate: boolean;
  shaderPackEdit: boolean;
  datapackCreate: boolean;
  datapackEdit: boolean;
  addonCreate: boolean;
  addonEdit: boolean;
  authorCreate: boolean;
  authorEdit: boolean;
  teamCreate: boolean;
  teamEdit: boolean;
  modContentSectionCreate: boolean;
};

function ReviewSettingsPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const reportLoadError = useEffectEvent((error: unknown) => notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger"));
  useEffect(() => {
    let cancelled = false;
    apiRequest<ReviewSettings>("/api/v1/admin/config/reviews", {}, token)
      .then((result) => { if (!cancelled) setSettings(result); })
      .catch((error) => { if (!cancelled) reportLoadError(error); });
    return () => { cancelled = true; };
  }, [token]);
  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      setSettings(await apiRequest<ReviewSettings>("/api/v1/admin/config/reviews", { method: "PUT", body: JSON.stringify(settings) }, token));
      notifyAdminNotice(t("admin.reviewSettings.saved"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }
  if (!settings) return <section className="surface rounded-lg p-5 font-bold text-[var(--muted)]">{t("common.loading")}</section>;
  const options: Array<{ key: keyof ReviewSettings; title: string; description: string }> = [
    { key: "blueprintCreate", title: t("admin.reviewSettings.blueprintCreate"), description: t("admin.reviewSettings.blueprintCreateDescription") },
    { key: "blueprintEdit", title: t("admin.reviewSettings.blueprintEdit"), description: t("admin.reviewSettings.blueprintEditDescription") },
    { key: "serverCreate", title: t("admin.reviewSettings.serverCreate"), description: t("admin.reviewSettings.serverCreateDescription") },
    { key: "tutorialCreate", title: t("admin.reviewSettings.tutorialCreate"), description: t("admin.reviewSettings.tutorialCreateDescription") },
    { key: "tutorialEdit", title: t("admin.reviewSettings.tutorialEdit"), description: t("admin.reviewSettings.tutorialEditDescription") },
    { key: "issueCreate", title: t("admin.reviewSettings.issueCreate"), description: t("admin.reviewSettings.issueCreateDescription") },
    { key: "issueEdit", title: t("admin.reviewSettings.issueEdit"), description: t("admin.reviewSettings.issueEditDescription") },
    { key: "newsCreate", title: t("admin.reviewSettings.newsCreate"), description: t("admin.reviewSettings.newsCreateDescription") },
    { key: "newsEdit", title: t("admin.reviewSettings.newsEdit"), description: t("admin.reviewSettings.newsEditDescription") },
    { key: "discussionCreate", title: t("admin.reviewSettings.discussionCreate"), description: t("admin.reviewSettings.discussionCreateDescription") },
    { key: "discussionEdit", title: t("admin.reviewSettings.discussionEdit"), description: t("admin.reviewSettings.discussionEditDescription") },
    { key: "changelogCreate", title: t("admin.reviewSettings.changelogCreate"), description: t("admin.reviewSettings.changelogCreateDescription") },
    { key: "changelogEdit", title: t("admin.reviewSettings.changelogEdit"), description: t("admin.reviewSettings.changelogEditDescription") },
    { key: "modCreate", title: t("admin.reviewSettings.modCreate"), description: t("admin.reviewSettings.modCreateDescription") },
    { key: "modEdit", title: t("admin.reviewSettings.modEdit"), description: t("admin.reviewSettings.modEditDescription") },
    { key: "modpackCreate", title: t("admin.reviewSettings.modpackCreate"), description: t("admin.reviewSettings.modpackCreateDescription") },
    { key: "modpackEdit", title: t("admin.reviewSettings.modpackEdit"), description: t("admin.reviewSettings.modpackEditDescription") },
    { key: "pluginCreate", title: t("admin.reviewSettings.pluginCreate"), description: t("admin.reviewSettings.pluginCreateDescription") },
    { key: "pluginEdit", title: t("admin.reviewSettings.pluginEdit"), description: t("admin.reviewSettings.pluginEditDescription") },
    { key: "mapCreate", title: t("admin.reviewSettings.mapCreate"), description: t("admin.reviewSettings.mapCreateDescription") },
    { key: "mapEdit", title: t("admin.reviewSettings.mapEdit"), description: t("admin.reviewSettings.mapEditDescription") },
    { key: "resourcePackCreate", title: t("admin.reviewSettings.resourcePackCreate"), description: t("admin.reviewSettings.resourcePackCreateDescription") },
    { key: "resourcePackEdit", title: t("admin.reviewSettings.resourcePackEdit"), description: t("admin.reviewSettings.resourcePackEditDescription") },
    { key: "shaderPackCreate", title: t("admin.reviewSettings.shaderPackCreate"), description: t("admin.reviewSettings.shaderPackCreateDescription") },
    { key: "shaderPackEdit", title: t("admin.reviewSettings.shaderPackEdit"), description: t("admin.reviewSettings.shaderPackEditDescription") },
    { key: "datapackCreate", title: t("admin.reviewSettings.datapackCreate"), description: t("admin.reviewSettings.datapackCreateDescription") },
    { key: "datapackEdit", title: t("admin.reviewSettings.datapackEdit"), description: t("admin.reviewSettings.datapackEditDescription") },
    { key: "addonCreate", title: t("admin.reviewSettings.addonCreate"), description: t("admin.reviewSettings.addonCreateDescription") },
    { key: "addonEdit", title: t("admin.reviewSettings.addonEdit"), description: t("admin.reviewSettings.addonEditDescription") },
    { key: "authorCreate", title: t("admin.reviewSettings.authorCreate"), description: t("admin.reviewSettings.authorCreateDescription") },
    { key: "authorEdit", title: t("admin.reviewSettings.authorEdit"), description: t("admin.reviewSettings.authorEditDescription") },
    { key: "teamCreate", title: t("admin.reviewSettings.teamCreate"), description: t("admin.reviewSettings.teamCreateDescription") },
    { key: "teamEdit", title: t("admin.reviewSettings.teamEdit"), description: t("admin.reviewSettings.teamEditDescription") },
    { key: "modContentSectionCreate", title: t("admin.reviewSettings.modContentSectionCreate"), description: t("admin.reviewSettings.modContentSectionCreateDescription") },
  ];
  return <section className="space-y-4"><header className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-black">{t("admin.reviewSettings.title")}</h2><p className="mt-1 text-sm text-[var(--muted)]">{t("admin.reviewSettings.description")}</p></div><button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button></header><div className="surface divide-y divide-[var(--line)] rounded-lg px-5">{options.map((option) => <label className="flex items-center justify-between gap-5 py-5" key={option.key}><span><span className="block font-black">{option.title}</span><span className="mt-1 block text-sm text-[var(--muted)]">{option.description}</span></span><input checked={settings[option.key]} type="checkbox" onChange={(event) => setSettings((current) => current ? { ...current, [option.key]: event.target.checked } : current)} /></label>)}</div></section>;
}

function isResourceDataPageTranslationKey(key: string) {
  return key.startsWith("mods.detail.dataCategories.") || key.startsWith("mods.detail.dataDescriptions.");
}

function TranslationManagerPanel({ token }: { token: string }) {
  const {
    locale,
    t,
    translationKeys,
    getTranslation,
    getBaseTranslation,
    getOwnTranslation,
    setTranslation,
    getTranslationEditVersion,
    setTranslationsIfUnchanged,
    resetTranslation,
  } = useI18n();
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [aiCompleting, setAICompleting] = useState(false);
  const completionGeneration = useRef(0);
  useEffect(() => () => { completionGeneration.current += 1; }, [token]);

  const visibleKeys = translationKeys.filter((key) => {
    if (isResourceDataPageTranslationKey(key)) return false;
    const keyword = query.trim().toLowerCase();
    const targetOwn = getOwnTranslation(targetLocale, key);
    if (missingOnly && targetOwn.trim() !== "") return false;
    if (!keyword) return true;
    return (
      key.toLowerCase().includes(keyword) ||
      getTranslation(sourceLocale, key).toLowerCase().includes(keyword) ||
      targetOwn.toLowerCase().includes(keyword)
    );
  });

  function saveTranslation(key: string, value: string) {
    setTranslation(targetLocale, key, value);
  }

  async function completeMissingTranslations() {
    if (sourceLocale === targetLocale) {
      notifyAdminNotice(t("admin.ai.sameLanguage"), t("admin.noticeTitle"), "danger");
      return;
    }
    const candidates = visibleKeys
      .filter((key) => getOwnTranslation(targetLocale, key).trim() === "" && getTranslation(sourceLocale, key).trim() !== "")
      .slice(0, 100);
    if (candidates.length === 0) {
      notifyAdminNotice(t("admin.ai.noMissingTranslations"));
      return;
    }
    const requestedGeneration = completionGeneration.current;
    const editVersion = getTranslationEditVersion();
    const sourceTexts = new Map(candidates.map((key) => [key, getTranslation(sourceLocale, key)]));
    setAICompleting(true);
    try {
      const result = await runAITranslationTask(token, aiTranslationTaskTypes.i18n, {
        sourceLocale,
        targetLocale,
        items: candidates.map((key) => ({ key, text: getTranslation(sourceLocale, key) })),
      });
      if (requestedGeneration !== completionGeneration.current) return;
      const translations: Record<string, string> = {};
      for (const item of result.items ?? []) {
        const value = item.text?.trim() ?? "";
        const source = sourceTexts.get(item.key);
        if (source && value && hasSameI18nPlaceholders(source, value)) translations[item.key] = value;
      }
      if (setTranslationsIfUnchanged(editVersion, targetLocale, translations)) {
        notifyAdminNotice(t("admin.ai.translationCompleted", { count: Object.keys(translations).length }));
      } else notifyAdminNotice(t("admin.ai.protectedEdits"));
    } catch (error) {
      if (requestedGeneration === completionGeneration.current) notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setAICompleting(false);
    }
  }

  return (
    <section className="surface rounded-lg">
      <div className="grid gap-3 border-b border-[var(--line)] p-4 lg:grid-cols-[1fr_220px_220px]">
        <div>
          <h2 className="text-lg font-bold">{t("admin.translationManager")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.i18nDesc")}</p>
        </div>
        <label className="text-sm font-semibold">
          {t("admin.sourceLanguage")}
          <select
            className="field mt-2"
            value={sourceLocale}
            onChange={(event) => setSourceLocale(event.target.value as Locale)}
          >
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("admin.targetLanguage")}
            <select
              className="field mt-2"
              value={targetLocale}
              onChange={(event) => setTargetLocale(event.target.value as Locale)}
            >
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-b border-[var(--line)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="field min-w-0 flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${t("common.search")} key / text`}
          />
          <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold">
            <input checked={missingOnly} type="checkbox" onChange={(event) => setMissingOnly(event.target.checked)} />
            {t("admin.missingOnly")}
          </label>
          <button className="button-primary focus-ring whitespace-nowrap" disabled={aiCompleting} type="button" onClick={completeMissingTranslations}>
            {aiCompleting ? t("admin.ai.completingTranslation") : t("admin.ai.completeTranslation")}
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-18rem)] overflow-auto">
        <table className="w-full min-w-[960px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-64" />
            <col />
            <col />
            <col className="w-28" />
          </colgroup>
          <thead className="sticky top-0 bg-[var(--panel)] text-[var(--muted)]">
            <tr>
              <th className="border-b border-[var(--line)] px-4 py-3 align-bottom">{t("admin.translationKey")}</th>
              <th className="border-b border-[var(--line)] px-4 py-3 align-bottom">{t("admin.sourceText")}</th>
              <th className="border-b border-[var(--line)] px-4 py-3 align-bottom">{t("admin.targetText")}</th>
              <th className="whitespace-nowrap border-b border-[var(--line)] px-4 py-3 align-bottom">{t("common.edit")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleKeys.map((key) => {
              const baseTarget = getBaseTranslation(targetLocale, key);
              const target = getOwnTranslation(targetLocale, key);
              const edited = target !== "" && target !== baseTarget;
              return (
                <tr key={key}>
                  <td className="break-all border-b border-[var(--line)] px-4 py-4 align-top font-mono text-xs leading-5">{key}</td>
                  <td className="whitespace-pre-wrap break-words border-b border-[var(--line)] px-4 py-4 align-top leading-6">{getTranslation(sourceLocale, key)}</td>
                  <td className="border-b border-[var(--line)] px-4 py-4 align-top">
                    <textarea
                      key={`${targetLocale}:${key}`}
                      className="field min-h-24 resize-y leading-6"
                      value={target}
                      placeholder={target ? "" : t("admin.missingTranslation")}
                      onChange={(event) => saveTranslation(key, event.currentTarget.value)}
                    />
                    {edited ? <span className="mt-1 block text-xs text-[var(--accent)]">{t("admin.editedLocally")}</span> : null}
                  </td>
                  <td className="border-b border-[var(--line)] px-4 py-4 align-top">
                    <button className="button-secondary focus-ring whitespace-nowrap" type="button" onClick={() => resetTranslation(targetLocale, key)}>
                      {t("admin.resetTranslation")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export { UsersPanelV2, SystemNotificationPanel, NotificationTemplatePanel, ReviewSettingsPanel, TranslationManagerPanel };
