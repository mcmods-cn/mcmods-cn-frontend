"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";

type Policy = { burstLimit: number; burstSeconds: number; hourLimit: number; dayLimit: number; objectLimit: number; objectMinutes: number; pendingLimit: number };
type Settings = {
  enabled: boolean; emergencyMode: boolean; logThreshold: number; moderationThreshold: number; challengeThreshold: number;
  tempBlockThreshold: number; denyThreshold: number; newAccountDays: number; trustedAccountDays: number; trustedMinimumLevel: number;
  duplicateWindowHours: number; similarityThreshold: number; temporaryBlockMinutes: number; policies: Record<string, Policy>;
};
type Overview = { counts: Record<string, Record<string, number>>; activeRestrictions: number; highRiskUsers: number; trend: Array<Record<string, unknown>>; challengePassed24h: number; challengeFailed24h: number; duplicateBlocked24h: number; verifiedCrawlerReads24h: number; unknownCrawlerReads24h: number };
type RiskEvent = { id: string; username: string; action: string; objectKey: string; outcome: string; riskScore: number; rules: string[]; crawlerClass: string; disposition: string; createdAt: string };

export function AdminAntiAbusePanel({ token }: { token: string }) {
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
    } catch (error) { setMessage(error instanceof Error ? error.message : "加载风控数据失败"); }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    try {
      setSettings(await apiRequest<Settings>("/api/v1/admin/anti-abuse/config", { method: "PUT", body: JSON.stringify(settings) }, token));
      setMessage("反滥用规则已保存，并记录管理员审计日志。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  }

  async function resetSettings() {
    if (!window.confirm("确认恢复安全默认值？")) return;
    setSettings(await apiRequest<Settings>("/api/v1/admin/anti-abuse/config/reset", { method: "POST" }, token));
    setMessage("已恢复默认规则。");
  }

  async function reviewEvent(id: string, disposition: "false_positive" | "confirmed_malicious" | "acknowledged") {
    const note = window.prompt("处置备注（可留空）", "") ?? "";
    await apiRequest(`/api/v1/admin/anti-abuse/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ disposition, note }) }, token);
    await load();
  }

  async function createRestriction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await apiRequest("/api/v1/admin/anti-abuse/restrictions", { method: "POST", body: JSON.stringify({
      userId: values.get("userId"), mode: values.get("mode"), actions: String(values.get("actions") || "").split(",").map((v) => v.trim()).filter(Boolean),
      durationMinutes: Number(values.get("durationMinutes")), reason: values.get("reason"), appealAllowed: values.get("appealAllowed") === "on",
    }) }, token);
    event.currentTarget.reset(); await load();
  }

  async function liftRestriction(id: string) {
    const reason = window.prompt("解除原因（至少 3 个字符）");
    if (!reason) return;
    await apiRequest(`/api/v1/admin/anti-abuse/restrictions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ reason }) }, token);
    await load();
  }

  async function createBotRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await apiRequest("/api/v1/admin/anti-abuse/bot-rules", { method: "POST", body: JSON.stringify({
      kind: values.get("kind"), label: values.get("label"), matcher: values.get("matcher"), token: values.get("botToken"), readOnly: true,
    }) }, token);
    event.currentTarget.reset(); await load();
  }

  async function deleteBotRule(id: string) {
    if (!window.confirm("确认删除该机器人规则？")) return;
    await apiRequest(`/api/v1/admin/anti-abuse/bot-rules/${encodeURIComponent(id)}`, { method: "DELETE" }, token);
    await load();
  }

  async function updateUserState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await apiRequest(`/api/v1/admin/anti-abuse/users/${encodeURIComponent(String(values.get("userId")))}`, { method: "PATCH", body: JSON.stringify({
      trustLevel: values.get("trustLevel"), riskScore: Number(values.get("riskScore")), manuallyTrusted: values.get("manuallyTrusted") === "on",
    }) }, token);
    setMessage("用户可信度已更新，并记录管理员审计日志。");
  }

  return <div className="space-y-6">
    {message ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold" role="status">{message}</p> : null}
    <section className="surface rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">风险总览</h2><p className="text-sm text-[var(--muted)]">只显示哈希化网络标识；完整敏感信息需要单独权限。</p></div><button className="button-secondary" onClick={() => void load()} type="button">刷新</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="24 小时风险事件" value={sumCounts(overview?.counts?.["24h"])} />
        <Metric label="24 小时限流" value={overview?.counts?.["24h"]?.delay || 0} />
        <Metric label="24 小时验证" value={overview?.counts?.["24h"]?.challenge || 0} />
        <Metric label="生效限制" value={overview?.activeRestrictions || 0} />
        <Metric label="高风险用户" value={overview?.highRiskUsers || 0} />
        <Metric label="验证通过 / 失败" value={(overview?.challengePassed24h || 0) + (overview?.challengeFailed24h || 0)} />
        <Metric label="重复内容拦截" value={overview?.duplicateBlocked24h || 0} />
        <Metric label="可信爬虫样本" value={overview?.verifiedCrawlerReads24h || 0} />
        <Metric label="未知/可疑爬虫样本" value={overview?.unknownCrawlerReads24h || 0} />
      </div>
    </section>

    {settings ? <section className="surface rounded-xl p-5">
      <h2 className="text-xl font-black">规则配置</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Check label="启用反滥用系统" checked={settings.enabled} onChange={(enabled) => setSettings({ ...settings, enabled })} />
        <Check label="全站紧急保护模式" checked={settings.emergencyMode} onChange={(emergencyMode) => setSettings({ ...settings, emergencyMode })} />
        {(["logThreshold", "moderationThreshold", "challengeThreshold", "tempBlockThreshold", "denyThreshold", "similarityThreshold"] as const).map((key) =>
          <NumberField key={key} label={key} value={settings[key]} onChange={(value) => setSettings({ ...settings, [key]: value })} />)}
      </div>
      <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th>动作</th><th>瞬时</th><th>小时</th><th>每日</th><th>对象</th><th>待审</th></tr></thead><tbody>
        {Object.entries(settings.policies).map(([action, policy]) => <tr className="border-t border-[var(--line)]" key={action}><td className="py-2 font-mono">{action}</td>{(["burstLimit", "hourLimit", "dayLimit", "objectLimit", "pendingLimit"] as const).map((key) => <td key={key}><input className="field w-24 py-1" min={0} type="number" value={policy[key]} onChange={(e) => setSettings({ ...settings, policies: { ...settings.policies, [action]: { ...policy, [key]: Number(e.target.value) } } })} /></td>)}</tr>)}
      </tbody></table></div>
      <div className="mt-4 flex gap-2"><button className="button-primary" disabled={busy} onClick={() => void saveSettings()} type="button">保存规则</button><button className="button-secondary" onClick={() => void resetSettings()} type="button">恢复默认</button></div>
    </section> : null}

    <section className="surface rounded-xl p-5"><h2 className="text-xl font-black">最近风险事件</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr><th>时间</th><th>用户 / 动作</th><th>结果</th><th>分数 / 规则</th><th>处置</th></tr></thead><tbody>{events.map((item) => <tr className="border-t border-[var(--line)] align-top" key={item.id}><td className="whitespace-nowrap py-3">{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td><b>{item.username || "匿名爬虫"}</b><div className="font-mono text-xs">{item.action}</div></td><td>{item.outcome}<div className="text-xs text-[var(--muted)]">{item.crawlerClass}</div></td><td>{item.riskScore}<div className="max-w-md text-xs text-[var(--muted)]">{item.rules?.join(", ")}</div></td><td><div className="flex flex-wrap gap-1"><button className="button-secondary px-2 py-1" onClick={() => void reviewEvent(item.id, "false_positive")}>误报</button><button className="button-secondary px-2 py-1" onClick={() => void reviewEvent(item.id, "confirmed_malicious")}>恶意</button></div><small>{item.disposition}</small></td></tr>)}</tbody></table></div></section>

    <section className="grid gap-6 xl:grid-cols-2">
      <form className="surface rounded-xl p-5" onSubmit={createRestriction}><h2 className="text-xl font-black">人工限制</h2><div className="mt-4 grid gap-3"><input className="field" name="userId" placeholder="用户公开 ID" required /><select className="field" name="mode"><option value="cooldown">动作冷却</option><option value="challenge">强制验证</option><option value="moderation">强制审核</option><option value="no_comment">禁止评论</option><option value="no_review">禁止提交审核</option><option value="read_only">只读模式</option><option value="temporary_ban">临时封禁</option><option value="permanent_ban">永久封禁</option></select><input className="field" name="actions" placeholder="动作，逗号分隔（按模式可留空）" /><input className="field" defaultValue={60} min={1} name="durationMinutes" type="number" /><textarea className="field" minLength={3} name="reason" placeholder="原因" required /><label><input defaultChecked name="appealAllowed" type="checkbox" /> 允许申诉</label><button className="button-primary" type="submit">添加限制</button></div></form>
      <form className="surface rounded-xl p-5" onSubmit={createBotRule}><h2 className="text-xl font-black">只读机器人规则</h2><div className="mt-4 grid gap-3"><select className="field" name="kind"><option value="allowed_bot">允许的机器人</option><option value="monitoring_bot">监控机器人</option><option value="blocked_bot">封禁机器人</option><option value="ip_allow">IP 白名单</option><option value="ip_block">IP 黑名单</option></select><input className="field" name="label" placeholder="规则名称" required /><input className="field" name="matcher" placeholder="User-Agent 片段或 IP/CIDR" /><input className="field" name="botToken" placeholder="机器人 Token（允许/监控规则至少 16 字符）" /><button className="button-primary" type="submit">保存只读规则</button></div></form>
      <form className="surface rounded-xl p-5" onSubmit={updateUserState}><h2 className="text-xl font-black">账户可信度</h2><div className="mt-4 grid gap-3"><input className="field" name="userId" placeholder="用户公开 ID" required /><select className="field" name="trustLevel"><option value="normal">普通</option><option value="new">新用户</option><option value="trusted">可信</option><option value="high_risk">高风险</option><option value="restricted">受限</option></select><input className="field" defaultValue={0} max={1000} min={0} name="riskScore" type="number" /><label><input name="manuallyTrusted" type="checkbox" /> 人工可信（仍不绕过内容与权限校验）</label><button className="button-primary" type="submit">更新可信度</button></div></form>
    </section>
    <section className="surface rounded-xl p-5"><h2 className="text-xl font-black">生效限制与机器人</h2><div className="mt-3 grid gap-2">{restrictions.map((item) => <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--line)] p-3" key={String(item.public_id)}><span>{String(item.username || item.user_id)} · {String(item.mode)} · {String(item.reason)}</span>{!item.lifted_at ? <button className="button-secondary" onClick={() => void liftRestriction(String(item.public_id))}>解除</button> : null}</div>)}{botRules.map((item) => <div className="flex items-center justify-between gap-2 rounded border border-[var(--line)] p-3" key={String(item.public_id)}><span>{String(item.label)} · {String(item.kind)} · 只读</span><button className="button-secondary" onClick={() => void deleteBotRule(String(item.public_id))}>删除</button></div>)}</div></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-[var(--line)] p-4"><b className="text-2xl">{value}</b><p className="text-sm text-[var(--muted)]">{label}</p></div>; }
function sumCounts(values?: Record<string, number>) { return Object.values(values || {}).reduce((sum, value) => sum + value, 0); }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2 rounded border border-[var(--line)] p-3"><input checked={checked} type="checkbox" onChange={(e) => onChange(e.target.checked)} /> {label}</label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="text-sm font-bold"><span>{label}</span><input className="field mt-1" min={0} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
