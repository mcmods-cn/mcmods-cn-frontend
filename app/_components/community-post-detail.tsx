"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { acceptCommunityPostAnswer, communityPostCollection, communityPostCoverURL, loadCommunityPost, loadCommunityPostTranslation, requestCommunityPostTranslation, selfSolveCommunityPost, type CommunityPost } from "../_lib/community-post-api";
import { loadContentLanguageSettings } from "../_lib/content-language-api";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { largeProjectPath } from "../_lib/simple-project-api";
import { useI18n } from "../_lib/i18n-provider";
import { waitForPolledJob } from "../_lib/job-polling.mts";
import { CommentSection } from "./comment-section";
import { MarkdownRenderer } from "./markdown-renderer";
import { RotatingResourceIcon } from "./community-post-catalog";
import { ReviewAwareEditAction } from "./review-edit-lock";
import { UnifiedReportButton, type ReportTargetType } from "./unified-report-dialog";
import { ProjectFollowButton } from "./project-follow-button";
import { ProjectEditorApplicationButton } from "./project-editor-application";

export function CommunityPostDetail({ id }: { id: string }) {
  const { token, user } = useAuthSnapshot();
  return <CommunityPostDetailContent key={`${user?.id || "guest"}:${id}:${token}`} id={id} />;
}

