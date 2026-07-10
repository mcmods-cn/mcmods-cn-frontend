"use client";

import { useI18n } from "../_lib/i18n-provider";

export default function MessagesPage() {
  const { t } = useI18n();
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="surface rounded-lg p-6">
          <p className="text-sm font-bold text-[var(--accent)]">{t("messages.kicker")}</p>
          <h1 className="mt-2 text-2xl font-black">{t("messages.title")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {t("messages.description")}
          </p>
        </div>
      </section>
    </main>
  );
}
