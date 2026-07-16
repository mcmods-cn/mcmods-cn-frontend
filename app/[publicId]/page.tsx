"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";

export default function PublicShortLinkPage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const publicId = String(params.publicId || "").toLowerCase();
  const invalid = !/^[a-z0-9]{9}$/.test(publicId);

  useEffect(() => {
    if (invalid) return;
    apiRequest<{ target: string }>(`/api/v1/public-links/${publicId}`)
      .then((result) => router.replace(result.target))
      .catch((error) => { if (error instanceof ApiError) setFailed(true); });
  }, [invalid, publicId, router]);

  return <main className="grid min-h-[65vh] place-items-center px-4 text-center">{failed || invalid ? <div><h1 className="text-2xl font-black">{t("blueprints.shortLinkNotFound")}</h1><Link className="button-primary focus-ring mt-6 inline-flex" href="/">{t("common.home")}</Link></div> : <p className="text-[var(--muted)]">{t("common.loading")}</p>}</main>;
}
