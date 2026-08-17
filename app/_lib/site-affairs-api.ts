import { apiRequest } from "./api";

export type SiteAffairsPage = {
  code: string;
  locale: string;
  title: string;
  bodyMarkdown: string;
};

export type SiteChangelog = {
  id: string;
  changeDate: string;
  locale: string;
  title: string;
  bodyMarkdown: string;
};

export type BlackroomRecord = {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  reasonCode: string;
  customReason: string;
  status: "temporary" | "permanent" | "released" | string;
  startsAt: string;
  endsAt?: string;
  revokedAt?: string;
  publicRecordMarkdown?: string;
};

export function loadAboutPage(locale: string) {
  return apiRequest<SiteAffairsPage>(`/api/v1/site-affairs/about?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
}

export function loadSiteChangelogs(locale: string, offset = 0) {
  return apiRequest<{ items: SiteChangelog[]; limit: number; offset: number }>(
    `/api/v1/site-affairs/changelogs?locale=${encodeURIComponent(locale)}&limit=30&offset=${offset}`,
    { cache: "no-store" },
  );
}

export function loadSiteChangelog(id: string, locale: string) {
  return apiRequest<SiteChangelog>(`/api/v1/site-affairs/changelogs/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
}

export function loadBlackroom(offset = 0) {
  return apiRequest<{ items: BlackroomRecord[]; limit: number; offset: number }>(
    `/api/v1/site-affairs/blackroom?limit=30&offset=${offset}`,
    { cache: "no-store" },
  );
}

export function loadBlackroomRecord(id: string) {
  return apiRequest<BlackroomRecord>(`/api/v1/site-affairs/blackroom/${encodeURIComponent(id)}`, { cache: "no-store" });
}
