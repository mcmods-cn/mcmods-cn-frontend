"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

type Policy = { burstLimit: number; burstSeconds: number; hourLimit: number; dayLimit: number; objectLimit: number; objectMinutes: number; pendingLimit: number };
type Settings = {
  enabled: boolean; emergencyMode: boolean; logThreshold: number; moderationThreshold: number; challengeThreshold: number;
  tempBlockThreshold: number; denyThreshold: number; newAccountDays: number; trustedAccountDays: number; trustedMinimumLevel: number;
  duplicateWindowHours: number; similarityThreshold: number; temporaryBlockMinutes: number; policies: Record<string, Policy>;
};
type Overview = { counts: Record<string, Record<string, number>>; activeRestrictions: number; highRiskUsers: number; trend: Array<Record<string, unknown>>; challengePassed24h: number; challengeFailed24h: number; duplicateBlocked24h: number; verifiedCrawlerReads24h: number; unknownCrawlerReads24h: number };
type RiskEvent = { id: string; username: string; action: string; objectKey: string; outcome: string; riskScore: number; rules: string[]; crawlerClass: string; disposition: string; createdAt: string };

export function AdminAntiAbusePanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [restrictions, setRestrictions] = useState<Array<Record<string, unknown>>>([]);
  const [botRules, setBotRules] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextOverview, nextSettings, nextEvents, nextRestrictions, nextBotRules] = await Promise.all([
        apiRequest<Overview>("/api/v1/admin/anti-abuse/overview", {}, token),
        apiRequest<Settings>("/api/v1/admin/anti-abuse/config", {}, token),
        apiRequest<{ items: RiskEvent[] }>("/api/v1/admin/anti-abuse/events?limit=100", {}, token),
        apiRequest<{ items: Array<Record<string, unknown>> }>("/api/v1/admin/anti-abuse/restrictions", {}, token),
        apiRequest<{ items: Array<Record<string, unknown>> }>("/api/v1/admin/anti-abuse/bot-rules", {}, token),
      ]);
      setOverview(nextOverview); setSettings(nextSettings); setEvents(nextEvents.items); setRestrictions(nextRestrictions.items); setBotRules(nextBotRules.items);
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : t("antiAbuse.loadFailed")); }
  }, [t, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveSettings() {
    if (!settings || busy) return;
    setBusy(true);
    try {
      setSettings(await apiRequest<Settings>("/api/v1/admin/anti-abuse/config", { method: "PUT", body: JSON.stringify(settings) }, token));
      setMessage(t("antiAbuse.saved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("antiAbuse.saveFailed")); }
    finally { setBusy(false); }
  }

  async function runAdminAction(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try { await operation(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("assetEditor.saveFailed")); }
    finally { setBusy(false); }
  }

  async function resetSettings() {
    if (!window.confirm(t("antiAbuse.resetConfirm"))) return;
    await runAdminAction(async () => {
      setSettings(await apiRequest<Settings>("/api/v1/admin/anti-abuse/config/reset", { method: "POST" }, token));
      setMessage(t("antiAbuse.resetDone"));
    });
  }

  async function reviewEvent(id: string, disposition: "false_positive" | "confirmed_malicious" | "acknowledged") {
    const note = window.prompt(t("antiAbuse.reviewNote"), "");
    if (note === null) return;
    await runAdminAction(async () => {
      await apiRequest(`/api/v1/admin/anti-abuse/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ disposition, note }) }, token);
      await load();
    });
  }

  async function createRestriction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const values = new FormData(element);
    await runAdminAction(async () => {
      await apiRequest("/api/v1/admin/anti-abuse/restrictions", { method: "POST", body: JSON.stringify({
        userId: values.get("userId"), mode: values.get("mode"), actions: String(values.get("actions") || "").split(",").map((v) => v.trim()).filter(Boolean),
        durationMinutes: Number(values.get("durationMinutes")), reason: values.get("reason"), appealAllowed: values.get("appealAllowed") === "on",
      }) }, token);
      element.reset(); await load();
    });
  }

  async function liftRestriction(id: string) {
    const reason = window.prompt(t("antiAbuse.liftReason"));
    if (!reason) return;
    await runAdminAction(async () => {
      await apiRequest(`/api/v1/admin/anti-abuse/restrictions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ reason }) }, token);
      await load();
    });
  }

  async function createBotRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const values = new FormData(element);
    await runAdminAction(async () => {
      await apiRequest("/api/v1/admin/anti-abuse/bot-rules", { method: "POST", body: JSON.stringify({
        kind: values.get("kind"), label: values.get("label"), matcher: values.get("matcher"), token: values.get("botToken"), readOnly: true,
      }) }, token);
      element.reset(); await load();
    });
  }

  async function deleteBotRule(id: string) {
    if (!window.confirm(t("antiAbuse.deleteBotConfirm"))) return;
    await runAdminAction(async () => {
      await apiRequest(`/api/v1/admin/anti-abuse/bot-rules/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
      await load();
    });
  }

  async function updateUserState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await runAdminAction(async () => {
      await apiRequest(`/api/v1/admin/anti-abuse/users/${encodeURIComponent(String(values.get("userId")))}`, { method: "PATCH", body: JSON.stringify({
        trustLevel: values.get("trustLevel"), riskScore: Number(values.get("riskScore")), manuallyTrusted: values.get("manuallyTrusted") === "on",
      }) }, token);
      setMessage(t("antiAbuse.trustUpdated"));
    });
  }

  return <div className="space-y-6">
    {message ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold" role="status">{message}</p> : null}
    <section className="surface rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">{t("antiAbuse.title")}</h2><p className="text-sm text-[var(--muted)]">{t("antiAbuse.privacyHint")}</p></div><button disabled={busy} className="button-secondary" onClick={() => void load()} type="button">{t("common.refresh")}</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={t("antiAbuse.riskEvents24h")} value={sumCounts(overview?.counts?.["24h"])} />
        <Metric label={t("antiAbuse.rateLimits24h")} value={overview?.counts?.["24h"]?.delay || 0} />
        <Metric label={t("antiAbuse.challenges24h")} value={overview?.counts?.["24h"]?.challenge || 0} />
        <Metric label={t("antiAbuse.activeRestrictions")} value={overview?.activeRestrictions || 0} />
        <Metric label={t("antiAbuse.highRiskUsers")} value={overview?.highRiskUsers || 0} />
        <Metric label={t("antiAbuse.challengeResults")} value={`${new Intl.NumberFormat(locale).format(overview?.challengePassed24h || 0)} / ${new Intl.NumberFormat(locale).format(overview?.challengeFailed24h || 0)}`} />
        <Metric label={t("antiAbuse.duplicateBlocked")} value={overview?.duplicateBlocked24h || 0} />
        <Metric label={t("antiAbuse.verifiedCrawlers")} value={overview?.verifiedCrawlerReads24h || 0} />
        <Metric label={t("antiAbuse.unknownCrawlers")} value={overview?.unknownCrawlerReads24h || 0} />
      </div>
    </section>

    {settings ? <section className="surface rounded-xl p-5">
      <h2 className="text-xl font-black">{t("antiAbuse.rulesTitle")}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Check label={t("antiAbuse.enabled")} checked={settings.enabled} onChange={(enabled) => setSettings({ ...settings, enabled })} />
        <Check label={t("antiAbuse.emergencyMode")} checked={settings.emergencyMode} onChange={(emergencyMode) => setSettings({ ...settings, emergencyMode })} />
        {(["logThreshold", "moderationThreshold", "challengeThreshold", "tempBlockThreshold", "denyThreshold", "similarityThreshold"] as const).map((key) =>
          <NumberField key={key} label={t(`antiAbuse.${key}`)} value={settings[key]} onChange={(value) => setSettings({ ...settings, [key]: value })} />)}
      </div>
      <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th>{t("antiAbuse.action")}</th><th>{t("antiAbuse.burst")}</th><th>{t("antiAbuse.hourly")}</th><th>{t("antiAbuse.daily")}</th><th>{t("antiAbuse.object")}</th><th>{t("antiAbuse.pending")}</th></tr></thead><tbody>
        {Object.entries(settings.policies).map(([action, policy]) => <tr className="border-t border-[var(--line)]" key={action}><td className="py-2 font-mono">{action}</td>{(["burstLimit", "hourLimit", "dayLimit", "objectLimit", "pendingLimit"] as const).map((key) => <td key={key}><input aria-label={t("antiAbuse.policyValue", { action, limit: t(`antiAbuse.${({ burstLimit: "burst", hourLimit: "hourly", dayLimit: "daily", objectLimit: "object", pendingLimit: "pending" })[key]}`) })} className="field w-24 py-1" min={0} type="number" value={policy[key]} onChange={(e) => setSettings({ ...settings, policies: { ...settings.policies, [action]: { ...policy, [key]: Number(e.target.value) } } })} /></td>)}</tr>)}
      </tbody></table></div>
      <div className="mt-4 flex gap-2"><button className="button-primary" disabled={busy} onClick={() => void saveSettings()} type="button">{t("antiAbuse.saveRules")}</button><button disabled={busy} className="button-secondary" onClick={() => void resetSettings()} type="button">{t("antiAbuse.restoreDefaults")}</button></div>
    </section> : null}

    <section className="surface rounded-xl p-5"><h2 className="text-xl font-black">{t("antiAbuse.recentEvents")}</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th>{t("antiAbuse.time")}</th><th>{t("antiAbuse.userAction")}</th><th>{t("antiAbuse.outcome")}</th><th>{t("antiAbuse.scoreRules")}</th><th>{t("antiAbuse.disposition")}</th></tr></thead><tbody>{events.map((item) => <tr className="border-t border-[var(--line)] align-top" key={item.id}><td className="whitespace-nowrap py-3">{new Date(item.createdAt).toLocaleString(locale)}</td><td><b>{item.username || t("antiAbuse.anonymousCrawler")}</b><div className="font-mono text-xs">{item.action}</div></td><td>{item.outcome}<div className="text-xs text-[var(--muted)]">{item.crawlerClass}</div></td><td>{item.riskScore}<div className="max-w-md text-xs text-[var(--muted)]">{item.rules?.join(", ")}</div></td><td><div className="flex flex-wrap gap-1"><button disabled={busy} className="button-secondary px-2 py-1" onClick={() => void reviewEvent(item.id, "false_positive")}>{t("antiAbuse.falsePositive")}</button><button disabled={busy} className="button-secondary px-2 py-1" onClick={() => void reviewEvent(item.id, "confirmed_malicious")}>{t("antiAbuse.malicious")}</button></div><small>{item.disposition}</small></td></tr>)}</tbody></table></div></section>

    <section className="grid gap-6 xl:grid-cols-2">
      <form className="surface rounded-xl p-5" onSubmit={createRestriction}><h2 className="text-xl font-black">{t("antiAbuse.manualRestrictions")}</h2><div className="mt-4 grid gap-3"><input className="field" name="userId" placeholder={t("antiAbuse.userID")} required /><select className="field" name="mode"><option value="cooldown">{t("antiAbuse.cooldown")}</option><option value="challenge">{t("antiAbuse.challenge")}</option><option value="moderation">{t("antiAbuse.moderation")}</option><option value="no_comment">{t("antiAbuse.noComment")}</option><option value="no_review">{t("antiAbuse.noReview")}</option><option value="read_only">{t("antiAbuse.readOnlyMode")}</option><option value="temporary_ban">{t("antiAbuse.temporaryBan")}</option><option value="permanent_ban">{t("antiAbuse.permanentBan")}</option></select><input className="field" name="actions" placeholder={t("antiAbuse.actionsPlaceholder")} /><input aria-label={t("antiAbuse.durationMinutes")} className="field" defaultValue={60} min={1} name="durationMinutes" type="number" /><textarea className="field" minLength={3} name="reason" placeholder={t("antiAbuse.reason")} required /><label><input defaultChecked name="appealAllowed" type="checkbox" /> {t("antiAbuse.appealAllowed")}</label><button className="button-primary" disabled={busy} type="submit">{t("antiAbuse.addRestriction")}</button></div></form>
      <form className="surface rounded-xl p-5" onSubmit={createBotRule}><h2 className="text-xl font-black">{t("antiAbuse.botRules")}</h2><div className="mt-4 grid gap-3"><select className="field" name="kind"><option value="allowed_bot">{t("antiAbuse.allowedBot")}</option><option value="monitoring_bot">{t("antiAbuse.monitoringBot")}</option><option value="blocked_bot">{t("antiAbuse.blockedBot")}</option><option value="ip_allow">{t("antiAbuse.ipAllow")}</option><option value="ip_block">{t("antiAbuse.ipBlock")}</option></select><input className="field" name="label" placeholder={t("antiAbuse.ruleName")} required /><input className="field" name="matcher" placeholder={t("antiAbuse.matcher")} /><input className="field" name="botToken" placeholder={t("antiAbuse.botToken")} /><button className="button-primary" disabled={busy} type="submit">{t("antiAbuse.saveBotRule")}</button></div></form>
      <form className="surface rounded-xl p-5" onSubmit={updateUserState}><h2 className="text-xl font-black">{t("antiAbuse.trustTitle")}</h2><div className="mt-4 grid gap-3"><input className="field" name="userId" placeholder={t("antiAbuse.userID")} required /><select className="field" name="trustLevel"><option value="normal">{t("antiAbuse.normal")}</option><option value="new">{t("antiAbuse.newUser")}</option><option value="trusted">{t("antiAbuse.trusted")}</option><option value="high_risk">{t("antiAbuse.highRisk")}</option><option value="restricted">{t("antiAbuse.restricted")}</option></select><input aria-label={t("antiAbuse.riskScore")} className="field" defaultValue={0} max={1000} min={0} name="riskScore" type="number" /><label><input name="manuallyTrusted" type="checkbox" /> {t("antiAbuse.manuallyTrusted")}</label><button className="button-primary" disabled={busy} type="submit">{t("antiAbuse.updateTrust")}</button></div></form>
    </section>
    <section className="surface rounded-xl p-5"><h2 className="text-xl font-black">{t("antiAbuse.activeRules")}</h2><div className="mt-3 grid gap-2">{restrictions.map((item) => <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--line)] p-3" key={String(item.public_id)}><span>{String(item.username || item.user_id)} · {String(item.mode)} · {String(item.reason)}</span>{!item.lifted_at ? <button disabled={busy} className="button-secondary" onClick={() => void liftRestriction(String(item.public_id))}>{t("antiAbuse.lift")}</button> : null}</div>)}{botRules.map((item) => <div className="flex items-center justify-between gap-2 rounded border border-[var(--line)] p-3" key={String(item.public_id)}><span>{String(item.label)} · {String(item.kind)} · {t("antiAbuse.readOnly")}</span><button disabled={busy} className="button-secondary" onClick={() => void deleteBotRule(String(item.public_id))}>{t("common.delete")}</button></div>)}</div></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  const { locale } = useI18n();
  return <div className="rounded-lg border border-[var(--line)] p-4"><b className="text-2xl">{typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : value}</b><p className="text-sm text-[var(--muted)]">{label}</p></div>;
}
function sumCounts(values?: Record<string, number>) { return Object.values(values || {}).reduce((sum, value) => sum + value, 0); }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2 rounded border border-[var(--line)] p-3"><input checked={checked} type="checkbox" onChange={(e) => onChange(e.target.checked)} /> {label}</label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="text-sm font-bold"><span>{label}</span><input className="field mt-1" min={0} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
