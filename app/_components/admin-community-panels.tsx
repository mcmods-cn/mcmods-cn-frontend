"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import {
  ActivityEvent,
  CreatorClaim,
  Currency,
  EconomyConfig,
  LevelConfig,
  ShopItem,
  TaskDefinition,
  translatedRecord,
} from "../_lib/community-api";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";

type RoleTrack = {
  code: string;
  name: string;
  description: string;
  roles: string[];
};

type TranslationFields = {
  name: string;
  description: string;
};

const emptyTranslation: TranslationFields = { name: "", description: "" };

const emptyCurrency: Currency = {
  publicId: "",
  code: "",
  name: "",
  description: "",
  icon: "",
  translations: {},
  transferTaxBps: 0,
  status: "active",
  displayOrder: 0,
};

const emptyShopItem: ShopItem = {
  publicId: "",
  code: "",
  itemType: "profile_background",
  name: "",
  description: "",
  icon: "",
  translations: {},
  priceCurrency: "diamond",
  priceAmount: 10,
  purchasePermission: "",
  usePermission: "",
  config: {},
  status: "active",
};

const emptyTask: TaskDefinition = {
  publicId: "",
  code: "",
  name: "",
  description: "",
  icon: "",
  translations: {},
  refreshPeriod: "never",
  condition: {
    action: "view",
    objectType: "mod",
    metric: "count",
    target: 1,
    objectPublicId: "",
  },
  rewards: {
    experience: 0,
    currencies: {},
  },
  status: "active",
};

