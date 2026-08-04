"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import {
  Currency,
  EconomyOverview,
  ShopItem,
  TaskDefinition,
  translatedRecord,
} from "../_lib/community-api";
import { useI18n } from "../_lib/i18n-provider";
import { CatalogResourceIconValue } from "./catalog-resource-icon";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";

type ProfileSettingsResult = {
  profileBackgroundUrl: string;
};

export function UserEconomyPanel({
  token,
  onBackgroundChange,
}: {
  token: string;
  onBackgroundChange: (url: string) => void;
}) {
  const { locale, t } = useI18n();
  const [overview, setOverview] = useState<EconomyOverview | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [recipient, setRecipient] = useState("");
  const [transferCurrency, setTransferCurrency] = useState("");
  const [transferAmount, setTransferAmount] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextOverview, currencyResponse, shopResponse, taskResponse] = await Promise.all([
        apiRequest<EconomyOverview>("/api/v1/users/me/economy", {}, token),
        apiRequest<{ items: Currency[] }>("/api/v1/economy/currencies", {}, token),
        apiRequest<{ items: ShopItem[] }>("/api/v1/shop/items", {}, token),
        apiRequest<{ items: TaskDefinition[] }>("/api/v1/users/me/tasks", {}, token),
      ]);
      setOverview(nextOverview);
      setCurrencies(currencyResponse.items);
      setShopItems(shopResponse.items);
      setTasks(taskResponse.items);
      setTransferCurrency((current) => current || nextOverview.balances[0]?.code || "");
    } catch (error) {
      notifySite(errorMessage(error, t("user.economyLoadFailed")), t("user.economyAndProgression"), "danger");
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const currencyByCode = useMemo(
    () => new Map(currencies.map((currency) => [currency.code, currency])),
    [currencies],
  );

  async function checkIn() {
    setBusy("checkin");
    try {
      const result = await apiRequest<{ amount: number; currency: string }>(
        "/api/v1/users/me/economy/checkin",
        { method: "POST" },
        token,
      );
      notifySite(
        t("user.checkinSuccess", {
          amount: result.amount,
          currency: currencyName(currencyByCode.get(result.currency), locale),
        }),
        t("user.dailyCheckin"),
        "success",
      );
      await load();
    } catch (error) {
      notifySite(errorMessage(error, t("user.checkinFailed")), t("user.dailyCheckin"), "danger");
    } finally {
      setBusy("");
    }
  }

  async function transfer(event: FormEvent) {
    event.preventDefault();
    if (!recipient.trim() || !transferCurrency || transferAmount <= 0) return;
    setBusy("transfer");
    try {
      const result = await apiRequest<{ tax: number; received: number }>(
        "/api/v1/users/me/economy/transfer",
        {
          method: "POST",
          body: JSON.stringify({
            recipient: recipient.trim(),
            currency: transferCurrency,
            amount: transferAmount,
          }),
        },
        token,
      );
      notifySite(
        t("user.transferSuccess", { received: result.received, tax: result.tax }),
        t("user.transfer"),
        "success",
      );
      setRecipient("");
      setTransferAmount(1);
      await load();
    } catch (error) {
      notifySite(errorMessage(error, t("user.transferFailed")), t("user.transfer"), "danger");
    } finally {
      setBusy("");
    }
  }

  async function purchase(item: ShopItem) {
    setBusy(`purchase:${item.code}`);
    try {
      await apiRequest(
        "/api/v1/users/me/shop/purchase",
        { method: "POST", body: JSON.stringify({ itemCode: item.code, quantity: 1 }) },
        token,
      );
      notifySite(t("user.purchaseSuccess", { name: localizedName(item, locale) }), t("user.shop"), "success");
      await load();
    } catch (error) {
      notifySite(errorMessage(error, t("user.purchaseFailed")), t("user.shop"), "danger");
    } finally {
      setBusy("");
    }
  }

  async function applyProfileBackground(item: ShopItem, file: File) {
    setBusy(`use:${item.code}`);
    try {
      const uploaded = await uploadUserFileToOSS(file, token, "profile_background");
      await apiRequest(
        "/api/v1/users/me/shop/use",
        { method: "POST", body: JSON.stringify({ itemCode: item.code, fileId: uploaded.id }) },
        token,
      );
      const settings = await apiRequest<ProfileSettingsResult>("/api/v1/users/me/profile-settings", {}, token);
      onBackgroundChange(settings.profileBackgroundUrl);
      notifySite(t("user.profileBackgroundUpdated"), t("user.shop"), "success");
      await load();
    } catch (error) {
      notifySite(errorMessage(error, t("user.itemUseFailed")), t("user.shop"), "danger");
    } finally {
      setBusy("");
    }
  }

  if (loading && !overview) {
    return <section className="surface rounded-lg p-12 text-center font-bold text-[var(--muted)]">{t("common.loading")}</section>;
  }

  return (
    <section className="grid gap-4">
      <div className="surface rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">{t("user.economyAndProgression")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("user.economyDescription", { timezone: overview?.timezone || "UTC" })}
            </p>
          </div>
          <button className="button-secondary focus-ring" disabled={loading} type="button" onClick={() => void load()}>
            {t("common.refresh")}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={t("user.currentLevel")} value={String(overview?.level ?? 0)} />
          <Metric label={t("user.experience")} value={formatNumber(overview?.experience ?? 0, locale)} />
          {(overview?.balances ?? []).map((balance) => (
            <Metric
              key={balance.code}
              label={currencyName(currencyByCode.get(balance.code), locale, balance.name)}
              value={formatNumber(balance.balance, locale)}
              icon={balance.icon}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="surface rounded-lg p-5">
          <h3 className="text-lg font-black">{t("user.dailyCheckin")}</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {overview?.checkin.enabled
              ? t("user.checkinReward", {
                  amount: overview.checkin.amount,
                  currency: currencyName(currencyByCode.get(overview.checkin.currency), locale),
                })
              : t("user.checkinDisabled")}
          </p>
          {overview?.checkin.eligibleAt && !overview.checkin.checkedInToday ? (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {t("user.checkinEligibleAt", { time: new Date(overview.checkin.eligibleAt).toLocaleString(locale) })}
            </p>
          ) : null}
          <button
            className="button-primary focus-ring mt-5"
            disabled={
              !overview?.checkin.enabled ||
              overview.checkin.checkedInToday ||
              busy === "checkin"
            }
            type="button"
            onClick={() => void checkIn()}
          >
            {overview?.checkin.checkedInToday ? t("user.checkedInToday") : t("user.checkinNow")}
          </button>
        </section>

        <section className="surface rounded-lg p-5">
          <h3 className="text-lg font-black">{t("user.transfer")}</h3>
          <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={transfer}>
            <label className="grid gap-2 sm:col-span-2">
              <span className="text-sm font-bold">{t("user.transferRecipient")}</span>
              <input
                className="field"
                placeholder={t("user.transferRecipientPlaceholder")}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">{t("user.transferCurrency")}</span>
              <select
                className="field"
                value={transferCurrency}
                onChange={(event) => setTransferCurrency(event.target.value)}
              >
                {(overview?.balances ?? []).map((balance) => (
                  <option key={balance.code} value={balance.code}>
                    {currencyName(currencyByCode.get(balance.code), locale, balance.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">{t("user.transferAmount")}</span>
              <input
                className="field"
                min={1}
                type="number"
                value={transferAmount}
                onChange={(event) => setTransferAmount(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            <p className="text-xs text-[var(--muted)] sm:col-span-2">
              {t("user.transferTax", {
                rate: ((currencyByCode.get(transferCurrency)?.transferTaxBps ?? 0) / 100).toFixed(2),
              })}
            </p>
            <button
              className="button-primary focus-ring justify-self-start"
              disabled={!recipient.trim() || !transferCurrency || busy === "transfer"}
              type="submit"
            >
              {t("user.confirmTransfer")}
            </button>
          </form>
        </section>
      </div>

      <section className="surface rounded-lg p-5">
        <h3 className="text-lg font-black">{t("user.tasks")}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("user.tasksDescription")}</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {tasks.map((task) => {
            const target = Math.max(1, Number(task.condition.target ?? 1));
            const progress = Math.max(0, Number(task.progress ?? 0));
            const percent = Math.min(100, Math.round((progress / target) * 100));
            return (
              <article className="rounded-lg border border-[var(--line)] p-4" key={task.publicId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <ItemIcon icon={task.icon} name={localizedName(task, locale)} />
                    <div className="min-w-0">
                      <h4 className="font-black">{localizedName(task, locale)}</h4>
                      <p className="mt-1 text-sm text-[var(--muted)]">{localizedDescription(task, locale)}</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-xs font-bold">
                    {t(`user.taskPeriods.${task.refreshPeriod}`)}
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--panel-subtle)]">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                  <span>{t("user.taskProgress", { progress, target })}</span>
                  <span>{task.rewardedAt ? t("user.taskRewarded") : percent >= 100 ? t("user.taskCompleted") : rewardText(task, currencyByCode, locale, t)}</span>
                </div>
              </article>
            );
          })}
          {tasks.length === 0 ? <EmptyState>{t("user.noTasks")}</EmptyState> : null}
        </div>
      </section>

      <section className="surface rounded-lg p-5">
        <h3 className="text-lg font-black">{t("user.shop")}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("user.shopDescription")}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shopItems.map((item) => {
            const quantity = item.inventoryQuantity ?? 0;
            const name = localizedName(item, locale);
            return (
              <article className="flex min-h-64 flex-col rounded-lg border border-[var(--line)] p-4" key={item.publicId}>
                <div className="flex items-center gap-3">
                  <ItemIcon icon={item.icon} name={name} />
                  <div className="min-w-0">
                    <h4 className="truncate font-black">{name}</h4>
                    <p className="text-xs text-[var(--muted)]">{t("user.inventoryQuantity", { count: quantity })}</p>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
                  {localizedDescription(item, locale)}
                </p>
                <div className="mt-auto pt-5">
                  <p className="font-black text-[var(--accent)]">
                    {item.priceAmount} {currencyName(currencyByCode.get(item.priceCurrency), locale, item.priceCurrency)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="button-primary focus-ring"
                      disabled={!item.canPurchase || busy === `purchase:${item.code}`}
                      type="button"
                      onClick={() => void purchase(item)}
                    >
                      {t("user.purchase")}
                    </button>
                    {item.itemType === "profile_background" && quantity > 0 ? (
                      <label className={`button-secondary focus-ring cursor-pointer ${item.canUse ? "" : "pointer-events-none opacity-50"}`}>
                        {t("user.uploadAndUse")}
                        <input
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          disabled={!item.canUse || busy === `use:${item.code}`}
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void applyProfileBackground(item, file);
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                  {!item.canPurchase && quantity === 0 ? (
                    <p className="mt-2 text-xs font-bold text-[var(--muted)]">{t("user.shopPermissionRequired")}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
          {shopItems.length === 0 ? <EmptyState>{t("user.noShopItems")}</EmptyState> : null}
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
        {icon ? <CatalogResourceIconValue className="h-6 w-6" fallbackName={label} value={icon} /> : null}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

function ItemIcon({ icon, name }: { icon: string; name: string }) {
  return <CatalogResourceIconValue className="h-12 w-12" fallbackName={name} value={icon} />;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm font-bold text-[var(--muted)]">{children}</div>;
}

function localizedName(item: Pick<ShopItem | TaskDefinition, "name" | "translations">, locale: string) {
  return translatedRecord(item.translations, locale, "name", item.name);
}

function localizedDescription(
  item: Pick<ShopItem | TaskDefinition, "description" | "translations">,
  locale: string,
) {
  return translatedRecord(item.translations, locale, "description", item.description);
}

function currencyName(currency: Currency | undefined, locale: string, fallback = "") {
  if (!currency) return fallback;
  return translatedRecord(currency.translations, locale, "name", currency.name);
}

function rewardText(
  task: TaskDefinition,
  currencies: Map<string, Currency>,
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const parts: string[] = [];
  if ((task.rewards.experience ?? 0) > 0) {
    parts.push(t("user.experienceReward", { amount: task.rewards.experience ?? 0 }));
  }
  for (const [code, amount] of Object.entries(task.rewards.currencies ?? {})) {
    parts.push(`${amount} ${currencyName(currencies.get(code), locale, code)}`);
  }
  return parts.length ? parts.join(" + ") : t("user.noTaskReward");
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(Math.max(0, value));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
