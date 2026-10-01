"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { AntiAbuseChallenge } from "../_lib/anti-abuse-api";
import { useI18n } from "../_lib/i18n-provider";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "error-callback": () => void }) => string;
      remove: (id: string) => void;
    };
  }
}

export function AntiAbuseChallengeDialog({ challenge, busy, onCancel, onSubmit }: {
  challenge: AntiAbuseChallenge;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (proof: string) => void;
}) {
  const { t } = useI18n();
  const [answer, setAnswer] = useState("");
  const [widgetToken, setWidgetToken] = useState("");
  const [widgetError, setWidgetError] = useState(false);
  const widget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (challenge.provider !== "turnstile" || !challenge.siteKey || !widget.current) return;
    let widgetId = "";
    let cancelled = false;
    const render = () => {
      if (cancelled || !widget.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(widget.current, {
        sitekey: challenge.siteKey!,
        callback: setWidgetToken,
        "error-callback": () => setWidgetError(true),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-mcmods-turnstile]");
    if (existing) {
      if (window.turnstile) render();
      else existing.addEventListener("load", render, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.mcmodsTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", () => setWidgetError(true), { once: true });
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [challenge]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const proof = challenge.provider === "turnstile" ? widgetToken : answer.trim();
    if (proof) onSubmit(`${challenge.id}:${proof}`);
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="anti-abuse-challenge-title">
      <form className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl" onSubmit={submit}>
        <h2 className="text-lg font-black" id="anti-abuse-challenge-title">{t("antiAbuse.challengeTitle")}</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{t("antiAbuse.challengeDescription")}</p>
        {challenge.provider === "proof" ? (
          <label className="mt-4 block text-sm font-bold">
            <span>{challenge.prompt || t("antiAbuse.prompt")}</span>
            <input autoFocus className="field mt-2" inputMode="numeric" value={answer} onChange={(event) => setAnswer(event.target.value)} />
          </label>
        ) : <div className="mt-4" ref={widget} />}
        {widgetError ? <p className="mt-3 text-sm font-bold text-red-600" role="alert">{t("antiAbuse.verificationUnavailable")}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="button-secondary focus-ring" disabled={busy} type="button" onClick={onCancel}>{t("common.cancel")}</button>
          <button className="button-primary focus-ring" disabled={busy || (challenge.provider === "proof" ? !answer.trim() : !widgetToken)} type="submit">
            {busy ? t("antiAbuse.verifying") : t("antiAbuse.continue")}
          </button>
        </div>
      </form>
    </div>
  );
}