export function CreatorClaimsPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<CreatorClaim[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{ items: CreatorClaim[] }>("/api/v1/admin/creator-claims", {}, token);
      setItems(response.items);
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.loadFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useInitialLoad(load);

  async function review(item: CreatorClaim, status: "approved" | "rejected") {
    setReviewing(item.id);
    try {
      await apiRequest(
        `/api/v1/admin/creator-claims/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, note: notes[item.id] ?? "" }),
        },
        token,
      );
      setItems((current) => current.filter((claim) => claim.id !== item.id));
      notifyAdmin(
        status === "approved" ? t("admin.community.claimApproved") : t("admin.community.claimRejected"),
        t("admin.noticeTitle"),
      );
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.saveFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setReviewing(null);
    }
  }

  return (
    <AdminPanel
      title={t("admin.community.creatorClaims")}
      description={t("admin.community.creatorClaimsDescription")}
      action={
        <button className="button-secondary focus-ring" type="button" onClick={() => void load()}>
          {t("common.refresh")}
        </button>
      }
    >
      {loading ? <PanelState>{t("common.loading")}</PanelState> : null}
      {!loading && items.length === 0 ? <PanelState>{t("admin.community.noCreatorClaims")}</PanelState> : null}
      <div className="grid gap-4">
        {items.map((item) => (
          <article className="rounded-lg border border-[var(--line)] p-4" key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-[var(--accent)]">
                  {item.kind === "team" ? t("creators.kinds.team") : t("creators.kinds.author")}
                </p>
                <h3 className="mt-1 text-lg font-black">{item.name}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {item.displayName || item.username} / @{item.username} / UID {item.userId}
                </p>
              </div>
              <time className="text-sm text-[var(--muted)]">{formatDateTime(item.createdAt)}</time>
            </div>
            <div className="mt-4 rounded-lg bg-[var(--panel-subtle)] p-4 text-sm whitespace-pre-wrap">
              {item.proofMarkdown || t("admin.community.noClaimProof")}
            </div>
            <label className="mt-4 grid gap-2">
              <span className="text-sm font-bold">{t("admin.community.reviewNote")}</span>
              <textarea
                className="field min-h-24"
                value={notes[item.id] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="button-secondary focus-ring"
                disabled={reviewing === item.id}
                type="button"
                onClick={() => void review(item, "rejected")}
              >
                {t("admin.reviews.reject")}
              </button>
              <button
                className="button-primary focus-ring"
                disabled={reviewing === item.id}
                type="button"
                onClick={() => void review(item, "approved")}
              >
                {t("admin.reviews.approve")}
              </button>
            </div>
          </article>
        ))}
      </div>
    </AdminPanel>
  );
}

export function ActivityMonitorPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({
    userId: "",
    action: "",
    objectType: "",
    objectPublicId: "",
    from: "",
    to: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const pageSize = 100;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
      if (appliedFilters.userId.trim()) query.set("userId", appliedFilters.userId.trim());
      if (appliedFilters.action) query.set("action", appliedFilters.action);
      if (appliedFilters.objectType) query.set("objectType", appliedFilters.objectType);
      if (appliedFilters.objectPublicId.trim()) query.set("objectPublicId", appliedFilters.objectPublicId.trim());
      if (appliedFilters.from) query.set("from", new Date(appliedFilters.from).toISOString());
      if (appliedFilters.to) query.set("to", new Date(appliedFilters.to).toISOString());
      const response = await apiRequest<{ items: ActivityEvent[] }>(
        `/api/v1/admin/activity?${query.toString()}`,
        {},
        token,
      );
      setItems(response.items);
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.loadFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, offset, t, token]);

  useInitialLoad(load);

  function submit(event: FormEvent) {
    event.preventDefault();
    setAppliedFilters(filters);
    setOffset(0);
  }

  return (
    <AdminPanel title={t("admin.community.activity")} description={t("admin.community.activityDescription")}>
      <form className="grid gap-3 border-b border-[var(--line)] pb-5 lg:grid-cols-4" onSubmit={submit}>
        <Field label={t("admin.community.userId")}>
          <input
            className="field"
            inputMode="numeric"
            value={filters.userId}
            onChange={(event) => setFilters({ ...filters, userId: event.target.value })}
          />
        </Field>
        <Field label={t("admin.community.action")}>
          <select
            className="field"
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
          >
            <option value="">{t("common.all")}</option>
            {activityActions.map((value) => (
              <option key={value} value={value}>
                {t(`admin.community.actions.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("admin.community.objectType")}>
          <select
            className="field"
            value={filters.objectType}
            onChange={(event) => setFilters({ ...filters, objectType: event.target.value })}
          >
            <option value="">{t("common.all")}</option>
            {activityObjectTypes.map((value) => (
              <option key={value} value={value}>
                {t(`admin.community.objects.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("admin.community.objectPublicId")}>
          <input
            className="field font-mono"
            value={filters.objectPublicId}
            onChange={(event) => setFilters({ ...filters, objectPublicId: event.target.value })}
          />
        </Field>
        <Field label={t("admin.community.from")}>
          <input
            className="field"
            type="datetime-local"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
        </Field>
        <Field label={t("admin.community.to")}>
          <input
            className="field"
            type="datetime-local"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
        </Field>
        <div className="flex items-end gap-2 lg:col-span-2">
          <button className="button-primary focus-ring" type="submit">
            {t("common.search")}
          </button>
          <button
            className="button-secondary focus-ring"
            type="button"
            onClick={() => {
              const cleared = { userId: "", action: "", objectType: "", objectPublicId: "", from: "", to: "" };
              setFilters(cleared);
              setAppliedFilters(cleared);
              setOffset(0);
            }}
          >
            {t("common.clear")}
          </button>
        </div>
      </form>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-[var(--muted)]">
              <th className="px-3 py-3">{t("admin.community.time")}</th>
              <th className="px-3 py-3">{t("admin.community.user")}</th>
              <th className="px-3 py-3">{t("admin.community.action")}</th>
              <th className="px-3 py-3">{t("admin.community.objectType")}</th>
              <th className="px-3 py-3">{t("admin.community.objectPublicId")}</th>
              <th className="px-3 py-3">{t("admin.community.markdownAddedBytes")}</th>
              <th className="px-3 py-3">{t("admin.community.metadata")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-b border-[var(--line)] align-top" key={item.id}>
                <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(item.occurredAt)}</td>
                <td className="px-3 py-3">
                  <span className="font-bold">{item.username || t("admin.community.anonymous")}</span>
                  {item.userId ? <span className="block text-xs text-[var(--muted)]">UID {item.userId}</span> : null}
                </td>
                <td className="px-3 py-3">{item.actionName || item.action}</td>
                <td className="px-3 py-3">{item.objectTypeName || item.objectType}</td>
                <td className="px-3 py-3 font-mono text-xs">{item.objectPublicId || "-"}</td>
                <td className="px-3 py-3">{item.markdownAddedBytes.toLocaleString()}</td>
                <td className="max-w-80 px-3 py-3 font-mono text-xs break-all">
                  {Object.keys(item.metadata ?? {}).length ? JSON.stringify(item.metadata) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <PanelState>{t("common.loading")}</PanelState> : null}
        {!loading && items.length === 0 ? <PanelState>{t("admin.community.noActivity")}</PanelState> : null}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-[var(--muted)]">
          {t("admin.community.activityRange", { start: offset + 1, end: offset + items.length })}
        </span>
        <div className="flex gap-2">
          <button
            className="button-secondary focus-ring"
            disabled={offset === 0 || loading}
            type="button"
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            {t("common.previous")}
          </button>
          <button
            className="button-secondary focus-ring"
            disabled={items.length < pageSize || loading}
            type="button"
            onClick={() => setOffset(offset + pageSize)}
          >
            {t("common.next")}
          </button>
        </div>
      </div>
    </AdminPanel>
  );
}

export function EconomyConfigPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [config, setConfig] = useState<EconomyConfig | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextConfig, response] = await Promise.all([
        apiRequest<EconomyConfig>("/api/v1/admin/economy/config", {}, token),
        apiRequest<{ items: Currency[] }>("/api/v1/admin/economy/currencies", {}, token),
      ]);
      setConfig(nextConfig);
      setCurrencies(response.items);
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.loadFailed")), t("admin.noticeTitle"), "danger");
    }
  }, [t, token]);

  useInitialLoad(load);

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const saved = await apiRequest<EconomyConfig>(
        "/api/v1/admin/economy/config",
        { method: "PUT", body: JSON.stringify(config) },
        token,
      );
      setConfig(saved);
      notifyAdmin(t("admin.community.economySaved"), t("admin.noticeTitle"));
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.saveFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return <PanelState>{t("common.loading")}</PanelState>;
  }

  return (
    <AdminPanel
      title={t("admin.community.economyConfig")}
      description={t("admin.community.economyConfigDescription")}
      action={
        <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      }
    >
      <section>
        <h3 className="text-lg font-black">{t("admin.community.checkin")}</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <label className="flex min-h-12 items-center gap-3 rounded-lg border border-[var(--line)] px-4">
            <input
              checked={config.checkin.enabled}
              type="checkbox"
              onChange={(event) =>
                setConfig({ ...config, checkin: { ...config.checkin, enabled: event.target.checked } })
              }
            />
            <span className="font-bold">{t("common.enabled")}</span>
          </label>
          <Field label={t("admin.community.currency")}>
            <select
              className="field"
              value={config.checkin.currency}
              onChange={(event) =>
                setConfig({ ...config, checkin: { ...config.checkin, currency: event.target.value } })
              }
            >
              {currencies.map((currency) => (
                <option key={currency.publicId} value={currency.code}>
                  {translatedRecord(currency.translations, locale, "name", currency.name)} ({currency.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("admin.community.rewardAmount")}>
            <input
              className="field"
              min={0}
              type="number"
              value={config.checkin.amount}
              onChange={(event) =>
                setConfig({ ...config, checkin: { ...config.checkin, amount: numberValue(event.target.value) } })
              }
            />
          </Field>
          <Field label={t("admin.community.minimumHours")}>
            <input
              className="field"
              min={1}
              max={48}
              type="number"
              value={config.checkin.minimumHours}
              onChange={(event) =>
                setConfig({
                  ...config,
                  checkin: { ...config.checkin, minimumHours: numberValue(event.target.value) },
                })
              }
            />
          </Field>
        </div>
      </section>

      <section className="mt-8 border-t border-[var(--line)] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">{t("admin.community.downloadRewards")}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.community.downloadRewardsDescription")}</p>
          </div>
          <button
            className="button-secondary focus-ring"
            type="button"
            onClick={() =>
              setConfig({
                ...config,
                downloadRewards: [
                  ...config.downloadRewards,
                  {
                    objectType: "mod",
                    currency: currencies[0]?.code ?? "gold_nugget",
                    downloadsPerReward: 100,
                    amount: 1,
                  },
                ],
              })
            }
          >
            {t("common.add")}
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {config.downloadRewards.map((reward, index) => (
            <div
              className="grid gap-3 rounded-lg border border-[var(--line)] p-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
              key={`${reward.objectType}-${index}`}
            >
              <select
                aria-label={t("admin.community.objectType")}
                className="field"
                value={reward.objectType}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    downloadRewards: updateAt(config.downloadRewards, index, {
                      ...reward,
                      objectType: event.target.value,
                    }),
                  })
                }
              >
                {rewardObjectTypes.map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.community.objects.${value}`)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("admin.community.currency")}
                className="field"
                value={reward.currency}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    downloadRewards: updateAt(config.downloadRewards, index, {
                      ...reward,
                      currency: event.target.value,
                    }),
                  })
                }
              >
                {currencies.map((currency) => (
                  <option key={currency.publicId} value={currency.code}>
                    {translatedRecord(currency.translations, locale, "name", currency.name)}
                  </option>
                ))}
              </select>
              <input
                aria-label={t("admin.community.downloadsPerReward")}
                className="field"
                min={1}
                type="number"
                value={reward.downloadsPerReward}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    downloadRewards: updateAt(config.downloadRewards, index, {
                      ...reward,
                      downloadsPerReward: numberValue(event.target.value),
                    }),
                  })
                }
              />
              <input
                aria-label={t("admin.community.rewardAmount")}
                className="field"
                min={1}
                type="number"
                value={reward.amount}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    downloadRewards: updateAt(config.downloadRewards, index, {
                      ...reward,
                      amount: numberValue(event.target.value),
                    }),
                  })
                }
              />
              <button
                className="button-secondary focus-ring"
                type="button"
                onClick={() =>
                  setConfig({
                    ...config,
                    downloadRewards: config.downloadRewards.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
              >
                {t("common.delete")}
              </button>
            </div>
          ))}
          {config.downloadRewards.length === 0 ? (
            <PanelState>{t("admin.community.noDownloadRewards")}</PanelState>
          ) : null}
        </div>
      </section>
    </AdminPanel>
  );
}

