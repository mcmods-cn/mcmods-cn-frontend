"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { apiErrorMessage } from "../_lib/api-error.mts";
import { useI18n } from "../_lib/i18n-provider";
import { validateAntiAbuseSettings, type AntiAbusePolicy, type AntiAbuseSettings } from "../_lib/anti-abuse-settings.mts";

type Overview = { counts: Record<string, Record<string, number>>; activeRestrictions: number; highRiskUsers: number; trend: Array<Record<string, unknown>>; challengePassed24h: number; challengeFailed24h: number; duplicateBlocked24h: number; verifiedCrawlerReads24h: number; unknownCrawlerReads24h: number };
type RiskEvent = { id: string; username: string; action: string; objectKey: string; outcome: string; riskScore: number; rules: string[]; crawlerClass: string; disposition: string; createdAt: string };

export function AdminAntiAbusePanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<AntiAbuseSettings | null>(null);
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [restrictions, setRestrictions] = useState<Array<Record<string, unknown>>>([]);
  const [botRules, setBotRules] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mutationPending = useRef(false);
  const translation = useRef(t);
  useEffect(() => { translation.current = t; }, [t]);

  const load = useCallback((signal?: AbortSignal) => Promise.all([
    apiRequest<Overview>("/api/v1/admin/anti-abuse/overview", { signal }, token),
    apiRequest<AntiAbuseSettings>("/api/v1/admin/anti-abuse/config", { signal }, token),
    apiRequest<{ items: RiskEvent[] }>("/api/v1/admin/anti-abuse/events?limit=100", { signal }, token),
    apiRequest<{ items: Array<Record<string, unknown>> }>("/api/v1/admin/anti-abuse/restrictions", { signal }, token),
    apiRequest<{ items: Array<Record<string, unknown>> }>("/api/v1/admin/anti-abuse/bot-rules", { signal }, token),
  ]).then(([nextOverview, nextSettings, nextEvents, nextRestrictions, nextBotRules]) => {
    if (signal?.aborted) return;
    setOverview(nextOverview); setSettings(nextSettings); setEvents(nextEvents.items); setRestrictions(nextRestrictions.items); setBotRules(nextBotRules.items);
    setMessage("");
  }).catch((error) => {
    if (!signal?.aborted) setMessage(apiErrorMessage(error, translation.current, translation.current("antiAbuse.loadFailed")));
  }), [token]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function runMutation(work: () => Promise<void>) {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true);
    setMessage("");
    try { await work(); }
    catch (error) { setMessage(apiErrorMessage(error, translation.current, translation.current("antiAbuse.operationFailed"))); }
    finally { mutationPending.current = false; setBusy(false); }
  }

  async function saveSettings() {
    if (!settings) return;
    const validationError = validateAntiAbuseSettings(settings);
    if (validationError) { setMessage(t(`antiAbuse.validation.${validationError}`)); return; }
    await runMutation(async () => {
      setSettings(await apiRequest<AntiAbuseSettings>("/api/v1/admin/anti-abuse/config", { method: "PUT", body: JSON.stringify(settings) }, token));
      setMessage(translation.current("antiAbuse.saved"));
    });
  }

  async function resetSettings() {
    if (!window.confirm(t("antiAbuse.resetConfirm"))) return;
    await runMutation(async () => {
      setSettings(await apiRequest<AntiAbuseSettings>("/api/v1/admin/anti-abuse/config/reset", { method: "POST" }, token));
      setMessage(translation.current("antiAbuse.resetDone"));
    });
  }

  async function reviewEvent(id: string, disposition: "false_positive" | "confirmed_malicious" | "acknowledged") {
    const note = window.prompt(t("antiAbuse.dispositionNote"), "");
    if (note === null) return;
    await runMutation(async () => {
      await apiRequest(`/api/v1/admin/anti-abuse/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ disposition, note }) }, token);
      await load();
    });
  }

  async function createRestriction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await runMutation(async () => {
      await apiRequest("/api/v1/admin/anti-abuse/restrictions", { method: "POST", body: JSON.stringify({
        userId: values.get("userId"), mode: values.get("mode"), actions: String(values.get("actions") || "").split(",").map((v) => v.trim()).filter(Boolean),
        durationMinutes: Number(values.get("durationMinutes")), reason: values.get("reason"), appealAllowed: values.get("appealAllowed") === "on",
      }) }, token);
      form.reset(); await load();
    });
  }

  async function liftRestriction(id: string) {
    const reason = window.prompt(t("antiAbuse.liftReason"));
    if (!reason) return;
    await runMutation(async () => {
      await apiRequest(`/api/v1/admin/anti-abuse/restrictions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ reason }) }, token);
      await load();
    });
  }

  async function createBotRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await runMutation(async () => {
      await apiRequest("/api/v1/admin/anti-abuse/bot-rules", { method: "POST", body: JSON.stringify({
        kind: values.get("kind"), label: values.get("label"), matcher: values.get("matcher"), token: values.get("botToken"),
      }) }, token);
      form.reset(); await load();
    });
  }

  async function deleteBotRule(id: string) {
    if (!window.confirm(t("antiAbuse.deleteRuleConfirm"))) return;
    await runMutation(async () => {
      await apiRequest(`/api/v1/admin/anti-abuse/bot-rules/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
      await load();
    });
  }

  async function updateUserState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await runMutation(async () => {
      await apiRequest(`/api/v1/admin/anti-abuse/users/${encodeURIComponent(String(values.get("userId")))}`, { method: "PATCH", body: JSON.stringify({
        trustLevel: values.get("trustLevel"), riskScore: Number(values.get("riskScore")), manuallyTrusted: values.get("manuallyTrusted") === "on",
      }) }, token);
      setMessage(translation.current("antiAbuse.trustUpdated"));
    });
  }

  return <div className="space-y-6">
    {message ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold" role="status">{message}</p> : null}
    <section className="surface rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">{t("antiAbuse.overview")}</h2><p className="text-sm text-[var(--muted)]">{t("antiAbuse.privacyHint")}</p></div><button className="button-secondary" disabled={busy} onClick={() => void load()} type="button">{t("common.refresh")}</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={t("antiAbuse.riskEvents24h")} value={sumCounts(overview?.counts?.["24h"])} />
        <Metric label={t("antiAbuse.rateLimits24h")} value={overview?.counts?.["24h"]?.delay || 0} />
        <Metric label={t("antiAbuse.challenges24h")} value={overview?.counts?.["24h"]?.challenge || 0} />
        <Metric label={t("antiAbuse.activeRestrictions")} value={overview?.activeRestrictions || 0} />
        <Metric label={t("antiAbuse.highRiskUsers")} value={overview?.highRiskUsers || 0} />
        <Metric label={t("antiAbuse.challengeOutcomes")} value={(overview?.challengePassed24h || 0) + (overview?.challengeFailed24h || 0)} />
        <Metric label={t("antiAbuse.duplicateBlocked")} value={overview?.duplicateBlocked24h || 0} />
        <Metric label={t("antiAbuse.verifiedCrawler")} value={overview?.verifiedCrawlerReads24h || 0} />
        <Metric label={t("antiAbuse.unknownCrawler")} value={overview?.unknownCrawlerReads24h || 0} />
      </div>
    </section>

    {settings ? <fieldset disabled={busy} className="surface rounded-xl p-5">
      <h2 className="text-xl font-black">{t("antiAbuse.rules")}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Check label={t("antiAbuse.enabled")} checked={settings.enabled} onChange={(enabled) => setSettings({ ...settings, enabled })} />
        <Check label={t("antiAbuse.emergency")} checked={settings.emergencyMode} onChange={(emergencyMode) => setSettings({ ...settings, emergencyMode })} />
      </div>
      <h3 className="mt-5 font-black">{t("antiAbuse.thresholds")}</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">{t("antiAbuse.thresholdsHint")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <NumberField label={t("antiAbuse.logThreshold")} min={1} max={100} value={settings.logThreshold} onChange={(logThreshold) => setSettings({ ...settings, logThreshold })} />
        <NumberField label={t("antiAbuse.moderationThreshold", { minimum: settings.logThreshold })} min={settings.logThreshold} max={200} value={settings.moderationThreshold} onChange={(moderationThreshold) => setSettings({ ...settings, moderationThreshold })} />
        <NumberField label={t("antiAbuse.challengeThreshold", { minimum: settings.moderationThreshold })} min={settings.moderationThreshold} max={300} value={settings.challengeThreshold} onChange={(challengeThreshold) => setSettings({ ...settings, challengeThreshold })} />
        <NumberField label={t("antiAbuse.tempBlockThreshold", { minimum: settings.challengeThreshold })} min={settings.challengeThreshold} max={500} value={settings.tempBlockThreshold} onChange={(tempBlockThreshold) => setSettings({ ...settings, tempBlockThreshold })} />
        <NumberField label={t("antiAbuse.denyThreshold", { minimum: settings.tempBlockThreshold })} min={settings.tempBlockThreshold} max={1000} value={settings.denyThreshold} onChange={(denyThreshold) => setSettings({ ...settings, denyThreshold })} />
        <NumberField label={t("antiAbuse.similarityThreshold")} min={700} max={1000} value={settings.similarityThreshold} onChange={(similarityThreshold) => setSettings({ ...settings, similarityThreshold })} />
      </div>
      <h3 className="mt-5 font-black">{t("antiAbuse.accounts")}</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">{t("antiAbuse.accountsHint")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <NumberField label={t("antiAbuse.newAccountDays")} min={1} max={90} value={settings.newAccountDays} onChange={(newAccountDays) => setSettings({ ...settings, newAccountDays })} />
        <NumberField label={t("antiAbuse.trustedAccountDays", { minimum: settings.newAccountDays })} min={settings.newAccountDays} max={3650} value={settings.trustedAccountDays} onChange={(trustedAccountDays) => setSettings({ ...settings, trustedAccountDays })} />
        <NumberField label={t("antiAbuse.trustedLevel")} min={0} max={1000} value={settings.trustedMinimumLevel} onChange={(trustedMinimumLevel) => setSettings({ ...settings, trustedMinimumLevel })} />
        <NumberField label={t("antiAbuse.duplicateWindow")} min={1} max={720} value={settings.duplicateWindowHours} onChange={(duplicateWindowHours) => setSettings({ ...settings, duplicateWindowHours })} />
        <NumberField label={t("antiAbuse.temporaryBlockMinutes")} min={1} max={43200} value={settings.temporaryBlockMinutes} onChange={(temporaryBlockMinutes) => setSettings({ ...settings, temporaryBlockMinutes })} />
      </div>
      <h3 className="mt-5 font-black">{t("antiAbuse.policies")}</h3>
      <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th>{t("antiAbuse.action")}</th>{policyFields.map((field) => <th className="min-w-32" key={field.key}>{t(`antiAbuse.policy.${field.key}`)}</th>)}</tr></thead><tbody>
        {Object.entries(settings.policies).map(([action, policy]) => <tr className="border-t border-[var(--line)]" key={action}><td className="py-2 pr-3 font-mono">{action}</td>{policyFields.map((field) => <td className="pr-2" key={field.key}><input className="field w-28 py-1" min={field.min} max={field.max} step={1} type="number" value={policy[field.key]} onChange={(event) => setSettings({ ...settings, policies: { ...settings.policies, [action]: { ...policy, [field.key]: Number(event.target.value) } } })} /></td>)}</tr>)}
      </tbody></table></div>
      <div className="mt-4 flex gap-2"><button className="button-primary" disabled={busy} onClick={() => void saveSettings()} type="button">{t("antiAbuse.saveRules")}</button><button className="button-secondary" disabled={busy} onClick={() => void resetSettings()} type="button">{t("antiAbuse.resetRules")}</button></div>
    </fieldset> : null}

    <section className="surface rounded-xl p-5"><h2 className="text-xl font-black">{t("antiAbuse.recentEvents")}</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th>{t("antiAbuse.time")}</th><th>{t("antiAbuse.userAction")}</th><th>{t("antiAbuse.outcome")}</th><th>{t("antiAbuse.scoreRules")}</th><th>{t("antiAbuse.disposition")}</th></tr></thead><tbody>{events.map((item) => <tr className="border-t border-[var(--line)] align-top" key={item.id}><td className="whitespace-nowrap py-3">{new Date(item.createdAt).toLocaleString(locale)}</td><td><b>{item.username || t("antiAbuse.anonymous")}</b><div className="font-mono text-xs">{item.action}</div></td><td>{item.outcome}<div className="text-xs text-[var(--muted)]">{item.crawlerClass}</div></td><td>{item.riskScore}<div className="max-w-md text-xs text-[var(--muted)]">{item.rules?.join(", ")}</div></td><td><div className="flex flex-wrap gap-1"><button className="button-secondary px-2 py-1" disabled={busy} onClick={() => void reviewEvent(item.id, "false_positive")}>{t("antiAbuse.falsePositive")}</button><button className="button-secondary px-2 py-1" disabled={busy} onClick={() => void reviewEvent(item.id, "confirmed_malicious")}>{t("antiAbuse.malicious")}</button></div><small>{item.disposition}</small></td></tr>)}</tbody></table></div></section>

    <section className="grid gap-6 xl:grid-cols-2">
      <form className="surface rounded-xl p-5" onSubmit={createRestriction}><fieldset disabled={busy} className="contents"><h2 className="text-xl font-black">{t("antiAbuse.manualRestriction")}</h2><div className="mt-4 grid gap-3"><input className="field" name="userId" placeholder={t("antiAbuse.userId")} required /><select className="field" name="mode"><option value="cooldown">{t("antiAbuse.restrictionModes.cooldown")}</option><option value="challenge">{t("antiAbuse.restrictionModes.challenge")}</option><option value="moderation">{t("antiAbuse.restrictionModes.moderation")}</option><option value="no_comment">{t("antiAbuse.restrictionModes.no_comment")}</option><option value="no_review">{t("antiAbuse.restrictionModes.no_review")}</option><option value="read_only">{t("antiAbuse.restrictionModes.read_only")}</option><option value="temporary_ban">{t("antiAbuse.restrictionModes.temporary_ban")}</option><option value="permanent_ban">{t("antiAbuse.restrictionModes.permanent_ban")}</option></select><input className="field" name="actions" placeholder={t("antiAbuse.actions")} /><input className="field" defaultValue={60} min={1} name="durationMinutes" type="number" /><textarea className="field" minLength={3} name="reason" placeholder={t("antiAbuse.reason")} required /><label><input defaultChecked name="appealAllowed" type="checkbox" /> {t("antiAbuse.appealAllowed")}</label><button className="button-primary" type="submit">{t("antiAbuse.addRestriction")}</button></div></fieldset></form>
      <form className="surface rounded-xl p-5" onSubmit={createBotRule}><fieldset disabled={busy} className="contents"><h2 className="text-xl font-black">{t("antiAbuse.botRules")}</h2><div className="mt-4 grid gap-3"><select className="field" name="kind"><option value="allowed_bot">{t("antiAbuse.botKinds.allowed_bot")}</option><option value="monitoring_bot">{t("antiAbuse.botKinds.monitoring_bot")}</option><option value="blocked_bot">{t("antiAbuse.botKinds.blocked_bot")}</option><option value="ip_allow">{t("antiAbuse.botKinds.ip_allow")}</option><option value="ip_block">{t("antiAbuse.botKinds.ip_block")}</option></select><input className="field" name="label" placeholder={t("antiAbuse.botRuleName")} required /><input className="field" name="matcher" placeholder={t("antiAbuse.botMatcher")} /><input className="field" name="botToken" type="password" autoComplete="off" placeholder={t("antiAbuse.botToken")} /><button className="button-primary" type="submit">{t("antiAbuse.saveBotRule")}</button></div></fieldset></form>
      <form className="surface rounded-xl p-5" onSubmit={updateUserState}><fieldset disabled={busy} className="contents"><h2 className="text-xl font-black">{t("antiAbuse.trust")}</h2><div className="mt-4 grid gap-3"><input className="field" name="userId" placeholder={t("antiAbuse.userId")} required /><select className="field" name="trustLevel"><option value="normal">{t("antiAbuse.trustLevels.normal")}</option><option value="new">{t("antiAbuse.trustLevels.new")}</option><option value="trusted">{t("antiAbuse.trustLevels.trusted")}</option><option value="high_risk">{t("antiAbuse.trustLevels.high_risk")}</option><option value="restricted">{t("antiAbuse.trustLevels.restricted")}</option></select><input className="field" defaultValue={0} max={1000} min={0} name="riskScore" type="number" /><label><input name="manuallyTrusted" type="checkbox" /> {t("antiAbuse.manualTrust")}</label><button className="button-primary" type="submit">{t("antiAbuse.updateTrust")}</button></div></fieldset></form>
    </section>
    <section className="surface rounded-xl p-5"><h2 className="text-xl font-black">{t("antiAbuse.restrictionsAndBots")}</h2><div className="mt-3 grid gap-2">{restrictions.map((item) => <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--line)] p-3" key={String(item.public_id)}><span>{String(item.username || item.user_id)} · {String(item.mode)} · {String(item.reason)}</span>{!item.lifted_at ? <button className="button-secondary" disabled={busy} onClick={() => void liftRestriction(String(item.public_id))}>{t("antiAbuse.lift")}</button> : null}</div>)}{botRules.map((item) => <div className="flex items-center justify-between gap-2 rounded border border-[var(--line)] p-3" key={String(item.public_id)}><span>{String(item.label)} · {String(item.kind)} · {t("antiAbuse.readOnly")}</span><button className="button-secondary" disabled={busy} onClick={() => void deleteBotRule(String(item.public_id))}>{t("common.delete")}</button></div>)}</div></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-[var(--line)] p-4"><b className="text-2xl">{value}</b><p className="text-sm text-[var(--muted)]">{label}</p></div>; }
function sumCounts(values?: Record<string, number>) { return Object.values(values || {}).reduce((sum, value) => sum + value, 0); }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2 rounded border border-[var(--line)] p-3"><input checked={checked} type="checkbox" onChange={(e) => onChange(e.target.checked)} /> {label}</label>; }
const policyFields: ReadonlyArray<{ key: keyof AntiAbusePolicy; min: number; max: number }> = [
  { key: "burstLimit", min: 1, max: 10000 },
  { key: "burstSeconds", min: 1, max: 3600 },
  { key: "hourLimit", min: 1, max: 100000 },
  { key: "dayLimit", min: 1, max: 1000000 },
  { key: "objectLimit", min: 1, max: 10000 },
  { key: "objectMinutes", min: 1, max: 10080 },
  { key: "pendingLimit", min: 0, max: 10000 },
];

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <label className="text-sm font-bold"><span>{label}</span><input className="field mt-1" min={min} max={max} step={1} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
