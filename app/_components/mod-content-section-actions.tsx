"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ModContentMutationResult, ModContentSection } from "../_lib/mod-content-api";
import { useI18n } from "../_lib/i18n-provider";

type LayoutSavedMessage = {
  type: "mcmods:content-layout-saved";
  siteId: string;
  sectionId: string;
  result: ModContentMutationResult;
};

export function ModContentSectionActions({ siteId, section, canArrange, canCreateResource, onChanged }: {
  siteId: string;
  section: ModContentSection;
  canArrange: boolean;
  canCreateResource: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [result, setResult] = useState<ModContentMutationResult>();

  useEffect(() => {
    function receiveLayoutResult(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin || !isLayoutSavedMessage(event.data)) return;
      if (event.data.siteId !== siteId || event.data.sectionId !== section.publicId) return;
      setResult(event.data.result);
      if (event.data.result.reviewStatus === "approved") onChanged();
    }
    window.addEventListener("message", receiveLayoutResult);
    return () => window.removeEventListener("message", receiveLayoutResult);
  }, [onChanged, section.publicId, siteId]);

  const arrangeHref = `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(section.publicId)}/arrange`;
  return <>
    {canArrange ? <Link className="button-secondary focus-ring" href={arrangeHref} target={`mcmods-layout-${section.publicId}`}>
      {t("modContent.sectionActions.arrange")}
    </Link> : null}
    {canCreateResource ? <Link className="button-primary focus-ring" href={`/mods/${encodeURIComponent(siteId)}/resources/new?version=${encodeURIComponent(section.versionPublicId)}&section=${encodeURIComponent(section.publicId)}`}>
      {t("modContent.sectionActions.add")}
    </Link> : null}
    {result ? <span className="w-full rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-bold text-[var(--accent)]" role="status">
      {t(result.reviewStatus === "pending" ? "modContent.reviewPending" : "modContent.saved")}
      {result.reviewStatus === "pending" ? <code className="ms-2 text-xs">{result.changeRequestId}</code> : null}
    </span> : null}
  </>;
}

function isLayoutSavedMessage(value: unknown): value is LayoutSavedMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<LayoutSavedMessage>;
  return message.type === "mcmods:content-layout-saved"
    && typeof message.siteId === "string"
    && typeof message.sectionId === "string"
    && Boolean(message.result);
}