export function CurrencyManagementPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<Currency[]>([]);
  const [draft, setDraft] = useState<Currency>({ ...emptyCurrency });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await apiRequest<{ items: Currency[] }>("/api/v1/admin/economy/currencies", {}, token);
      setItems(response.items);
      setDraft((current) => {
        const selected = response.items.find((item) => item.publicId === current.publicId);
        return selected ? cloneCurrency(selected) : current.publicId ? { ...emptyCurrency } : current;
      });
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.loadFailed")), t("admin.noticeTitle"), "danger");
    }
  }, [t, token]);

  useInitialLoad(load);

  async function save() {
    setSaving(true);
    try {
      const path = draft.publicId
        ? `/api/v1/admin/economy/currencies/${draft.publicId}`
        : "/api/v1/admin/economy/currencies";
      const saved = await apiRequest<Currency>(
        path,
        { method: draft.publicId ? "PUT" : "POST", body: JSON.stringify(draft) },
        token,
      );
      setDraft(cloneCurrency(saved));
      await load();
      notifyAdmin(t("admin.community.currencySaved"), t("admin.noticeTitle"));
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.saveFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPanel
      title={t("admin.community.currencies")}
      description={t("admin.community.currenciesDescription")}
      action={
        <button className="button-secondary focus-ring" type="button" onClick={() => setDraft({ ...emptyCurrency })}>
          {t("admin.community.newCurrency")}
        </button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <SelectionList
          emptyText={t("admin.community.noCurrencies")}
          items={items.map((item) => ({
            id: item.publicId,
            title: translatedRecord(item.translations, locale, "name", item.name),
            subtitle: `${item.code} / ${item.status}`,
          }))}
          selectedId={draft.publicId}
          onSelect={(publicId) => {
            const selected = items.find((item) => item.publicId === publicId);
            if (selected) setDraft(cloneCurrency(selected));
          }}
        />
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("admin.community.code")}>
              <input
                className="field font-mono"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.icon")}>
              <input
                className="field"
                value={draft.icon}
                onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.name")}>
              <input
                className="field"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.status")}>
              <select
                className="field"
                value={draft.status}
                onChange={(event) => setDraft({ ...draft, status: event.target.value as Currency["status"] })}
              >
                <option value="active">{t("admin.active")}</option>
                <option value="disabled">{t("admin.disabled")}</option>
              </select>
            </Field>
            <Field label={t("admin.community.transferTaxBps")}>
              <input
                className="field"
                min={0}
                max={10000}
                type="number"
                value={draft.transferTaxBps}
                onChange={(event) => setDraft({ ...draft, transferTaxBps: numberValue(event.target.value) })}
              />
            </Field>
            <Field label={t("admin.community.displayOrder")}>
              <input
                className="field"
                type="number"
                value={draft.displayOrder}
                onChange={(event) => setDraft({ ...draft, displayOrder: numberValue(event.target.value) })}
              />
            </Field>
          </div>
          <Field label={t("admin.community.description")}>
            <textarea
              className="field min-h-24"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          <LocalizedFieldsEditor
            baseName={draft.name}
            baseDescription={draft.description}
            translations={draft.translations}
            onChange={(translations) => setDraft({ ...draft, translations })}
          />
          <div className="flex justify-end">
            <button
              className="button-primary focus-ring"
              disabled={saving || !draft.code.trim() || !draft.name.trim()}
              type="button"
              onClick={() => void save()}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </AdminPanel>
  );
}

