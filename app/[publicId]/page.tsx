"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { classifyShortLinkFailure, type ShortLinkState } from "../_lib/short-link-state.mts";

export default function PublicShortLinkPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [state, setState] = useState<ShortLinkState>("loading");
  const [attempt, setAttempt] = useState(0);
  const publicId = String(params.publicId || "").toLowerCase();
  const invalid = !/^[a-z0-9]{9}$/.test(publicId);

  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await apiRequest<{ target?: unknown }>(`/api/v1/public-links/${publicId}`, { signal: controller.signal });
        const target = typeof result.target === "string" ? result.target.trim() : "";
        if (!target) throw new Error("Public link response is missing its target");
        if (!controller.signal.aborted) router.replace(target);
      } catch (error) {
        if (controller.signal.aborted) return;
        setState(classifyShortLinkFailure(error instanceof ApiError ? error.status : undefined));
      }
    })();
    return () => controller.abort();
  }, [attempt, invalid, publicId, router]);

  const visibleState = invalid ? "not_found" : state;
  return <main className="grid min-h-[65vh] place-items-center px-4 text-center">
    {visibleState === "loading" ? <p className="text-[var(--muted)]">{t("common.loading")}</p> : <div>
      <h1 className="text-2xl font-black">{t(visibleState === "not_found" ? "blueprints.shortLinkNotFound" : "blueprints.shortLinkLoadFailed")}</h1>
      <div className="mt-6 flex justify-center gap-2">
        {visibleState === "error" ? <button className="button-primary focus-ring" type="button" onClick={() => { setState("loading"); setAttempt((current) => current + 1); }}>{t("blueprints.retry")}</button> : null}
        <Link className="button-secondary focus-ring inline-flex" href="/">{t("common.home")}</Link>
      </div>
    </div>}
  </main>;
}
