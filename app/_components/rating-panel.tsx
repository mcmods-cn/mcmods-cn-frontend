"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import {
  deleteRating,
  getRatingReviews,
  getRatingSummary,
  RatingItem,
  RatingList,
  RatingPayload,
  RatingSummary,
  RatingTargetType,
  saveRating,
} from "../_lib/rating-api";

type RatingPanelProps = {
  targetType: RatingTargetType;
  targetId: string;
  targetName: string;
};

export function RatingPanel({ targetType, targetId, targetName }: RatingPanelProps) {
  const { t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [loadedScope, setLoadedScope] = useState("");
  const [failedScope, setFailedScope] = useState("");
  const requestSequence = useRef(0);
  const scope = JSON.stringify([targetType, targetId, token, user?.id]);

  const loadSummary = useCallback(() => {
    const sequence = ++requestSequence.current;
    return getRatingSummary(targetType, targetId, token).then((next) => {
      if (sequence === requestSequence.current) {
        setSummary(next);
        setLoadedScope(scope);
        setError("");
      }
    }).catch((reason) => {
      if (sequence === requestSequence.current) {
        setError(reason instanceof Error ? reason.message : t("ratings.loadFailed"));
        setFailedScope(scope);
      }
    }).finally(() => {
      if (sequence === requestSequence.current) setLoading(false);
    });
  }, [scope, t, targetId, targetType, token]);

  useEffect(() => {
    if (!ready) return;
    void loadSummary();
    return () => { requestSequence.current += 1; };
  }, [loadSummary, ready, user?.id]);

  const currentSummary = summary && loadedScope === scope;
  if ((!ready || loading || failedScope !== scope) && !currentSummary) return <section className="mt-8 h-64 animate-pulse rounded-xl bg-[var(--panel-subtle)]" aria-label={t("ratings.loading")} />;
  if (error && !currentSummary) return <section className="mt-8 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-5 text-sm font-bold text-[var(--danger)]" role="alert">{t("ratings.loadFailed")}<button className="button-secondary focus-ring ml-3" type="button" onClick={() => { setLoading(true); setError(""); void loadSummary(); }}>{t("common.retry")}</button></section>;
  if (!summary || !currentSummary) return null;

  return (
    <section className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">{t("ratings.title")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("ratings.description", { name: targetName })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.canViewReviews ? <button className="button-secondary focus-ring" type="button" onClick={() => setReviewsOpen(true)}>{t("ratings.viewReviews", { count: summary.ratingCount })}</button> : null}
          {summary.canRate ? <button className="button-primary focus-ring" type="button" onClick={() => setEditorOpen(true)}>{summary.myRating ? t("ratings.editMine") : t("ratings.rate")}</button> : !user ? <Link className="button-primary focus-ring" href="/login">{t("ratings.loginToRate")}</Link> : null}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
        <div className="rounded-xl bg-[var(--panel-subtle)] p-5 text-center">
          <strong className="block text-5xl font-black text-[var(--accent)]">{summary.ratingCount ? summary.overallAverage.toFixed(1) : "—"}</strong>
          <div className="mt-2 flex justify-center"><ReadonlyStars value={summary.overallAverage} /></div>
          <span className="mt-2 block text-sm font-bold text-[var(--muted)]">{t("ratings.ratingCount", { count: summary.ratingCount })}</span>
          <dl className="mt-5 grid grid-cols-2 gap-2 text-left text-xs">
            <Metric label={t("ratings.heat")} value={formatNumber(summary.heatScore)} />
            <Metric label={t("ratings.views")} value={formatNumber(summary.engagement.views)} />
            <Metric label={t("ratings.favorites")} value={formatNumber(summary.engagement.favorites)} />
            <Metric label={t("ratings.downloads")} value={formatNumber(summary.engagement.downloads)} />
            <Metric label={t("ratings.comments")} value={formatNumber(summary.engagement.comments)} />
          </dl>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(300px,440px)_minmax(0,1fr)] xl:items-center">
          <RatingRadar dimensions={summary.dimensions} />
          <div className="grid gap-3">
            {summary.dimensions.map((dimension) => <DimensionBar key={dimension.code} code={dimension.code} value={dimension.average} count={dimension.count} />)}
          </div>
        </div>
      </div>

      {summary.ratingCount === 0 ? <p className="mt-5 rounded-lg border border-dashed border-[var(--line)] p-5 text-center text-sm font-bold text-[var(--muted)]">{t("ratings.empty")}</p> : null}
      {editorOpen ? <RatingEditor key={scope} summary={summary} targetName={targetName} onClose={() => setEditorOpen(false)} onSaved={loadSummary} token={token} /> : null}
      {reviewsOpen ? <RatingReviews key={scope} targetType={targetType} targetId={targetId} targetName={targetName} token={token} onClose={() => setReviewsOpen(false)} /> : null}
    </section>
  );
}

