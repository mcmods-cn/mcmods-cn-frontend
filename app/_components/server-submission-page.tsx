"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasPermission, useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { ServerSubmissionWizard } from "./server-submission-wizard";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

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
    return <PageFeedback title={t("common.loading")} />;
  }
  if (!user) {
    return <LoginRequiredState nextPath="/servers/new" description={t("servers.loginToSubmit")} />;
  }
  if (!hasPermission(user, "server.create")) {
    return <PageFeedback title={t("servers.permissionRequired")} action={<Link className="button-secondary focus-ring inline-flex" href="/servers">{t("servers.detail.back")}</Link>} />;
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
