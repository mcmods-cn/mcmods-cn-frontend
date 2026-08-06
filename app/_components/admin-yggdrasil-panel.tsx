"use client";

import { useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

export type AdminYggdrasilConfig = {
  enabled: boolean;
  publicBaseUrl: string;
  textureBaseUrl: string;
  serverName: string;
  trustedProxyCidrs: string[];
  tokenTtlHours: number;
  maxTokens: number;
  joinTtlSeconds: number;
  textureMaxBytes: number;
  hasPrivateKey: boolean;
  persistentPrivateKey: boolean;
  available: boolean;
  disabledReason?: string;
};

export const defaultAdminYggdrasilConfig: AdminYggdrasilConfig = {
  enabled: true,
  publicBaseUrl: "http://127.0.0.1:8080/api/yggdrasil/",
  textureBaseUrl: "http://127.0.0.1:8080/api/yggdrasil/textures/",
  serverName: "Mcmods-cn",
  trustedProxyCidrs: [],
  tokenTtlHours: 360,
  maxTokens: 10,
  joinTtlSeconds: 30,
  textureMaxBytes: 2 * 1024 * 1024,
  hasPrivateKey: false,
  persistentPrivateKey: false,
  available: false,
};

export function AdminYggdrasilPanel({ initialConfig, token }: { initialConfig: AdminYggdrasilConfig; token: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => normalizeAdminYggdrasilConfig(initialConfig));
  const [privateKeyBase64, setPrivateKeyBase64] = useState("");
  const [rotatePrivateKey, setRotatePrivateKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const saved = await apiRequest<AdminYggdrasilConfig>("/api/v1/admin/config/yggdrasil", {
        method: "PUT",
        body: JSON.stringify({
          ...draft,
          trustedProxyCidrs: draft.trustedProxyCidrs,
          privateKeyBase64: privateKeyBase64.trim(),
          rotatePrivateKey,
        }),
      }, token);
      setDraft(normalizeAdminYggdrasilConfig(saved));
      setPrivateKeyBase64("");
      setRotatePrivateKey(false);
      setMessage(t("admin.yggdrasil.saved"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("admin.yggdrasil.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] p-5">
        <div>
          <h2 className="text-xl font-bold">{t("admin.yggdrasil.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("admin.yggdrasil.description")}</p>
        </div>
        <button className="button-primary focus-ring" disabled={saving} type="button" onClick={() => void save()}>{saving ? t("admin.saving") : t("common.save")}</button>
      </header>

      <div className="grid gap-5 p-5">
        <section className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4">
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${draft.available ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
            {draft.available ? t("admin.yggdrasil.available") : t("admin.yggdrasil.unavailable")}
          </span>
          <span className="text-sm text-[var(--muted)]">{draft.disabledReason || (!draft.enabled ? t("admin.yggdrasil.disabledStatus") : draft.persistentPrivateKey ? t("admin.yggdrasil.persistentKey") : t("admin.yggdrasil.ephemeralKey"))}</span>
        </section>

        <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--line)] p-4">
          <span><strong className="block">{t("admin.yggdrasil.enabled")}</strong><span className="mt-1 block text-sm text-[var(--muted)]">{t("admin.yggdrasil.enabledDescription")}</span></span>
          <input checked={draft.enabled} className="h-5 w-5" type="checkbox" onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <TextField label={t("admin.yggdrasil.serverName")} value={draft.serverName} onChange={(serverName) => setDraft((current) => ({ ...current, serverName }))} />
          <NumberField label={t("admin.yggdrasil.tokenTtlHours")} min={1} max={720} value={draft.tokenTtlHours} onChange={(tokenTtlHours) => setDraft((current) => ({ ...current, tokenTtlHours }))} />
          <TextField label={t("admin.yggdrasil.publicBaseUrl")} value={draft.publicBaseUrl} onChange={(publicBaseUrl) => setDraft((current) => ({ ...current, publicBaseUrl }))} />
          <TextField label={t("admin.yggdrasil.textureBaseUrl")} value={draft.textureBaseUrl} onChange={(textureBaseUrl) => setDraft((current) => ({ ...current, textureBaseUrl }))} />
          <NumberField label={t("admin.yggdrasil.maxTokens")} min={1} max={100} value={draft.maxTokens} onChange={(maxTokens) => setDraft((current) => ({ ...current, maxTokens }))} />
          <NumberField label={t("admin.yggdrasil.joinTtlSeconds")} min={5} max={300} value={draft.joinTtlSeconds} onChange={(joinTtlSeconds) => setDraft((current) => ({ ...current, joinTtlSeconds }))} />
          <NumberField label={t("admin.yggdrasil.textureMaxBytes")} min={1024} max={2 * 1024 * 1024} value={draft.textureMaxBytes} onChange={(textureMaxBytes) => setDraft((current) => ({ ...current, textureMaxBytes }))} />
        </div>

        <label className="text-sm font-semibold">{t("admin.yggdrasil.trustedProxyCidrs")}
          <textarea className="field mt-2 min-h-28 resize-y font-mono" value={draft.trustedProxyCidrs.join("\n")} placeholder={t("admin.yggdrasil.trustedProxyPlaceholder")} onChange={(event) => setDraft((current) => ({ ...current, trustedProxyCidrs: splitLines(event.target.value) }))} />
          <span className="mt-1 block font-normal text-[var(--muted)]">{t("admin.yggdrasil.trustedProxyDescription")}</span>
        </label>

        <section className="rounded-lg border border-[var(--line)] p-4">
          <h3 className="font-bold">{t("admin.yggdrasil.signingKey")}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("admin.yggdrasil.signingKeyDescription")}</p>
          <textarea autoComplete="off" className="field mt-3 min-h-24 resize-y font-mono" disabled={rotatePrivateKey} placeholder={draft.hasPrivateKey ? t("admin.yggdrasil.keepExistingKey") : t("admin.yggdrasil.privateKeyPlaceholder")} value={privateKeyBase64} onChange={(event) => { setPrivateKeyBase64(event.target.value); setRotatePrivateKey(false); }} />
          <label className="mt-3 flex items-start gap-3 rounded-lg bg-[var(--panel-subtle)] p-3 text-sm">
            <input checked={rotatePrivateKey} className="mt-0.5 h-4 w-4" type="checkbox" onChange={(event) => { setRotatePrivateKey(event.target.checked); if (event.target.checked) setPrivateKeyBase64(""); }} />
            <span><strong className="block">{t("admin.yggdrasil.rotateKey")}</strong><span className="mt-1 block text-[var(--muted)]">{t("admin.yggdrasil.rotateKeyWarning")}</span></span>
          </label>
        </section>

        {message ? <p className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] px-4 py-3 text-sm font-bold">{message}</p> : null}
      </div>
    </section>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold">{label}<input className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return <label className="text-sm font-semibold">{label}<input className="field mt-2" min={min} max={max} type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function splitLines(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeAdminYggdrasilConfig(value: AdminYggdrasilConfig): AdminYggdrasilConfig {
  return {
    ...defaultAdminYggdrasilConfig,
    ...value,
    trustedProxyCidrs: Array.isArray(value?.trustedProxyCidrs) ? value.trustedProxyCidrs : [],
  };
}