function RatingEditor({ summary, targetName, token, onClose, onSaved }: { summary: RatingSummary; targetName: string; token: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const initialScores = useMemo(() => Object.fromEntries(summary.dimensions.map((dimension) => [dimension.code, summary.myRating?.scores[dimension.code] ?? 3])), [summary.dimensions, summary.myRating]);
  const [overallScore, setOverallScore] = useState(summary.myRating?.overallScore ?? 5);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [message, setMessage] = useState(summary.myRating?.message ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const payload: RatingPayload = { overallScore, scores, message };
      await saveRating(summary.targetType, summary.targetId, payload, token);
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("ratings.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("ratings.deleteConfirm"))) return;
    setSubmitting(true);
    setError("");
    try {
      await deleteRating(summary.targetType, summary.targetId, token);
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("ratings.deleteFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return <Modal title={t("ratings.editorTitle", { name: targetName })} onClose={onClose}>
    <div className="grid gap-6">
      <div><span className="block text-sm font-black">{t("ratings.overall")}</span><div className="mt-2"><StarInput value={overallScore} onChange={setOverallScore} /></div></div>
      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        {summary.dimensions.map((dimension) => <div key={dimension.code} className="grid gap-3 border-b border-[var(--line)] p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><span className="font-bold">{t(`ratings.dimensions.${dimension.code}`)}</span><StarInput value={scores[dimension.code]} onChange={(value) => setScores((current) => ({ ...current, [dimension.code]: value }))} /></div>)}
      </div>
      <label className="grid gap-2"><span className="font-black">{t("ratings.message")}</span><textarea className="input min-h-32 resize-y" maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("ratings.messagePlaceholder")} /><span className="text-right text-xs text-[var(--muted)]">{message.length}/2000</span></label>
      {error ? <p className="rounded-md bg-[var(--danger-soft)] p-3 text-sm font-bold text-[var(--danger)]">{error}</p> : null}
      <div className="flex flex-wrap justify-between gap-3">
        <div>{summary.myRating ? <button className="button-secondary focus-ring text-[var(--danger)]" disabled={submitting} type="button" onClick={remove}>{t("common.delete")}</button> : null}</div>
        <div className="flex gap-2"><button className="button-secondary focus-ring" disabled={submitting} type="button" onClick={onClose}>{t("common.cancel")}</button><button className="button-primary focus-ring" disabled={submitting} type="button" onClick={submit}>{submitting ? t("common.saving") : t("common.save")}</button></div>
      </div>
    </div>
  </Modal>;
}

function RatingReviews({ targetType, targetId, targetName, token, onClose }: { targetType: RatingTargetType; targetId: string; targetName: string; token: string; onClose: () => void }) {
  const { locale, t } = useI18n();
  const [result, setResult] = useState<RatingList | null>(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setError("");
        setResult(null);
      }
    });
    getRatingReviews(targetType, targetId, token, offset)
      .then((value) => { if (!cancelled) setResult(value); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("ratings.reviewsLoadFailed")); });
    return () => { cancelled = true; };
  }, [offset, t, targetId, targetType, token]);
  return <Modal title={t("ratings.reviewsTitle", { name: targetName })} onClose={onClose} wide>
    {error ? <p className="rounded-md bg-[var(--danger-soft)] p-3 font-bold text-[var(--danger)]">{error}</p> : null}
    {!result && !error ? <div className="h-48 animate-pulse rounded-lg bg-[var(--panel-subtle)]" /> : null}
    <div className="grid gap-4">{result?.items.map((item) => <RatingReviewCard key={item.id} item={item} locale={locale} />)}</div>
    {result && !result.items.length ? <p className="py-12 text-center font-bold text-[var(--muted)]">{t("ratings.empty")}</p> : null}
    {result && result.total > result.limit ? <div className="mt-5 flex items-center justify-between"><button className="button-secondary focus-ring" disabled={offset === 0} type="button" onClick={() => setOffset(Math.max(0, offset - result.limit))}>{t("common.previous")}</button><span className="text-sm font-bold text-[var(--muted)]">{offset + 1}–{Math.min(offset + result.limit, result.total)} / {result.total}</span><button className="button-secondary focus-ring" disabled={offset + result.limit >= result.total} type="button" onClick={() => setOffset(offset + result.limit)}>{t("common.next")}</button></div> : null}
  </Modal>;
}

function RatingReviewCard({ item, locale }: { item: RatingItem; locale: string }) {
  const { t } = useI18n();
  return <article className="rounded-lg border border-[var(--line)] p-4">
    <div className="flex items-center gap-3">
      {item.authorAvatar ? <Image unoptimized alt="" className="h-11 w-11 rounded-full object-cover" height={44} src={item.authorAvatar} width={44} /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--panel-subtle)] font-black">{(item.authorName || "?").slice(0, 2)}</span>}
      <div className="min-w-0 flex-1"><strong className="block truncate">{item.authorName || t("ratings.anonymous")}</strong><span className="text-xs text-[var(--muted)]">{new Date(item.updatedAt).toLocaleString(locale)}</span></div>
      <div className="text-right"><ReadonlyStars value={item.overallScore} /><strong className="mt-1 block text-sm">{item.overallScore.toFixed(1)}</strong></div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">{Object.entries(item.scores).map(([code, value]) => <span className="rounded-full bg-[var(--panel-subtle)] px-3 py-1 text-xs font-bold" key={code}>{t(`ratings.dimensions.${code}`)} {value}/5</span>)}</div>
    {item.message ? <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{item.message}</p> : null}
  </article>;
}

