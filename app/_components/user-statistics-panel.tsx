"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useI18n } from "../_lib/i18n-provider";
import type { UserLevelSummary } from "../_lib/user-api";

type ActivityStatistics = {
  actionCount: number;
  viewCount: number;
  editCount: number;
  createCount: number;
  deleteCount: number;
  markdownAddedBytes: number;
  markdownDeletedBytes: number;
  markdownChangedBytes: number;
  markdownNetBytes: number;
  activeDays: number;
  actionCounts: Record<string, number>;
  firstActivityAt?: string;
  lastActivityAt?: string;
  lastEditAt?: string;
  lastCommentAt?: string;
};

type UserStatistics = {
  userId: string;
  range: string;
  full: boolean;
  registeredDays: number;
  lastLoginAt?: string;
  totalActiveDays: number;
  recent7ActiveDays: number;
  recent30ActiveDays: number;
  currentActiveStreak: number;
  longestActiveStreak: number;
  cumulative?: ActivityStatistics;
  selectedRange?: ActivityStatistics;
  contentCreation: Array<{ contentType: string; total: number; existing: number; approved: number; pending: number; rejected: number }>;
  editReviews?: { total: number; approved: number; pending: number; rejected: number; other: number; editedObjectCount: number; revisionCount: number; lastEditAt?: string };
  community: {
    comments: number; replies: number; acceptedAnswers: number; likesGiven: number; likesReceived: number;
    favorites: number; followers: number; following: number; reports: number; effectiveReports: number;
    hiddenOrDeletedComments: number; lastCommentAt?: string;
  };
  level: UserLevelSummary;
  experienceSources?: Record<string, number>;
};

const ranges = ["all", "7d", "30d", "90d", "1y"] as const;

