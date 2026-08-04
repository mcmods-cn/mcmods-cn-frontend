"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { ServerSubmissionWizard } from "./server-submission-wizard";

export function ServerSubmissionPage() {
  const { t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const router = useRouter();

  function leaveSubmission() {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) router.replace("/servers");
    }, 100);
  }

  if (!ready) {
    return <PageMessage message={t("common.loading")} />;
  }
  if (!user) {
    return <PageMessage message={t("servers.loginToSubmit")} />;
  }
  if (!hasPermission(user, "server.create")) {
    return <PageMessage message={t("servers.permissionRequired")} />;
  }

  return (
    <ServerSubmissionWizard
      presentation="page"
      token={token}
      onClose={leaveSubmission}
      onSubmitted={(id) => router.replace(`/servers/${id}`)}
    />
  );
}

function PageMessage({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-16 text-[var(--foreground)]">
      <section className="surface mx-auto max-w-xl rounded-xl border border-[var(--line)] p-6 text-center shadow-sm">
        <p className="font-bold text-[var(--muted)]">{message}</p>
        <Link className="button-secondary focus-ring mt-5 inline-flex" href="/servers">
          {t("servers.detail.back")}
        </Link>
      </section>
    </main>
  );
}
