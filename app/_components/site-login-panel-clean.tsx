"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthResult, AuthUser, canAccessAdmin, cookieSessionToken, saveAuth } from "../_lib/auth";
import { API_BASE_URL, apiRequest } from "../_lib/api";
import { supportedLocales, useI18n } from "../_lib/i18n-provider";
import { normalizeInternalPath } from "../_lib/navigation";
import { MinecraftLanguagePicker } from "./minecraft-language-picker";
import { TimezonePicker } from "./timezone-picker";

const reservedUsernames = new Set(["admin", "administrator", "root", "system", "mcmods"]);
const thirdPartyProviders = [
  { key: "wechat", label: "WeChat" },
  { key: "qq", label: "QQ" },
  { key: "google", label: "Google" },
  { key: "github", label: "GitHub" },
];
export function SiteLoginPanelClean() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginMethod, setLoginMethod] = useState<"password" | "emailCode">("password");
  const [account, setAccount] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [country, setCountry] = useState("CN");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [preferredContentLanguage, setPreferredContentLanguage] = useState("zh-CN");
  const [preferredUILanguage, setPreferredUILanguage] = useState("en-US");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [message, setMessage] = useState("");
  const nextPath = normalizeInternalPath(searchParams.get("next"));

  useEffect(() => {
    if (searchParams.get("oauth") !== "success") return;
    let cancelled = false;
    void apiRequest<AuthUser>("/api/v1/auth/me")
      .then((user) => {
        if (cancelled) return;
        saveAuth({ token: cookieSessionToken, user });
        router.replace(destinationAfterLogin(nextPath, user));
      })
      .catch(() => {
        if (!cancelled) router.replace("/login?oauthError=1");
      });
    return () => {
      cancelled = true;
    };
  }, [nextPath, router, searchParams]);

  const visibleMessage = message || (searchParams.get("oauthError") ? t("login.oauthParseFailed") : "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (mode === "register") {
      const validation = validateUsername(username, t);
      if (validation) {
        setMessage(validation);
        return;
      }
    }
    setLoading(true);
    try {
      const result =
        mode === "login"
          ? loginMethod === "password"
            ? await apiRequest<AuthResult>("/api/v1/auth/login", {
                method: "POST",
                body: JSON.stringify({ account, password }),
              })
            : await apiRequest<AuthResult>("/api/v1/auth/email-login", {
                method: "POST",
                body: JSON.stringify({ email, code: emailCode }),
              })
          : await apiRequest<AuthResult>("/api/v1/auth/register", {
              method: "POST",
              body: JSON.stringify({
                username,
                email,
                code: emailCode,
                password,
                country,
                timezone,
                preferredContentLanguage,
                preferredUILanguage,
              }),
            });
      saveAuth(result);
      router.replace(destinationAfterLogin(nextPath, result.user));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("login.processing"));
    } finally {
      setLoading(false);
    }
  }

  async function requestEmailCode() {
    setMessage("");
    if (!email.includes("@")) {
      setMessage(t("login.validEmailRequired"));
      return;
    }
    setSendingCode(true);
    try {
      await apiRequest<{ sent: boolean; expiresInSeconds: number }>("/api/v1/auth/email-code", {
        method: "POST",
        body: JSON.stringify({ email, purpose: mode === "register" ? "register" : "login" }),
      });
      setMessage(t("login.emailCodeSent"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("login.validEmailRequired"));
    } finally {
      setSendingCode(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-6 lg:grid-cols-[1fr_420px]">
        <section className="space-y-5">
          <Link className="inline-flex items-center gap-3" href="/">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--accent)] font-bold text-white">M</span>
            <span className="text-xl font-bold">{t("common.appName")}</span>
          </Link>
          <div className="max-w-2xl space-y-3">
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t("login.title")}</h1>
            <p className="text-lg leading-8 text-[var(--muted)]">{t("login.subtitle")}</p>
          </div>
        </section>

        <section className="surface rounded-lg p-6 shadow-sm">
          <div className="mb-6">
            <div>
              <h2 className="text-2xl font-bold">{mode === "login" ? t("common.login") : t("common.register")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{t("login.accountPlaceholder")}</p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-[var(--panel-subtle)] p-1">
            <button className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "login" ? "bg-[var(--panel)] shadow-sm" : "text-[var(--muted)]"}`} type="button" onClick={() => setMode("login")}>{t("common.login")}</button>
            <button className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "register" ? "bg-[var(--panel)] shadow-sm" : "text-[var(--muted)]"}`} type="button" onClick={() => setMode("register")}>{t("common.register")}</button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === "login" ? (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--panel-subtle)] p-1">
                  <button className={`rounded-md px-3 py-2 text-sm font-semibold ${loginMethod === "password" ? "bg-[var(--panel)] shadow-sm" : "text-[var(--muted)]"}`} type="button" onClick={() => setLoginMethod("password")}>{t("login.passwordLogin")}</button>
                  <button className={`rounded-md px-3 py-2 text-sm font-semibold ${loginMethod === "emailCode" ? "bg-[var(--panel)] shadow-sm" : "text-[var(--muted)]"}`} type="button" onClick={() => setLoginMethod("emailCode")}>{t("login.emailCodeLogin")}</button>
                </div>
                {loginMethod === "password" ? (
                  <Field label={t("login.account")} value={account} onChange={setAccount} placeholder={t("login.accountPlaceholder")} required />
                ) : (
                  <>
                    <Field label={t("login.email")} value={email} onChange={setEmail} placeholder="name@example.com" type="email" required />
                    <label className="block text-sm font-semibold">
                      {t("login.code")}
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <input className="field" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} inputMode="numeric" required />
                        <button className="button-secondary focus-ring" disabled={sendingCode} type="button" onClick={requestEmailCode}>{sendingCode ? t("login.sendingCode") : t("login.sendCode")}</button>
                      </div>
                    </label>
                  </>
                )}
              </>
            ) : (
              <>
                <Field label={t("login.username")} maxLength={32} value={username} onChange={setUsername} required />
                <Field label={t("login.email")} value={email} onChange={setEmail} type="email" required />
                <label className="block text-sm font-semibold">
                  {t("login.code")}
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <input className="field" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" required />
                    <button className="button-secondary focus-ring" disabled={sendingCode} type="button" onClick={requestEmailCode}>{sendingCode ? t("login.sendingCode") : t("login.sendCode")}</button>
                  </div>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("login.country")} value={country} onChange={setCountry} />
                  <label className="block text-sm font-semibold">
                    {t("login.timezone")}
                    <TimezonePicker className="mt-2" title={t("timezonePicker.registrationTitle")} value={timezone} onChange={setTimezone} />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold">
                    <span>{t("login.primaryLanguage")}</span>
                    <MinecraftLanguagePicker
                      multiple={false}
                      title={t("contentLanguage.selectPrimary")}
                      values={preferredContentLanguage ? [preferredContentLanguage] : []}
                      onChange={(values) => setPreferredContentLanguage(values[0] ?? "")}
                    />
                  </label>
                  <LanguageSelect label={t("login.secondaryLanguage")} value={preferredUILanguage} onChange={setPreferredUILanguage} />
                </div>
              </>
            )}

            {mode === "register" || loginMethod === "password" ? (
              <label className="block text-sm font-semibold">
                {t("login.password")}
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <input className="field" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
                  <button className="button-secondary focus-ring" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? t("login.hidePassword") : t("login.showPassword")}</button>
                </div>
                <PasswordStrength password={password} />
              </label>
            ) : null}

            {visibleMessage ? <div className="rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 px-3 py-2 text-sm text-[var(--red)]">{visibleMessage}</div> : null}

            <button className="button-primary focus-ring w-full" disabled={loading} type="submit">
              {loading ? t("login.processing") : mode === "login" ? t("common.login") : t("login.createAccount")}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold text-[var(--muted)]">
            <span className="h-px flex-1 bg-[var(--line)]" />{t("login.thirdParty")}<span className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {thirdPartyProviders.map((provider) => <a key={provider.key} className="button-secondary focus-ring text-center" href={`${API_BASE_URL}/api/v1/auth/oauth/${provider.key}/start${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`}>{provider.label}</a>)}
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", required = false, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean; maxLength?: number }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input className="field mt-2" maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} required={required} />
    </label>
  );
}

function LanguageSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {supportedLocales.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
      </select>
    </label>
  );
}

function validateUsername(username: string, t: (key: string) => string) {
  const value = username.trim();
  if ([...value].length < 1 || [...value].length > 32) return t("login.usernameLength");
  if (value !== username || /[\p{C}\s]/u.test(value)) return t("login.usernamePattern");
  if (reservedUsernames.has(value.toLowerCase())) return t("login.usernameReserved");
  return "";
}

function PasswordStrength({ password }: { password: string }) {
  const { t } = useI18n();
  if (!password) return null;
  const score = Number(password.length >= 8) + Number(/[A-Z]/.test(password)) + Number(/[a-z]/.test(password)) + Number(/\d/.test(password)) + Number(/[^A-Za-z0-9]/.test(password));
  const label = score >= 4 ? t("login.strengthStrong") : score >= 3 ? t("login.strengthMedium") : t("login.strengthWeak");
  const color = score >= 4 ? "text-[var(--accent)]" : score >= 3 ? "text-[var(--warning)]" : "text-[var(--red)]";
  return <span className={`mt-2 block text-xs font-semibold ${color}`}>{t("login.passwordStrength", { level: label })}</span>;
}

function destinationAfterLogin(nextPath: string, user: AuthResult["user"]) {
  if (nextPath === "/admin" && !canAccessAdmin(user)) return "/user";
  return nextPath || (canAccessAdmin(user) ? "/admin" : "/user");
}
