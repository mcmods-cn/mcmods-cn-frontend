"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import { normalizeInternalPath } from "../_lib/navigation";

export default function PublicShortLinkPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [failedPublicId, setFailedPublicId] = useState("");
  const publicId = String(params.publicId || "").toLowerCase();
  const invalid = !/^[a-z0-9]{9}$/.test(publicId);

  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    apiRequest<{ target: string }>(`/api/v1/public-links/${publicId}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const target = normalizeInternalPath(result.target);
        if (!target) throw new Error("invalid short-link target");
        router.replace(target);
      })
      .catch(() => { if (!controller.signal.aborted) setFailedPublicId(publicId); });
    return () => controller.abort();
  }, [invalid, publicId, router]);

  return <main className="grid min-h-[65vh] place-items-center px-4 text-center">{failedPublicId === publicId || invalid ? <div><h1 className="text-2xl font-black">{t("blueprints.shortLinkNotFound")}</h1><Link className="button-primary focus-ring mt-6 inline-flex" href="/">{t("common.home")}</Link></div> : <p className="text-[var(--muted)]">{t("common.loading")}</p>}</main>;
}
