"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, apiRequest } from "../_lib/api";
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
import type { CatalogResourceRef } from "../_lib/editor-types";
import { ModResourcePickerDialog, type ProjectResourceType } from "./editor/mod-resource-picker";

type ProfileSettingsResult = {
  profileBackgroundUrl: string;
};

type CurrencyTransaction = {
  currency: Pick<Currency, "publicId" | "code" | "name" | "icon">;
  amountDelta: number;
  balanceAfter: number;
  transactionType: string;
  counterparty: { publicId: string; username: string };
  referenceType: string;
  referenceKey: string;
  createdAt: string;
};

type ExperienceTransaction = {
  amountDelta: number;
  experienceAfter: number;
  reason: string;
  referenceType: string;
  referenceKey: string;
  createdAt: string;
};

type TransactionPage<T> = { items: T[]; nextCursor: string };

const economySections = ["overview", "currencies", "shop", "tasks", "currencyHistory", "experienceHistory"] as const;
type EconomySection = (typeof economySections)[number];

export function UserEconomyPanel({
  token,
  onBackgroundChange,
}: {
  token: string;
  onBackgroundChange: (url: string) => void;
}) {
  const { locale, t } = useI18n();
  const query = useSearchParams();
  const targetType = query.get("objectType") || "";
  const targetId = query.get("publicId") || "";
  const targetDOMId = targetId && ["currency", "task", "shop_item"].includes(targetType) ? `economy-${targetType}-${targetId}` : "";
  const [overview, setOverview] = useState<EconomyOverview | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [currencyTransactions, setCurrencyTransactions] = useState<CurrencyTransaction[]>([]);
  const [experienceTransactions, setExperienceTransactions] = useState<ExperienceTransaction[]>([]);
  const [currencyCursor, setCurrencyCursor] = useState("");
  const [experienceCursor, setExperienceCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientType, setRecipientType] = useState<"identifier" | "public_id">("identifier");
  const recipientHintId = useId();
  const [transferCurrency, setTransferCurrency] = useState("");
  const [transferAmount, setTransferAmount] = useState(1);
  const [heatBoostItem, setHeatBoostItem] = useState<ShopItem | null>(null);
  const [usingBackground, setUsingBackground] = useState(false);
  const [refreshingBackground, setRefreshingBackground] = useState(false);
  const [backgroundRefreshFailed, setBackgroundRefreshFailed] = useState(false);
  const [failedSections, setFailedSections] = useState<EconomySection[]>([]);
  const mounted = useRef(false);
  const currentLoad = useRef<AbortController | null>(null);
  const currentTransfer = useRef<AbortController | null>(null);
  const activeOperation = useRef("");
  const actionsBusy = Boolean(busy) || usingBackground || loading;
  const backgroundUseInFlight = useRef(false);
  const backgroundPreviewRequest = useRef<AbortController | null>(null);
  const backgroundUseVersion = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      currentLoad.current?.abort();
      currentTransfer.current?.abort();
      backgroundPreviewRequest.current?.abort();
    };
  }, []);

  const load = useCallback(async (sections: readonly EconomySection[] = economySections) => {
    currentLoad.current?.abort();
    const controller = new AbortController();
    currentLoad.current = controller;
    const { signal } = controller;
    const shopVersion = backgroundUseVersion.current;
    const failed: EconomySection[] = [];
    setLoading(true);
    async function read<T>(section: EconomySection, path: string, apply: (value: T) => void) {
      if (!sections.includes(section)) return;
      try {
        const value = await apiRequest<T>(path, { signal }, token);
        if (!signal.aborted) apply(value);
      } catch { if (!signal.aborted) failed.push(section); }
    }
    await Promise.all([
      read<EconomyOverview>("overview", "/api/v1/users/me/economy", value => {
        setOverview(value);
        setTransferCurrency(current => value.balances.some(balance => balance.code === current) ? current : value.balances[0]?.code || "");
      }),
      read<{ items: Currency[] }>("currencies", "/api/v1/economy/currencies", value => setCurrencies(value.items)),
      read<{ items: ShopItem[] }>("shop", "/api/v1/shop/items", value => {
        if (backgroundUseVersion.current === shopVersion) setShopItems(value.items);
      }),
      read<{ items: TaskDefinition[] }>("tasks", "/api/v1/users/me/tasks", value => setTasks(value.items)),
      read<TransactionPage<CurrencyTransaction>>("currencyHistory", "/api/v1/users/me/economy/transactions", value => {
        setCurrencyTransactions(value.items); setCurrencyCursor(value.nextCursor);
      }),
      read<TransactionPage<ExperienceTransaction>>("experienceHistory", "/api/v1/users/me/experience/transactions", value => {
        setExperienceTransactions(value.items); setExperienceCursor(value.nextCursor);
      }),
    ]);
    if (!signal.aborted) {
      setFailedSections(previous => [...previous.filter(section => !sections.includes(section)), ...failed]);
      setLoading(false);
      currentLoad.current = null;
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const currencyByCode = useMemo(
    () => new Map(currencies.map((currency) => [currency.code, currency])),
    [currencies],
  );

  function beginOperation(action: string) {
    if (activeOperation.current || currentLoad.current || backgroundUseInFlight.current) return false;
    activeOperation.current = action;
    setBusy(action);
    return true;
  }

  function endOperation() {
    activeOperation.current = "";
    if (mounted.current) setBusy("");
  }

  async function loadMoreCurrencyTransactions() {
    if (!currencyCursor) return;
    if (!beginOperation("currency-history")) return;
    try {
      const page = await apiRequest<TransactionPage<CurrencyTransaction>>(
        `/api/v1/users/me/economy/transactions?cursor=${encodeURIComponent(currencyCursor)}`,
        {},
        token,
      );
      if (!mounted.current) return;
      setCurrencyTransactions((current) => [...current, ...page.items]);
      setCurrencyCursor(page.nextCursor);
    } catch (error) {
      if (mounted.current) notifySite(errorMessage(error, t("user.transactionHistoryFailed")), t("user.transactionHistory"), "danger");
    } finally {
      endOperation();
    }
  }

  async function loadMoreExperienceTransactions() {
    if (!experienceCursor) return;
    if (!beginOperation("experience-history")) return;
    try {
      const page = await apiRequest<TransactionPage<ExperienceTransaction>>(
        `/api/v1/users/me/experience/transactions?cursor=${encodeURIComponent(experienceCursor)}`,
        {},
        token,
      );
      if (!mounted.current) return;
      setExperienceTransactions((current) => [...current, ...page.items]);
      setExperienceCursor(page.nextCursor);
    } catch (error) {
      if (mounted.current) notifySite(errorMessage(error, t("user.transactionHistoryFailed")), t("user.experienceHistory"), "danger");
    } finally {
      endOperation();
    }
  }

  async function checkIn() {
    if (!beginOperation("checkin")) return;
    try {
      const result = await apiRequest<{ amount: number; currency: string }>(
        "/api/v1/users/me/economy/checkin",
        { method: "POST" },
        token,
      );
      if (!mounted.current) return;
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
      if (mounted.current) notifySite(errorMessage(error, t("user.checkinFailed")), t("user.dailyCheckin"), "danger");
    } finally {
      endOperation();
    }
  }

  async function transfer(event: FormEvent) {
    event.preventDefault();
    if (!recipient.trim() || !currencyByCode.has(transferCurrency) || !Number.isSafeInteger(transferAmount) || transferAmount <= 0) return;
    if (!beginOperation("transfer")) return;
    try {
      const result = await apiRequest<{ tax: number; received: number }>(
        "/api/v1/users/me/economy/transfer",
        {
          method: "POST",
          body: JSON.stringify({
            ...(recipientType === "public_id" ? { recipientPublicId: recipient.trim() } : { recipient: recipient.trim() }),
            currency: transferCurrency,
            amount: transferAmount,
          }),
        },
        token,
      );
      if (!mounted.current) return;
      notifySite(
        t("user.transferSuccess", { received: result.received, tax: result.tax }),
        t("user.transfer"),
        "success",
      );
      setRecipient("");
      setTransferAmount(1);
      await load();
    } catch (error) {
      if (mounted.current) notifySite(error instanceof ApiError && error.code === "TRANSFER_RECIPIENT_AMBIGUOUS" ? t("user.transferRecipientAmbiguous") : errorMessage(error, t("user.transferFailed")), t("user.transfer"), "danger");
    } finally {
      endOperation();
    }
  }

  async function purchase(item: ShopItem) {
    if (!beginOperation(`purchase:${item.code}`)) return;
    try {
      await apiRequest(
        "/api/v1/users/me/shop/purchase",
        { method: "POST", body: JSON.stringify({ itemCode: item.code, quantity: 1 }) },
        token,
      );
      if (!mounted.current) return;
      notifySite(t("user.purchaseSuccess", { name: localizedName(item, locale) }), t("user.shop"), "success");
      await load();
    } catch (error) {
      if (mounted.current) notifySite(errorMessage(error, t("user.purchaseFailed")), t("user.shop"), "danger");
    } finally {
      endOperation();
    }
  }

  async function refreshProfileBackground() {
    if (!mounted.current || backgroundPreviewRequest.current) return;
    const controller = new AbortController();
    backgroundPreviewRequest.current = controller;
    setRefreshingBackground(true);
    try {
      const settings = await apiRequest<ProfileSettingsResult>("/api/v1/users/me/profile-settings", { signal: controller.signal }, token);
      if (controller.signal.aborted) return;
      onBackgroundChange(settings.profileBackgroundUrl);
      setBackgroundRefreshFailed(false);
    } catch {
      if (!controller.signal.aborted) setBackgroundRefreshFailed(true);
    } finally {
      backgroundPreviewRequest.current = null;
      if (!controller.signal.aborted) setRefreshingBackground(false);
    }
  }

  async function applyProfileBackground(item: ShopItem, file: File) {
    if (backgroundUseInFlight.current || backgroundPreviewRequest.current || activeOperation.current || currentLoad.current || !item.canUse) return;
    const controller = new AbortController();
    currentTransfer.current = controller;
    backgroundUseInFlight.current = true;
    setUsingBackground(true);
    try {
      const uploaded = await uploadUserFileToOSS(file, token, "profile_background", undefined, controller.signal);
      if (!mounted.current) return;
      const receipt = await apiRequest<{ remaining: number }>(
        "/api/v1/users/me/shop/use",
        { method: "POST", body: JSON.stringify({ itemCode: item.code, fileId: uploaded.id }) },
        token,
      );
      if (!mounted.current) return;
      backgroundUseVersion.current++;
      setShopItems((current) => current.map((entry) => entry.publicId === item.publicId
        ? { ...entry, inventoryQuantity: receipt.remaining }
        : entry));
      notifySite(t("user.profileBackgroundUpdated"), t("user.shop"), "success");
      await refreshProfileBackground();
    } catch (error) {
      if (mounted.current) notifySite(errorMessage(error, t("user.itemUseFailed")), t("user.shop"), "danger");
    } finally {
      currentTransfer.current = null;
      backgroundUseInFlight.current = false;
      if (mounted.current) setUsingBackground(false);
    }
  }

  async function applyHeatBoost(item: ShopItem, target: CatalogResourceRef) {
    if (!beginOperation(`use:${item.code}`)) return;
    try {
      await apiRequest(
        "/api/v1/users/me/shop/use",
        {
          method: "POST",
          body: JSON.stringify({
            itemCode: item.code,
            targetType: target.kind || target.registry,
            targetId: target.publicId,
          }),
        },
        token,
      );
      if (!mounted.current) return;
      setHeatBoostItem(null);
      notifySite(t("user.heatBoostApplied"), t("user.shop"), "success");
      await load();
    } catch (error) {
      if (mounted.current) notifySite(errorMessage(error, t("user.itemUseFailed")), t("user.shop"), "danger");
    } finally {
      endOperation();
    }
  }

  useEffect(() => {
    if (loading || !targetDOMId) return;
    const element = document.getElementById(targetDOMId);
    element?.scrollIntoView({ block: "center" });
    element?.focus({ preventScroll: true });
  }, [loading, targetDOMId]);

  const targetCurrency = targetType === "currency" ? currencies.find((item) => item.publicId === targetId) : undefined;
  const targetExists = targetType === "currency" ? Boolean(targetCurrency) : targetType === "task" ? tasks.some((item) => item.publicId === targetId) : targetType === "shop_item" ? shopItems.some((item) => item.publicId === targetId) : false;
  const targetSection = targetType === "currency" ? "currencies" : targetType === "task" ? "tasks" : "shop";
  const sectionLabels: Record<EconomySection, string> = { overview: t("user.economyAndProgression"), currencies: t("user.transferCurrency"), shop: t("user.shop"), tasks: t("user.tasks"), currencyHistory: t("user.transactionHistory"), experienceHistory: t("user.experienceHistory") };
  if (loading && !overview && !failedSections.length) {
    return <section className="surface rounded-lg p-12 text-center font-bold text-[var(--muted)]">{t("common.loading")}</section>;
  }

  return (
    <section className="grid gap-4">
      {failedSections.length > 0 && <div role="alert" className="surface rounded p-4">
        <p>{t("user.economyLoadFailed")} {failedSections.map(section => sectionLabels[section]).join(" · ")}</p>
        <button className="button-secondary focus-ring mt-2" disabled={actionsBusy} type="button" onClick={() => void load(failedSections)}>{t("common.retry")}</button>
      </div>}
      {targetDOMId && !loading && !failedSections.includes(targetSection) && !targetExists ? <p className="surface rounded p-4" role="alert">{t("user.economyObjectUnavailable")}</p> : null}
      {targetCurrency ? <article className="surface rounded-lg border-2 border-[var(--accent)] p-5" id={targetDOMId} tabIndex={-1}><h3 className="text-lg font-black">{currencyName(targetCurrency, locale)}</h3><p>{targetCurrency.description}</p><code>{targetCurrency.code}</code></article> : null}
      <div className="surface rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">{t("user.economyAndProgression")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {overview && t("user.economyDescription", { timezone: overview.timezone || "UTC" })}
            </p>
          </div>
          <button className="button-secondary focus-ring" disabled={actionsBusy} type="button" onClick={() => void load()}>
            {t("common.refresh")}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {overview && <Metric label={t("user.currentLevel")} value={String(overview.level)} />}
          {overview && <Metric label={t("user.experience")} value={formatNumber(overview.experience, locale)} />}
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
        <TransactionHistory
          title={t("user.transactionHistory")}
          empty={loading || failedSections.includes("currencyHistory") ? "" : t("user.noTransactions")}
          hasMore={Boolean(currencyCursor)}
          loading={actionsBusy}
          onLoadMore={() => void loadMoreCurrencyTransactions()}
        >
          {currencyTransactions.map((transaction, index) => (
            <HistoryRow
              key={`${transaction.createdAt}:${transaction.currency.code}:${index}`}
              amount={transaction.amountDelta}
              balance={transaction.balanceAfter}
              label={transactionLabel(transaction.transactionType, t)}
              detail={transaction.counterparty.username || transaction.referenceKey}
              icon={transaction.currency.icon}
              time={transaction.createdAt}
              locale={locale}
            />
          ))}
        </TransactionHistory>
        <TransactionHistory
          title={t("user.experienceHistory")}
          empty={loading || failedSections.includes("experienceHistory") ? "" : t("user.noExperienceTransactions")}
          hasMore={Boolean(experienceCursor)}
          loading={actionsBusy}
          onLoadMore={() => void loadMoreExperienceTransactions()}
        >
          {experienceTransactions.map((transaction, index) => (
            <HistoryRow
              key={`${transaction.createdAt}:${transaction.reason}:${index}`}
              amount={transaction.amountDelta}
              balance={transaction.experienceAfter}
              label={experienceReasonLabel(transaction.reason, t)}
              detail={transaction.referenceKey}
              time={transaction.createdAt}
              locale={locale}
            />
          ))}
        </TransactionHistory>
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
              : overview ? t("user.checkinDisabled") : null}
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
              actionsBusy || failedSections.includes("overview")
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
              <span className="text-sm font-bold">{t("user.transferRecipientType")}</span>
              <select aria-label={t("user.transferRecipientType")} className="field" value={recipientType} disabled={busy === "transfer"} onChange={(event) => setRecipientType(event.target.value as "identifier" | "public_id")}>
                <option value="identifier">{t("user.transferRecipientUsernameOrEmail")}</option>
                <option value="public_id">{t("user.transferRecipientPublicId")}</option>
              </select>
            </label>
            <label className="grid gap-2 sm:col-span-2">
              <span className="text-sm font-bold">{t("user.transferRecipient")}</span>
              <input
                className="field"
                aria-label={t("user.transferRecipient")}
                aria-describedby={recipientType === "public_id" ? recipientHintId : undefined}
                placeholder={t(recipientType === "public_id" ? "user.transferRecipientPublicIdPlaceholder" : "user.transferRecipientPlaceholder")}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
              />
              {recipientType === "public_id" ? <span id={recipientHintId} className="text-xs text-[var(--muted)]">{t("user.transferRecipientPublicIdHint")}</span> : null}
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
              {currencyByCode.has(transferCurrency) && t("user.transferTax", {
                rate: ((currencyByCode.get(transferCurrency)?.transferTaxBps ?? 0) / 100).toFixed(2),
              })}
            </p>
            <button
              className="button-primary focus-ring justify-self-start"
              disabled={!recipient.trim() || !currencyByCode.has(transferCurrency) || !Number.isSafeInteger(transferAmount) || transferAmount <= 0 || actionsBusy || failedSections.includes("overview") || failedSections.includes("currencies")}
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
              <article className={`rounded-lg border p-4 ${targetId === task.publicId && targetType === "task" ? "border-[var(--accent)]" : "border-[var(--line)]"}`} id={`economy-task-${task.publicId}`} tabIndex={-1} key={task.publicId}>
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
          {!loading && !failedSections.includes("tasks") && tasks.length === 0 ? <EmptyState>{t("user.noTasks")}</EmptyState> : null}
        </div>
      </section>

      <section className="surface rounded-lg p-5">
        <h3 className="text-lg font-black">{t("user.shop")}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("user.shopDescription")}</p>
        {backgroundRefreshFailed ? <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
          <p>{t("user.profileBackgroundPreviewUnavailable")}</p>
          <button className="button-secondary focus-ring" disabled={usingBackground || refreshingBackground} type="button" onClick={() => void refreshProfileBackground()}>{t("common.retry")}</button>
        </div> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shopItems.map((item) => {
            const quantity = item.inventoryQuantity ?? 0;
            const name = localizedName(item, locale);
            return (
              <article className={`flex min-h-64 flex-col rounded-lg border p-4 ${targetId === item.publicId && targetType === "shop_item" ? "border-[var(--accent)]" : "border-[var(--line)]"}`} id={`economy-shop_item-${item.publicId}`} tabIndex={-1} key={item.publicId}>
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
                      disabled={!item.canPurchase || actionsBusy || failedSections.includes("shop")}
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
                          disabled={!item.canUse || actionsBusy || refreshingBackground || failedSections.includes("shop")}
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void applyProfileBackground(item, file);
                          }}
                        />
                      </label>
                    ) : null}
                    {(item.itemType === "project_heat_boost" || item.itemType === "server_heat_boost") && quantity > 0 ? (
                      <button
                        className="button-secondary focus-ring"
                        disabled={!item.canUse || actionsBusy || failedSections.includes("shop")}
                        type="button"
                        onClick={() => setHeatBoostItem(item)}
                      >
                        {t("user.selectHeatBoostTarget")}
                      </button>
                    ) : null}
                  </div>
                  {!item.canPurchase && quantity === 0 ? (
                    <p className="mt-2 text-xs font-bold text-[var(--muted)]">{t("user.shopPermissionRequired")}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!loading && !failedSections.includes("shop") && shopItems.length === 0 ? <EmptyState>{t("user.noShopItems")}</EmptyState> : null}
        </div>
      </section>
      <ModResourcePickerDialog
        allowUnresolved={false}
        multiple={false}
        open={heatBoostItem !== null}
        projectTypes={(heatBoostItem?.itemType === "server_heat_boost"
          ? ["minecraft_server"]
          : ["mod", "modpack", "plugin", "map", "resource_pack", "shader_pack", "datapack", "addon"]) as ProjectResourceType[]}
        token={token}
        value={[]}
        labels={{
          title: t("user.selectHeatBoostTarget"),
          description: t("user.heatBoostTargetDescription"),
        }}
        onClose={() => setHeatBoostItem(null)}
        onConfirm={(resources) => {
          const item = heatBoostItem;
          const target = resources[0];
          if (item && target) void applyHeatBoost(item, target);
        }}
      />
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

function TransactionHistory({
  title,
  empty,
  hasMore,
  loading,
  onLoadMore,
  children,
}: {
  title: string;
  empty: string;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="surface rounded-lg p-5">
      <h3 className="text-lg font-black">{title}</h3>
      <div className="mt-4 grid gap-2">
        {hasItems ? children : <p className="rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--muted)]">{empty}</p>}
      </div>
      {hasMore ? <button className="button-secondary focus-ring mt-4" disabled={loading} type="button" onClick={onLoadMore}>{loading ? t("common.loading") : t("user.loadMoreTransactions")}</button> : null}
    </section>
  );
}

function HistoryRow({
  amount,
  balance,
  label,
  detail,
  icon,
  time,
  locale,
}: {
  amount: number;
  balance: number;
  label: string;
  detail?: string;
  icon?: string;
  time: string;
  locale: string;
}) {
  const { t } = useI18n();
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--line)] p-3">
      {icon ? <CatalogResourceIconValue className="h-9 w-9" fallbackName={label} value={icon} /> : <span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--panel-subtle)] font-black">XP</span>}
      <div className="min-w-0">
        <p className="truncate font-bold">{label}</p>
        <p className="truncate text-xs text-[var(--muted)]">{detail || t("user.noTransactionReference")} · {new Date(time).toLocaleString(locale)}</p>
      </div>
      <div className="text-right">
        <strong className={amount >= 0 ? "text-[var(--accent)]" : "text-red-600"}>{amount >= 0 ? "+" : ""}{formatSignedNumber(amount, locale)}</strong>
        <span className="mt-1 block text-xs text-[var(--muted)]">{t("user.balanceAfter", { amount: formatNumber(balance, locale) })}</span>
      </div>
    </article>
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

function formatSignedNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function transactionLabel(type: string, t: (key: string) => string) {
  const known = new Set(["checkin", "transfer_out", "transfer_in", "shop_purchase", "content_download_reward", "task_reward", "question_bounty_hold", "question_bounty_refund", "question_bounty_award"]);
  return known.has(type) ? t(`user.transactionTypes.${type}`) : type;
}

function experienceReasonLabel(reason: string, t: (key: string) => string) {
  return reason === "task_reward" ? t("user.experienceReasons.task_reward") : reason;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