export function ShopManagementPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [draft, setDraft] = useState<ShopItem>({ ...emptyShopItem });
  const [configText, setConfigText] = useState("{}");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [shopResponse, currencyResponse] = await Promise.all([
        apiRequest<{ items: ShopItem[] }>("/api/v1/admin/shop/items", {}, token),
        apiRequest<{ items: Currency[] }>("/api/v1/admin/economy/currencies", {}, token),
      ]);
      setItems(shopResponse.items);
      setCurrencies(currencyResponse.items);
      setDraft((current) => {
        const selected = shopResponse.items.find((item) => item.publicId === current.publicId);
        if (!selected) return current.publicId ? { ...emptyShopItem } : current;
        return cloneShopItem(selected);
      });
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.loadFailed")), t("admin.noticeTitle"), "danger");
    }
  }, [t, token]);

  useInitialLoad(load);

  function selectItem(publicId: string) {
    const selected = items.find((item) => item.publicId === publicId);
    if (!selected) return;
    setDraft(cloneShopItem(selected));
    setConfigText(JSON.stringify(selected.config ?? {}, null, 2));
  }

  async function save() {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configText || "{}") as Record<string, unknown>;
    } catch {
      notifyAdmin(t("admin.community.invalidJson"), t("admin.noticeTitle"), "danger");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, config };
      const path = draft.publicId ? `/api/v1/admin/shop/items/${draft.publicId}` : "/api/v1/admin/shop/items";
      const saved = await apiRequest<ShopItem>(
        path,
        { method: draft.publicId ? "PUT" : "POST", body: JSON.stringify(payload) },
        token,
      );
      setDraft(cloneShopItem(saved));
      setConfigText(JSON.stringify(saved.config ?? {}, null, 2));
      await load();
      notifyAdmin(t("admin.community.shopItemSaved"), t("admin.noticeTitle"));
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.saveFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPanel
      title={t("admin.community.shopItems")}
      description={t("admin.community.shopItemsDescription")}
      action={
        <button
          className="button-secondary focus-ring"
          type="button"
          onClick={() => {
            setDraft({
              ...emptyShopItem,
              priceCurrency: currencies[0]?.code ?? "diamond",
            });
            setConfigText("{}");
          }}
        >
          {t("admin.community.newShopItem")}
        </button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <SelectionList
          emptyText={t("admin.community.noShopItems")}
          items={items.map((item) => ({
            id: item.publicId,
            title: translatedRecord(item.translations, locale, "name", item.name),
            subtitle: `${item.code} / ${item.status}`,
          }))}
          selectedId={draft.publicId}
          onSelect={selectItem}
        />
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("admin.community.code")}>
              <input
                className="field font-mono"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.itemType")}>
              <select
                className="field"
                value={draft.itemType}
                onChange={(event) => setDraft({ ...draft, itemType: event.target.value })}
              >
                <option value="profile_background">{t("admin.community.profileBackgroundItem")}</option>
              </select>
            </Field>
            <Field label={t("admin.community.name")}>
              <input
                className="field"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.icon")}>
              <input
                className="field"
                value={draft.icon}
                onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.priceCurrency")}>
              <select
                className="field"
                value={draft.priceCurrency}
                onChange={(event) => setDraft({ ...draft, priceCurrency: event.target.value })}
              >
                {currencies.map((currency) => (
                  <option key={currency.publicId} value={currency.code}>
                    {translatedRecord(currency.translations, locale, "name", currency.name)} ({currency.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("admin.community.priceAmount")}>
              <input
                className="field"
                min={0}
                type="number"
                value={draft.priceAmount}
                onChange={(event) => setDraft({ ...draft, priceAmount: numberValue(event.target.value) })}
              />
            </Field>
            <Field label={t("admin.community.purchasePermission")}>
              <input
                className="field font-mono"
                value={draft.purchasePermission}
                onChange={(event) => setDraft({ ...draft, purchasePermission: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.usePermission")}>
              <input
                className="field font-mono"
                value={draft.usePermission}
                onChange={(event) => setDraft({ ...draft, usePermission: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.status")}>
              <select
                className="field"
                value={draft.status}
                onChange={(event) => setDraft({ ...draft, status: event.target.value as ShopItem["status"] })}
              >
                <option value="active">{t("admin.active")}</option>
                <option value="disabled">{t("admin.disabled")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("admin.community.description")}>
            <textarea
              className="field min-h-24"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          <LocalizedFieldsEditor
            baseName={draft.name}
            baseDescription={draft.description}
            translations={draft.translations}
            onChange={(translations) => setDraft({ ...draft, translations })}
          />
          <Field label={t("admin.community.itemConfig")}>
            <textarea
              className="field min-h-28 font-mono text-xs"
              spellCheck={false}
              value={configText}
              onChange={(event) => setConfigText(event.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <button
              className="button-primary focus-ring"
              disabled={saving || !draft.code.trim() || !draft.name.trim()}
              type="button"
              onClick={() => void save()}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </AdminPanel>
  );
}

export function LevelConfigPanel({ token }: { token: string }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [tracks, setTracks] = useState<RoleTrack[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextConfig, nextTracks] = await Promise.all([
        apiRequest<LevelConfig>("/api/v1/admin/levels/config", {}, token),
        apiRequest<RoleTrack[]>("/api/v1/admin/role-tracks", {}, token),
      ]);
      setConfig(nextConfig);
      setTracks(nextTracks);
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.loadFailed")), t("admin.noticeTitle"), "danger");
    }
  }, [t, token]);

  useInitialLoad(load);

  const selectedTrack = tracks.find((track) => track.code === config?.roleTrackCode);

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const saved = await apiRequest<LevelConfig>(
        "/api/v1/admin/levels/config",
        { method: "PUT", body: JSON.stringify(config) },
        token,
      );
      setConfig(saved);
      notifyAdmin(t("admin.community.levelSaved"), t("admin.noticeTitle"));
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.saveFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <PanelState>{t("common.loading")}</PanelState>;

  return (
    <AdminPanel
      title={t("admin.community.levelConfig")}
      description={t("admin.community.levelConfigDescription")}
      action={
        <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      }
    >
      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
        <h3 className="font-black">{t("admin.community.roleTrack")}</h3>
        <p className="mt-2 font-mono text-sm">
          {selectedTrack ? `${selectedTrack.name} (${selectedTrack.code})` : t("admin.community.noRoleTrack")}
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">{t("admin.community.roleTrackManagedInPermissionSettings")}</p>
      </section>
      {selectedTrack ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-[var(--line)]">
          <div className="grid grid-cols-[90px_minmax(180px,1fr)_minmax(160px,240px)] gap-3 bg-[var(--panel-subtle)] px-4 py-3 text-sm font-black">
            <span>{t("admin.community.level")}</span>
            <span>{t("admin.community.permissionGroup")}</span>
            <span>{t("admin.community.requiredExperience")}</span>
          </div>
          {selectedTrack.roles.map((role, index) => (
            <div
              className="grid grid-cols-[90px_minmax(180px,1fr)_minmax(160px,240px)] items-center gap-3 border-t border-[var(--line)] px-4 py-3"
              key={role}
            >
              <strong>{index + 1}</strong>
              <span className="font-mono text-sm">{role}</span>
              <input
                aria-label={t("admin.community.requiredExperience")}
                className="field"
                min={0}
                type="number"
                value={config.levelThresholds[index] ?? 0}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    levelThresholds: updateAt(
                      config.levelThresholds,
                      index,
                      numberValue(event.target.value),
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <PanelState>{t("admin.community.selectRoleTrack")}</PanelState>
      )}
    </AdminPanel>
  );
}

export function TaskManagementPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<TaskDefinition[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [draft, setDraft] = useState<TaskDefinition>(cloneTask(emptyTask));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskResponse, currencyResponse] = await Promise.all([
        apiRequest<{ items: TaskDefinition[] }>("/api/v1/admin/tasks", {}, token),
        apiRequest<{ items: Currency[] }>("/api/v1/admin/economy/currencies", {}, token),
      ]);
      setItems(taskResponse.items);
      setCurrencies(currencyResponse.items);
      setDraft((current) => {
        const selected = taskResponse.items.find((item) => item.publicId === current.publicId);
        return selected ? cloneTask(selected) : current.publicId ? cloneTask(emptyTask) : current;
      });
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.loadFailed")), t("admin.noticeTitle"), "danger");
    }
  }, [t, token]);

  useInitialLoad(load);

  async function save() {
    setSaving(true);
    try {
      const path = draft.publicId ? `/api/v1/admin/tasks/${draft.publicId}` : "/api/v1/admin/tasks";
      const saved = await apiRequest<TaskDefinition>(
        path,
        { method: draft.publicId ? "PUT" : "POST", body: JSON.stringify(draft) },
        token,
      );
      setDraft(cloneTask(saved));
      await load();
      notifyAdmin(t("admin.community.taskSaved"), t("admin.noticeTitle"));
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.saveFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft.publicId || !window.confirm(t("admin.community.deleteTaskConfirm", { name: draft.name }))) return;
    setSaving(true);
    try {
      await apiRequest(`/api/v1/admin/tasks/${draft.publicId}`, { method: "DELETE" }, token);
      setDraft(cloneTask(emptyTask));
      await load();
      notifyAdmin(t("admin.community.taskDeleted"), t("admin.noticeTitle"));
    } catch (error) {
      notifyAdmin(errorMessage(error, t("admin.community.saveFailed")), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  const currencyRewards = useMemo(
    () => Object.entries(draft.rewards.currencies ?? {}),
    [draft.rewards.currencies],
  );

  return (
    <AdminPanel
      title={t("admin.community.tasks")}
      description={t("admin.community.tasksDescription")}
      action={
        <button className="button-secondary focus-ring" type="button" onClick={() => setDraft(cloneTask(emptyTask))}>
          {t("admin.community.newTask")}
        </button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <SelectionList
          emptyText={t("admin.community.noTasks")}
          items={items.map((item) => ({
            id: item.publicId,
            title: translatedRecord(item.translations, locale, "name", item.name),
            subtitle: `${item.code} / ${item.refreshPeriod}`,
          }))}
          selectedId={draft.publicId}
          onSelect={(publicId) => {
            const selected = items.find((item) => item.publicId === publicId);
            if (selected) setDraft(cloneTask(selected));
          }}
        />
        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("admin.community.code")}>
              <input
                className="field font-mono"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.name")}>
              <input
                className="field"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.icon")}>
              <input
                className="field"
                value={draft.icon}
                onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
              />
            </Field>
            <Field label={t("admin.community.refreshPeriod")}>
              <select
                className="field"
                value={draft.refreshPeriod}
                onChange={(event) =>
                  setDraft({ ...draft, refreshPeriod: event.target.value as TaskDefinition["refreshPeriod"] })
                }
              >
                {taskRefreshPeriods.map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.community.refreshPeriods.${value}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("admin.community.status")}>
              <select
                className="field"
                value={draft.status}
                onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskDefinition["status"] })}
              >
                <option value="active">{t("admin.active")}</option>
                <option value="disabled">{t("admin.disabled")}</option>
              </select>
            </Field>
          </div>
          <Field label={t("admin.community.description")}>
            <textarea
              className="field min-h-24"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          <LocalizedFieldsEditor
            baseName={draft.name}
            baseDescription={draft.description}
            translations={draft.translations}
            onChange={(translations) => setDraft({ ...draft, translations })}
          />

          <section className="rounded-lg border border-[var(--line)] p-4">
            <h3 className="font-black">{t("admin.community.taskCondition")}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label={t("admin.community.action")}>
                <select
                  className="field"
                  value={draft.condition.action ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, condition: { ...draft.condition, action: event.target.value } })
                  }
                >
                  {activityActions.map((value) => (
                    <option key={value} value={value}>
                      {t(`admin.community.actions.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("admin.community.objectType")}>
                <select
                  className="field"
                  value={draft.condition.objectType ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, condition: { ...draft.condition, objectType: event.target.value } })
                  }
                >
                  {activityObjectTypes.map((value) => (
                    <option key={value} value={value}>
                      {t(`admin.community.objects.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("admin.community.metric")}>
                <select
                  className="field"
                  value={draft.condition.metric ?? "count"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      condition: {
                        ...draft.condition,
                        metric: event.target.value as "count" | "markdown_bytes",
                      },
                    })
                  }
                >
                  <option value="count">{t("admin.community.metrics.count")}</option>
                  <option value="markdown_bytes">{t("admin.community.metrics.markdown_bytes")}</option>
                </select>
              </Field>
              <Field label={t("admin.community.target")}>
                <input
                  className="field"
                  min={1}
                  type="number"
                  value={draft.condition.target ?? 1}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      condition: { ...draft.condition, target: numberValue(event.target.value) },
                    })
                  }
                />
              </Field>
              <Field label={t("admin.community.objectPublicIdOptional")}>
                <input
                  className="field font-mono"
                  value={draft.condition.objectPublicId ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      condition: { ...draft.condition, objectPublicId: event.target.value },
                    })
                  }
                />
              </Field>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--line)] p-4">
            <h3 className="font-black">{t("admin.community.taskRewards")}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label={t("admin.community.experience")}>
                <input
                  className="field"
                  min={0}
                  type="number"
                  value={draft.rewards.experience ?? 0}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      rewards: { ...draft.rewards, experience: numberValue(event.target.value) },
                    })
                  }
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-3">
              {currencyRewards.map(([code, amount]) => (
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" key={code}>
                  <select
                    className="field"
                    value={code}
                    onChange={(event) => {
                      const next = { ...(draft.rewards.currencies ?? {}) };
                      delete next[code];
                      next[event.target.value] = amount;
                      setDraft({ ...draft, rewards: { ...draft.rewards, currencies: next } });
                    }}
                  >
                    {currencies.map((currency) => (
                      <option key={currency.publicId} value={currency.code}>
                        {translatedRecord(currency.translations, locale, "name", currency.name)}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field"
                    min={1}
                    type="number"
                    value={amount}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        rewards: {
                          ...draft.rewards,
                          currencies: {
                            ...(draft.rewards.currencies ?? {}),
                            [code]: numberValue(event.target.value),
                          },
                        },
                      })
                    }
                  />
                  <button
                    className="button-secondary focus-ring"
                    type="button"
                    onClick={() => {
                      const next = { ...(draft.rewards.currencies ?? {}) };
                      delete next[code];
                      setDraft({ ...draft, rewards: { ...draft.rewards, currencies: next } });
                    }}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ))}
              <button
                className="button-secondary focus-ring justify-self-start"
                disabled={currencies.length === 0 || currencyRewards.length >= currencies.length}
                type="button"
                onClick={() => {
                  const nextCurrency = currencies.find(
                    (currency) => !(currency.code in (draft.rewards.currencies ?? {})),
                  );
                  if (!nextCurrency) return;
                  setDraft({
                    ...draft,
                    rewards: {
                      ...draft.rewards,
                      currencies: { ...(draft.rewards.currencies ?? {}), [nextCurrency.code]: 1 },
                    },
                  });
                }}
              >
                {t("admin.community.addCurrencyReward")}
              </button>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            {draft.publicId ? (
              <button className="button-secondary focus-ring" disabled={saving} type="button" onClick={() => void remove()}>
                {t("common.delete")}
              </button>
            ) : null}
            <button
              className="button-primary focus-ring"
              disabled={saving || !draft.code.trim() || !draft.name.trim()}
              type="button"
              onClick={() => void save()}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </AdminPanel>
  );
}

function AdminPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface rounded-lg">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] p-5">
        <div>
          <h2 className="text-xl font-black">{title}</h2>
          <p className="mt-1 max-w-4xl text-sm text-[var(--muted)]">{description}</p>
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid content-start gap-2">
      <span className="text-sm font-bold">{label}</span>
      {children}
    </label>
  );
}

function PanelState({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-sm font-bold text-[var(--muted)]">{children}</div>;
}

function SelectionList({
  items,
  selectedId,
  emptyText,
  onSelect,
}: {
  items: Array<{ id: string; title: string; subtitle: string }>;
  selectedId: string;
  emptyText: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <div className="rounded-lg border border-[var(--line)] p-5 text-sm text-[var(--muted)]">{emptyText}</div>;
  }
  return (
    <aside className="grid max-h-[70vh] content-start gap-2 overflow-y-auto rounded-lg border border-[var(--line)] p-2">
      {items.map((item) => (
        <button
          className={`focus-ring rounded-lg px-3 py-3 text-left ${
            selectedId === item.id ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--panel-subtle)]"
          }`}
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
        >
          <span className="block truncate font-black">{item.title}</span>
          <span className="mt-1 block truncate text-xs opacity-75">{item.subtitle}</span>
        </button>
      ))}
    </aside>
  );
}

function LocalizedFieldsEditor({
  baseName,
  baseDescription,
  translations,
  onChange,
}: {
  baseName: string;
  baseDescription: string;
  translations: Record<string, unknown>;
  onChange: (translations: Record<string, unknown>) => void;
}) {
  const { locale, t } = useI18n();
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(() => (locale === "zh-CN" ? "en-US" : locale));
  const source = referenceTranslationFields(translations, sourceLocale, baseName, baseDescription);
  const target = translationFields(translations, targetLocale);

  return (
    <section className="rounded-lg border border-[var(--line)] p-4">
      <h3 className="font-black">{t("admin.community.localizedContent")}</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">{t("admin.community.localizedContentDescription")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="field w-auto py-2"
          value={sourceLocale}
          onChange={(event) => setSourceLocale(event.target.value as Locale)}
        >
          {supportedLocales.map((item) => (
            <option key={item.code} value={item.code}>
              {t("admin.sourceLanguage")}: {item.label}
            </option>
          ))}
        </select>
        <select
          className="field w-auto py-2"
          value={targetLocale}
          onChange={(event) => setTargetLocale(event.target.value as Locale)}
        >
          {supportedLocales.map((item) => (
            <option key={item.code} value={item.code}>
              {t("admin.targetLanguage")}: {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-3 rounded-md bg-[var(--panel-subtle)] p-4">
          <strong>{sourceLocale} {t("admin.reference")}</strong>
          <div className="font-bold">{source.name || t("admin.emptyTranslation")}</div>
          <div className="whitespace-pre-wrap text-sm text-[var(--muted)]">
            {source.description || t("admin.emptyTranslation")}
          </div>
        </div>
        <div className="grid gap-3">
          <strong>{targetLocale}</strong>
          <input
            key={`${targetLocale}:name`}
            aria-label={`${targetLocale} ${t("admin.community.name")}`}
            className="field"
            placeholder={t("admin.community.name")}
            value={target.name}
            onChange={(event) =>
              onChange(setTranslationFields(translations, targetLocale, { ...target, name: event.target.value }))
            }
          />
          <textarea
            key={`${targetLocale}:description`}
            aria-label={`${targetLocale} ${t("admin.community.description")}`}
            className="field min-h-24"
            placeholder={t("admin.community.description")}
            value={target.description}
            onChange={(event) =>
              onChange(setTranslationFields(translations, targetLocale, { ...target, description: event.target.value }))
            }
          />
        </div>
      </div>
    </section>
  );
}

function referenceTranslationFields(
  translations: Record<string, unknown>,
  locale: Locale,
  baseName: string,
  baseDescription: string,
): TranslationFields {
  const exact = translationFields(translations, locale);
  if (exact.name || exact.description) return exact;
  const baseText = `${baseName} ${baseDescription}`.trim();
  if (!baseText || inferTranslationLocale(baseText) !== locale) return emptyTranslation;
  return { name: baseName, description: baseDescription };
}

function inferTranslationLocale(text: string): Locale {
  if (/[\u3040-\u30ff]/.test(text)) return "ja-JP";
  if (/[\u3400-\u9fff]/.test(text)) return "zh-CN";
  return "en-US";
}

function translationFields(translations: Record<string, unknown>, locale: Locale): TranslationFields {
  const value = translations[locale];
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyTranslation;
  const record = value as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : "",
    description: typeof record.description === "string" ? record.description : "",
  };
}

function setTranslationFields(
  translations: Record<string, unknown>,
  locale: string,
  value: TranslationFields,
): Record<string, unknown> {
  return { ...translations, [locale]: value };
}

function useInitialLoad(load: () => Promise<void>) {
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
}

function updateAt<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function cloneCurrency(item: Currency): Currency {
  return {
    ...item,
    translations: ensureBaseTranslation(item.translations, item.name, item.description),
  };
}

function cloneShopItem(item: ShopItem): ShopItem {
  return {
    ...item,
    translations: ensureBaseTranslation(item.translations, item.name, item.description),
    config: structuredCloneSafe(item.config),
  };
}

function cloneTask(item: TaskDefinition): TaskDefinition {
  return {
    ...item,
    translations: ensureBaseTranslation(item.translations, item.name, item.description),
    condition: { ...item.condition },
    rewards: {
      ...item.rewards,
      currencies: { ...(item.rewards.currencies ?? {}) },
    },
  };
}

function ensureBaseTranslation(
  translations: Record<string, unknown>,
  name: string,
  description: string,
): Record<string, unknown> {
  const result = structuredCloneSafe(translations);
  const baseText = `${name} ${description}`.trim();
  if (!baseText) return result;
  const locale = inferTranslationLocale(baseText);
  const current = translationFields(result, locale);
  return setTranslationFields(result, locale, {
    name: current.name || name,
    description: current.description || description,
  });
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function notifyAdmin(message: string, title: string, tone: "info" | "danger" = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mcmods-admin-notice", { detail: { message, title, tone } }));
}

const activityActions = [
  "edit",
  "create",
  "view",
  "delete",
  "claim",
  "download",
  "upload",
  "purchase",
  "transfer",
  "checkin",
  "use",
] as const;

const activityObjectTypes = [
  "recipe",
  "mod",
  "blueprint",
  "plugin",
  "author",
  "team",
  "user",
  "comment",
  "tag",
  "file",
  "economy",
  "task",
  "shop_item",
] as const;

const rewardObjectTypes = ["mod", "blueprint", "plugin", "map", "resource_pack", "skin"] as const;
const taskRefreshPeriods = ["never", "daily", "weekly", "monthly"] as const;
