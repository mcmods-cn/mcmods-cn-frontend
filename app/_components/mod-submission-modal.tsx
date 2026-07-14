"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

type SubmissionMethod = "modrinth" | "curseforge" | "github" | "manual";
type ProviderAvailability = Record<Exclude<SubmissionMethod, "manual">, { enabled: boolean; configured: boolean }>;

export function ModSubmissionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const [method, setMethod] = useState<Exclude<SubmissionMethod, "manual"> | null>(null);
  const [url, setURL] = useState("");
  const [providers, setProviders] = useState<ProviderAvailability | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiRequest<ProviderAvailability>("/api/v1/mod-imports/providers")
      .then((value) => { if (!cancelled) setProviders(value); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  function close() {
    setMethod(null);
    setURL("");
    onClose();
  }

  function choose(next: SubmissionMethod) {
    if (next === "manual") {
      close();
      router.push("/mods/new?method=manual");
      return;
    }
    setMethod(next);
  }

  function continueImport() {
	if (!method || !isValidProviderURL(method, url)) return;
    close();
    router.push(`/mods/new?method=${method}&url=${encodeURIComponent(url.trim())}`);
  }

  const validURL = method ? isValidProviderURL(method, url) : false;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={close}>
      <section className="surface max-h-[85dvh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[var(--line)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="mod-submission-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-5 py-4">
          <h2 id="mod-submission-title" className="text-xl font-black">{t("mods.submission.title")}</h2>
          <button className="button-secondary focus-ring" type="button" onClick={close}>{t("common.close")}</button>
        </header>
        {!method ? (
          <div className="p-5">
            <p className="text-sm leading-6 text-[var(--muted)]">{t("mods.submission.chooseMethod")}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(["modrinth", "curseforge", "github", "manual"] as SubmissionMethod[]).map((item, index) => (
                <button key={item} className="focus-ring min-h-32 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-left enabled:hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55" disabled={item !== "manual" && providers !== null && (!providers[item].enabled || !providers[item].configured)} type="button" onClick={() => choose(item)}>
                  <span className="flex items-center justify-between gap-3">
                    <strong className="text-lg">{index + 1}. {t(`mods.submission.methods.${item}.title`)}</strong>
                    {item === "modrinth" ? <span className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-bold text-white">{t("mods.submission.recommended")}</span> : null}
                    {item === "github" ? <span className="rounded border border-[var(--warning)] px-2 py-1 text-xs font-bold text-[var(--warning)]">{t("mods.submission.notRecommended")}</span> : null}
                    {item !== "manual" && providers !== null && (!providers[item].enabled || !providers[item].configured) ? <span className="text-xs font-bold text-[var(--red)]">{t("mods.submission.unavailable")}</span> : null}
                  </span>
                  <span className="mt-3 block text-sm leading-6 text-[var(--muted)]">{t(`mods.submission.methods.${item}.description`)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-7">
            <label className="block">
              <span className="mb-2 block text-sm font-black">{t("mods.submission.importURL", { source: t(`mods.submission.methods.${method}.title`) })}</span>
              <input autoFocus className="field h-12 w-full" type="url" value={url} placeholder={t(`mods.submission.methods.${method}.placeholder`)} onChange={(event) => setURL(event.target.value)} />
            </label>
			{url.trim() && !validURL ? <p className="mt-2 text-sm font-bold text-[var(--red)]">{t("mods.submission.invalidProviderURL")}</p> : null}
            <p className="mt-3 text-sm text-[var(--muted)]">{t("mods.submission.autoPending")}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="button-secondary focus-ring" type="button" onClick={() => setMethod(null)}>{t("mods.submission.actions.back")}</button>
			  <button className="button-primary focus-ring" disabled={!validURL} type="button" onClick={continueImport}>{t("mods.submission.parseAndContinue")}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function isValidProviderURL(provider: Exclude<SubmissionMethod, "manual">, value: string) {
	try {
		const parsed = new URL(value.trim());
		if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) return false;
		const host = parsed.hostname.toLowerCase();
		const segments = parsed.pathname.split("/").filter(Boolean);
		if (provider === "modrinth") return ["modrinth.com", "www.modrinth.com"].includes(host) && segments[0] === "mod" && Boolean(segments[1]);
		if (provider === "curseforge") return ["curseforge.com", "www.curseforge.com"].includes(host) && segments[0] === "minecraft" && segments[1] === "mc-mods" && Boolean(segments[2]);
		return ["github.com", "www.github.com"].includes(host) && Boolean(segments[0] && segments[1]);
	} catch {
		return false;
	}
}