function CommunityPostDetailContent({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const [post, setPost] = useState<CommunityPost>();
  const [attempt, setAttempt] = useState(0);
  const [resolving, setResolving] = useState(false);
  const resolutionInFlight = useRef(false);
  const [translation, setTranslation] = useState<{ locale: string; title: string; bodyMarkdown: string }>();
  const [message, setMessage] = useState("");
  const [translating, setTranslating] = useState(false);
  const [targetLocale, setTargetLocale] = useState<string>(locale);
  const translationController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadCommunityPost(id, token, controller.signal)
      .then((value) => { if (!controller.signal.aborted) { setPost(value); setMessage(""); } })
      .catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => controller.abort();
  }, [attempt, id, token]);
  useEffect(() => () => translationController.current?.abort(), [targetLocale, token]);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loadContentLanguageSettings(token).then((settings) => { if (!cancelled) setTargetLocale(settings.primaryLocale || locale); }).catch(() => { if (!cancelled) setTargetLocale(locale); });
    return () => { cancelled = true; };
  }, [locale, token]);

  async function translate() {
    if (!token || !post || translating || translationController.current && !translationController.current.signal.aborted) return;
    translationController.current?.abort();
    const controller = new AbortController();
    translationController.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
    setTranslating(true);
    setMessage("");
    try {
      const requested = await requestCommunityPostTranslation(post.id, targetLocale, token, controller.signal);
      if (controller.signal.aborted) return;
      if (requested.translation) { setTranslation({ ...requested.translation, locale: targetLocale }); return; }
      if (!requested.taskId) throw new Error(t("communityPosts.translationFailed"));
      const taskId = requested.taskId;
      const result = await waitForPolledJob(
        (signal) => loadCommunityPostTranslation(taskId, token, signal),
        new Set(["completed", "failed", "cancelled", "expired"]), () => undefined,
        controller.signal, undefined, 1000,
      );
      if (result.status !== "completed" || !result.translation) throw new Error(result.error || t("communityPosts.translationFailed"));
      setTranslation({ ...result.translation, locale: targetLocale });
    } catch (error) {
      if (timedOut) setMessage(t("communityPosts.translationTimeout"));
      else if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      window.clearTimeout(timeout);
      if (translationController.current === controller) { translationController.current = null; setTranslating(false); }
    }
  }

  async function acceptAnswer(commentId: string) {
    if (!token || !post || resolutionInFlight.current || !window.confirm(t("communityPosts.bounty.acceptConfirm"))) return;
    resolutionInFlight.current = true;
    setResolving(true);
    setMessage("");
    try {
      const result = await acceptCommunityPostAnswer(post.id, commentId, token);
      setPost({ ...post, resolutionStatus: result.resolutionStatus, acceptedCommentId: result.acceptedCommentId, canResolve: false,
        bounty: post.bounty ? { ...post.bounty, status: "awarded", taxAmount: result.taxAmount, netAmount: result.netAmount } : undefined });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      resolutionInFlight.current = false;
      setResolving(false);
    }
  }

  async function markSelfSolved() {
    if (!token || !post || resolutionInFlight.current || !window.confirm(t("communityPosts.bounty.selfSolvedConfirm"))) return;
    resolutionInFlight.current = true;
    setResolving(true);
    setMessage("");
    try {
      await selfSolveCommunityPost(post.id, token);
      setPost({ ...post, resolutionStatus: "self_solved", canResolve: false,
        bounty: post.bounty ? { ...post.bounty, status: "refunded" } : undefined });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      resolutionInFlight.current = false;
      setResolving(false);
    }
  }

  if (!post) return <main className="grid min-h-[65vh] place-items-center p-6 font-bold text-[var(--muted)]"><div>{message ? <><p role="alert">{message}</p><button className="button-secondary focus-ring mt-3" type="button" onClick={() => { setMessage(""); setAttempt(value => value + 1); }}>{t("common.retry")}</button></> : t("common.loading")}</div></main>;
  const title = translation?.locale === targetLocale ? translation.title : post.title;
  const body = translation?.locale === targetLocale ? translation.bodyMarkdown : post.bodyMarkdown;
  const collection = communityPostCollection(post.kind);
  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><article className="mx-auto max-w-6xl">
    <header className="border-b border-[var(--line)] pb-6"><div className="flex flex-wrap items-center justify-between gap-3"><Link className="font-bold text-[var(--accent)] hover:underline" href={`/${collection}`}>← {t(`communityPosts.${post.kind}.title`)}</Link><div className="flex flex-wrap gap-2">{user && post.sourceLocale.toLowerCase() !== targetLocale.toLowerCase() ? <button className="button-secondary focus-ring" disabled={translating} type="button" onClick={() => void translate()}>{translating ? t("communityPosts.translating") : t("communityPosts.translate")}</button> : null}{post.canResolve ? <button className="button-secondary focus-ring" disabled={resolving} type="button" onClick={() => void markSelfSolved()}>{t("communityPosts.bounty.selfSolved")}</button> : null}<Link className="button-secondary focus-ring" href={`/${collection}/${post.id}/history`}>{t("contentHistory.title")}</Link><UnifiedReportButton targetAuthor={post.authorName} targetId={post.id} targetSummary={title} targetType={reportTypeForCommunityPost(post.kind)} /><ProjectEditorApplicationButton canEdit={post.canEdit} projectId={post.id} projectName={title} projectType="community_post" returnPath={`/${collection}/${post.id}`} /><ReviewAwareEditAction canEdit={post.canEdit} editHref={`/${collection}/${post.id}/edit`} entityType="community_post" publicId={post.id} /></div></div><h1 className="mt-4 text-3xl font-black sm:text-4xl">{title}</h1><div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--muted)]"><span>{post.authorName}</span>{post.kind !== "news" ? <><span>·</span><span>{post.minecraftVersions.join(", ") || t("communityPosts.allVersions")}</span></> : null}{post.reviewStatus !== "approved" ? <span className="font-bold text-[var(--warning)]">{t("communityPosts.pending")}</span> : null}</div></header>
    {post.coverUrl ? <div className="relative mt-6 aspect-[121/75] max-h-[620px] overflow-hidden rounded-xl bg-[var(--panel-subtle)]"><Image unoptimized fill priority alt="" className="object-cover" src={communityPostCoverURL(post.coverUrl)} /></div> : post.kind === "issue" ? <div className="mt-6 aspect-[121/75] max-h-72 rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)]"><RotatingResourceIcon resources={post.resources} /></div> : null}
    {post.kind === "issue" ? <section className="mt-6 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 sm:grid-cols-2 lg:grid-cols-4"><Meta label={t("communityPosts.fields.severity")} value={t(`communityPosts.severity.${post.severity}`)} /><Meta label={t("communityPosts.fields.modVersionRange")} value={[post.modVersionMin, post.modVersionMax].filter(Boolean).join(" – ") || t("communityPosts.unspecified")} /><Meta label={t("communityPosts.fields.hasFix")} value={t(post.hasFix ? "common.yes" : "common.no")} />{post.issueUrl ? <a className="button-secondary focus-ring self-end text-center" href={post.issueUrl} rel="noopener noreferrer" target="_blank">Issue ↗</a> : null}</section> : null}
    {post.kind === "discussion" ? <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><div><strong className="text-lg font-black">{t(`communityPosts.bounty.status.${post.resolutionStatus || "open"}`)}</strong>{post.bounty ? <p className="mt-1 text-sm text-[var(--muted)]">{t("communityPosts.bounty.offered", { amount: post.bounty.amount, currency: localizedBountyCurrency(post, locale) })}{post.bounty.status === "awarded" ? ` · ${t("communityPosts.bounty.settled", { tax: post.bounty.taxAmount || 0, net: post.bounty.netAmount || 0 })}` : post.bounty.status === "refunded" ? ` · ${t("communityPosts.bounty.refunded")}` : ""}</p> : <p className="mt-1 text-sm text-[var(--muted)]">{t("communityPosts.bounty.noBounty")}</p>}</div></section> : null}
    <section className="mt-6 flex flex-wrap gap-2">{post.projects.map((project, index) => project.publicId && project.siteId ? <Link className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={largeProjectPath(project.type || "mod", project.siteId)} key={`${project.type}:${project.publicId}`}>{project.name || project.identifier}</Link> : <span className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 font-bold" key={`${project.type}:${project.identifier}:${index}`}>? {project.unavailable ? t("communityPosts.unspecified") : project.identifier}</span>)}</section>
    <section className="markdown-preview mt-8 min-w-0"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={body} /></section>
    {message ? <p className="mt-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{message}</p> : null}
    <div className="mt-6"><ProjectFollowButton publicId={post.id} /></div>
    <CommentSection acceptedCommentId={post.acceptedCommentId} canAcceptAnswer={post.canResolve && !resolving} targetKey={post.id} targetType="community_post" onAcceptAnswer={acceptAnswer} />
  </article></main>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><strong className="block text-sm text-[var(--muted)]">{label}</strong><span className="mt-1 block font-black">{value}</span></div>; }

function localizedBountyCurrency(post: CommunityPost, locale: string) {
  if (!post.bounty) return "";
  const translation = post.bounty.translations?.[locale];
  if (translation && typeof translation === "object" && "name" in translation && typeof translation.name === "string" && translation.name) return translation.name;
  return post.bounty.currencyName || post.bounty.currency;
}

function reportTypeForCommunityPost(kind: CommunityPost["kind"]): ReportTargetType {
  return kind === "issue" ? "bug" : kind;
}