function RatingRadar({ dimensions }: { dimensions: RatingSummary["dimensions"] }) {
  const { t } = useI18n();
  const width = 420;
  const height = 360;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 112;
  const labelRadius = 146;
  const point = (index: number, value: number, targetRadius = radius) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / dimensions.length;
    const distance = targetRadius * value;
    return [centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance] as const;
  };
  const polygon = (level: number) => dimensions.map((_, index) => point(index, level / 5).join(",")).join(" ");
  const data = dimensions.map((dimension, index) => point(index, dimension.average / 5).join(",")).join(" ");
  return <svg className="mx-auto block h-auto w-full max-w-[440px]" role="img" viewBox={`0 0 ${width} ${height}`} aria-label={t("ratings.radarAria")}>
    {[1, 2, 3, 4, 5].map((level) => <polygon key={level} fill="none" points={polygon(level)} stroke="var(--line)" strokeWidth="1" />)}
    {dimensions.map((dimension, index) => { const [x, y] = point(index, 1); return <line key={dimension.code} stroke="var(--line)" x1={centerX} x2={x} y1={centerY} y2={y} />; })}
    {dimensions.some((dimension) => dimension.count > 0) ? <polygon fill="var(--accent)" fillOpacity="0.2" points={data} stroke="var(--accent)" strokeWidth="3" /> : null}
    {dimensions.map((dimension, index) => {
      const [x, y] = point(index, 1, labelRadius);
      const anchor = x < centerX - 8 ? "end" : x > centerX + 8 ? "start" : "middle";
      return <text key={dimension.code} fill="var(--foreground)" fontSize="12" fontWeight="700" textAnchor={anchor} x={x} y={y + 4}>{t(`ratings.dimensions.${dimension.code}`)}</text>;
    })}
  </svg>;
}

function DimensionBar({ code, value, count }: { code: string; value: number; count: number }) {
  const { t } = useI18n();
  return <div><div className="flex items-center justify-between gap-3 text-sm"><strong>{t(`ratings.dimensions.${code}`)}</strong><span className="font-bold text-[var(--muted)]">{count ? value.toFixed(2) : "—"} / 5</span></div><div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--panel-subtle)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, value * 20))}%` }} /></div></div>;
}

function StarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useI18n();
  return <div className="flex gap-1" role="radiogroup" aria-label={t("ratings.scoreAria")}>{[1, 2, 3, 4, 5].map((score) => <button key={score} className={`focus-ring rounded px-1 text-3xl leading-none ${score <= value ? "text-amber-500" : "text-[var(--line)]"}`} type="button" role="radio" aria-checked={score === value} aria-label={t("ratings.starScore", { score })} onClick={() => onChange(score)}>★</button>)}</div>;
}

function ReadonlyStars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return <span aria-hidden="true" className="tracking-wider text-amber-500">{[1, 2, 3, 4, 5].map((score) => <span className={score <= rounded ? "" : "text-[var(--line)]"} key={score}>★</span>)}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-2"><dt className="text-[var(--muted)]">{label}</dt><dd className="mt-1 font-black">{value}</dd></div>;
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [onClose]);
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/65 p-3 sm:p-6" role="presentation" onMouseDown={onClose}><div className={`mx-auto my-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl ${wide ? "max-w-5xl" : "max-w-3xl"}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header className="flex items-center justify-between gap-4 border-b border-[var(--line)] p-4 sm:p-6"><h2 className="text-xl font-black sm:text-2xl">{title}</h2><button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button></header><div className="p-4 sm:p-6">{children}</div></div></div>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value < 100 ? 2 : 0, notation: value >= 10000 ? "compact" : "standard" }).format(value);
}
