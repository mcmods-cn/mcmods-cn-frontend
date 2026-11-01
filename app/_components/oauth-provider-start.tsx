"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "../_lib/api";
import { runAuthenticationMutation } from "../_lib/authentication-mutation.mts";
import { useI18n } from "../_lib/i18n-provider";

export function OAuthProviderStart({ target }: { target: string }) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    void runAuthenticationMutation(API_BASE_URL, async ({ assertCurrent }) => {
      if (cancelled) return;
      assertCurrent();
      // A real anchor reaches this page in the same tab or a new tab. Waiting
      // here preserves modifier-click behavior and the validated return path.
      window.location.replace(target);
    }).catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Sign-in is unavailable; retry."); });
    return () => { cancelled = true; };
  }, [attempt, target]);
  return <main className="page-shell py-12"><section className="surface space-y-4 p-6" role="status">
    <p>{!target ? t("login.oauthParseFailed") : message || t("login.processing")}</p>
    {message && target ? <button className="button-secondary focus-ring" type="button" onClick={() => { setMessage(""); setAttempt(value => value + 1); }}>{t("common.retry")}</button> : null}
    <Link className="button-secondary focus-ring" href="/login">{t("common.login")}</Link>
  </section></main>;
}
