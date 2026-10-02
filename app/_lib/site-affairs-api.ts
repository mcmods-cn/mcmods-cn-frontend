import { apiRequest } from "./api";
import { normalizeBlackroomStatus, type BlackroomStatus } from "./blackroom-status";

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

export type SiteChangelogPage<T = SiteChangelog> = {
  items: T[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

export type BlackroomRecord = {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  reasonCode: string;
  customReason: string;
  status: BlackroomStatus;
  startsAt: string;
  endsAt?: string;
  revokedAt?: string;
  publicRecordMarkdown?: string;
};

export type BlackroomPage = {
  items: BlackroomRecord[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

type BlackroomWireRecord = Omit<BlackroomRecord, "status"> & { status: unknown };
type BlackroomWirePage = Omit<BlackroomPage, "items"> & { items: BlackroomWireRecord[] };

function normalizeBlackroomRecord(record: BlackroomWireRecord): BlackroomRecord {
  return { ...record, status: normalizeBlackroomStatus(record.status) };
}

export function loadAboutPage(locale: string) {
  return apiRequest<SiteAffairsPage>(`/api/v1/site-affairs/about?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
}

export function loadSiteChangelogs(locale: string, cursor = "") {
  const pageCursor = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return apiRequest<SiteChangelogPage>(
    `/api/v1/site-affairs/changelogs?locale=${encodeURIComponent(locale)}&limit=30${pageCursor}`,
    { cache: "no-store" },
  );
}

export function loadSiteChangelog(id: string, locale: string) {
  return apiRequest<SiteChangelog>(`/api/v1/site-affairs/changelogs/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
}

export function loadBlackroom(cursor = "") {
  const pageCursor = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return apiRequest<BlackroomWirePage>(
    `/api/v1/site-affairs/blackroom?limit=30${pageCursor}`,
    { cache: "no-store" },
  ).then((page) => ({ ...page, items: page.items.map(normalizeBlackroomRecord) }));
}

export function loadBlackroomRecord(id: string) {
  return apiRequest<BlackroomWireRecord>(`/api/v1/site-affairs/blackroom/${encodeURIComponent(id)}`, { cache: "no-store" })
    .then(normalizeBlackroomRecord);
}
