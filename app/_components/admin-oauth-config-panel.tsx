"use client";

import { type FormEvent, useState } from "react";
import { API_BASE_URL, apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { oauthProviders } from "../_lib/oauth-navigation.mts";
import { hasCompleteOAuthConfig, type OAuthConfig, type OAuthProviderConfig } from "../_lib/oauth-settings.mts";
import { cleanError, notifyAdminNotice } from "./admin-console-shared";

function providerForm({ enabled, clientId, redirectUri }: OAuthProviderConfig) {
  return { enabled, clientId, redirectUri, clientSecret: "" };
}
type ProviderForm = ReturnType<typeof providerForm>;

export function OAuthSettingsPanel({ config, token }: { config: OAuthConfig; token: string }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(config.providers);
  const [edits, setEdits] = useState<Record<string, ProviderForm>>({});
  const [saving, setSaving] = useState(false);

  function edit(key: string, change: Partial<ProviderForm>) {
    setEdits(current => {
      const original = saved[key];
      const value = { ...(current[key] ?? providerForm(original)), ...change };
      const next = { ...current };
      if (!value.clientSecret && value.enabled === original.enabled && value.clientId === original.clientId && value.redirectUri === original.redirectUri) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || Object.keys(edits).length === 0) return;
    setSaving(true);
    try {
      const updated = await apiRequest<OAuthConfig>("/api/v1/admin/config/oauth", {
        method: "PUT", body: JSON.stringify({ providers: edits }),
      }, token);
      if (!hasCompleteOAuthConfig(updated)) throw new Error(t("common.loadFailed"));
      setSaved(updated.providers);
      setEdits({});
      notifyAdminNotice(t("admin.saveSuccess"));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return <section className="surface rounded-lg p-4 lg:col-span-2">
    <h2 className="mb-3 text-lg font-bold">{t("admin.oauthConfig")}</h2>
    <form onSubmit={save}>
      <fieldset className="grid min-w-0 gap-4" disabled={saving}>
        {oauthProviders.map(({ key, label }) => {
          const value = edits[key] ?? providerForm(saved[key]);
          return <div key={key} className="grid gap-3 rounded-lg border border-[var(--line)] p-3 lg:grid-cols-[120px_1fr_1fr_1fr]">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input checked={value.enabled} name={`${key}.enabled`} type="checkbox" onChange={event => edit(key, { enabled: event.target.checked })} />
              {label}
            </label>
            <input className="field" name={`${key}.clientId`} value={value.clientId} placeholder="AppID / Client ID" aria-label={`${label} Client ID`} onChange={event => edit(key, { clientId: event.target.value })} />
            <input className="field" name={`${key}.clientSecret`} type="password" autoComplete="new-password" value={value.clientSecret} aria-label={`${label} Client Secret`}
              placeholder={saved[key].hasClientSecret ? t("admin.clientSecretSaved") : "AppSecret / Client Secret"} onChange={event => edit(key, { clientSecret: event.target.value })} />
            <input className="field" name={`${key}.redirectUri`} value={value.redirectUri} aria-label={`${label} redirect_uri`}
              placeholder={`${API_BASE_URL}/api/v1/auth/oauth/${key}/callback`} onChange={event => edit(key, { redirectUri: event.target.value })} />
          </div>;
        })}
        <div><button className="button-primary focus-ring" type="submit" disabled={!Object.keys(edits).length}>{t("admin.saveOauth")}</button></div>
      </fieldset>
    </form>
  </section>;
}