export function UserStatisticsPanel({ token }: { token: string }) {
  const { locale, t } = useI18n();
  const [range, setRange] = useState<(typeof ranges)[number]>("all");
  const [statistics, setStatistics] = useState<UserStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      apiRequest<UserStatistics>(`/api/v1/users/me/statistics?range=${range}`, {}, token)
        .then((value) => { if (!cancelled) setStatistics(value); })
        .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("user.statisticsLoadFailed")); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [range, t, token]);

  if (loading && !statistics) return <section className="surface rounded-lg p-8 text-center text-sm text-[var(--muted)]">{t("common.loading")}</section>;
  if (error && !statistics) return <section className="surface rounded-lg p-6 text-sm text-[var(--red)]">{error}</section>;
  if (!statistics) return null;
  const selected = statistics.selectedRange ?? statistics.cumulative;
  const progress = Math.max(0, Math.min(100, statistics.level.progressPercent));
  return (
    <section className="grid gap-4">
      <div className="surface flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
        <div><h2 className="text-xl font-black">{t("user.statistics")}</h2><p className="text-sm text-[var(--muted)]">{t("user.statisticsDescription")}</p></div>
        <label className="text-sm font-semibold">{t("user.statisticsRange")} <select className="field ml-2 w-auto" value={range} onChange={(event) => setRange(event.target.value as typeof range)}>{ranges.map((value) => <option key={value} value={value}>{t(`user.statisticsRanges.${value}`)}</option>)}</select></label>
      </div>
      {error ? <p className="rounded-lg border border-[var(--line)] p-3 text-sm text-[var(--red)]">{error}</p> : null}

      <StatisticsSection title={t("user.statisticsOverview")}>
        <Metric label={t("user.totalOperations")} value={number(selected?.actionCount, locale)} />
        <Metric label={t("user.totalEdits")} value={number(selected?.editCount, locale)} />
        <Metric label={t("user.activeDays")} value={number(selected?.activeDays, locale)} />
        <Metric label={t("user.createdContent")} value={number(statistics.contentCreation.reduce((sum, item) => sum + item.total, 0), locale)} />
      </StatisticsSection>

      <StatisticsSection title={t("user.editContribution")}>
        <Metric label={t("user.changedBytes")} value={number(selected?.markdownChangedBytes, locale)} />
        <Metric label={t("user.addedBytes")} value={number(selected?.markdownAddedBytes, locale)} />
        <Metric label={t("user.deletedBytes")} value={number(selected?.markdownDeletedBytes, locale)} />
        <Metric label={t("user.netBytes")} value={number(selected?.markdownNetBytes, locale)} />
        <Metric label={t("user.approvedEdits")} value={number(statistics.editReviews?.approved, locale)} />
        <Metric label={t("user.rejectedEdits")} value={number(statistics.editReviews?.rejected, locale)} />
        <Metric label={t("user.editedObjects")} value={number(statistics.editReviews?.editedObjectCount, locale)} />
        <Metric label={t("user.revisionsCreated")} value={number(statistics.editReviews?.revisionCount, locale)} />
      </StatisticsSection>

      <section className="surface rounded-lg p-5">
        <h3 className="text-lg font-black">{t("user.contentCreationStatistics")}</h3>
        {statistics.contentCreation.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="text-[var(--muted)]"><th className="border-b border-[var(--line)] p-2">{t("user.contentType")}</th><th>{t("user.total")}</th><th>{t("user.existing")}</th><th>{t("user.approved")}</th><th>{t("user.pending")}</th><th>{t("user.rejected")}</th></tr></thead><tbody>{statistics.contentCreation.map((item) => <tr key={item.contentType}><th className="border-b border-[var(--line)] p-2">{t(`user.statisticsContentTypes.${item.contentType}`)}</th><td>{item.total}</td><td>{item.existing}</td><td>{item.approved}</td><td>{item.pending}</td><td>{item.rejected}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-[var(--muted)]">{t("user.noStatistics")}</p>}
      </section>

      <StatisticsSection title={t("user.communityInteraction")}>
        <Metric label={t("user.commentsPublished")} value={number(statistics.community.comments, locale)} />
        <Metric label={t("user.repliesPublished")} value={number(statistics.community.replies, locale)} />
        <Metric label={t("user.acceptedAnswers")} value={number(statistics.community.acceptedAnswers, locale)} />
        <Metric label={t("user.likesReceived")} value={number(statistics.community.likesReceived, locale)} />
        <Metric label={t("user.favoritesCount")} value={number(statistics.community.favorites, locale)} />
        <Metric label={t("user.hiddenComments")} value={number(statistics.community.hiddenOrDeletedComments, locale)} />
      </StatisticsSection>

      <StatisticsSection title={t("user.activityStatistics")}>
        <Metric label={t("user.registeredDays")} value={number(statistics.registeredDays, locale)} />
        <Metric label={t("user.totalActiveDays")} value={number(statistics.totalActiveDays, locale)} />
        <Metric label={t("user.recent7ActiveDays")} value={number(statistics.recent7ActiveDays, locale)} />
        <Metric label={t("user.recent30ActiveDays")} value={number(statistics.recent30ActiveDays, locale)} />
        <Metric label={t("user.currentStreak")} value={number(statistics.currentActiveStreak, locale)} />
        <Metric label={t("user.longestStreak")} value={number(statistics.longestActiveStreak, locale)} />
      </StatisticsSection>

      <section className="surface rounded-lg p-5">
        <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-black">{t("user.levelAndExperience")}</h3><p className="text-sm text-[var(--muted)]">{t("user.levelShort", { level: statistics.level.level })}</p></div><strong className="text-xl">{statistics.level.experience.toLocaleString(locale)} XP</strong></div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--panel-subtle)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} /></div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]"><span>{statistics.level.experienceInLevel.toLocaleString(locale)} XP</span><span>{t("user.experienceToNext", { count: statistics.level.experienceToNextLevel.toLocaleString(locale) })}</span><span>{t("user.lifetimeExperience")}: {statistics.level.lifetimeExperience.toLocaleString(locale)}</span></div>
      </section>
    </section>
  );
}

function StatisticsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="surface rounded-lg p-5"><h3 className="text-lg font-black">{title}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-4"><strong className="block text-2xl">{value}</strong><span className="mt-1 block text-xs font-semibold text-[var(--muted)]">{label}</span></div>;
}

function number(value: number | undefined, locale: string) {
  return (value ?? 0).toLocaleString(locale);
}
