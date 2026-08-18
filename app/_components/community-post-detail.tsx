"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import { acceptCommunityPostAnswer, communityPostCollection, communityPostCoverURL, loadCommunityPost, loadCommunityPostTranslation, requestCommunityPostTranslation, selfSolveCommunityPost, type CommunityPost } from "../_lib/community-post-api";
import { loadContentLanguageSettings } from "../_lib/content-language-api";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { largeProjectPath } from "../_lib/simple-project-api";
import { useI18n } from "../_lib/i18n-provider";
import { CommentSection } from "./comment-section";
import { MarkdownRenderer } from "./markdown-renderer";
import { RotatingResourceIcon } from "./community-post-catalog";
import { ReviewAwareEditAction } from "./review-edit-lock";
import { UnifiedReportButton, type ReportTargetType } from "./unified-report-dialog";
import { ProjectFollowButton } from "./project-follow-button";

export function CommunityPostDetail({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const { token, user } = useAuthSnapshot();
  const [post, setPost] = useState<CommunityPost>();
  const [translation, setTranslation] = useState<{ title: string; bodyMarkdown: string }>();
  const [message, setMessage] = useState("");
  const [translating, setTranslating] = useState(false);
  const [targetLocale, setTargetLocale] = useState<string>(locale);
  useEffect(() => { loadCommunityPost(id, token).then(setPost).catch((error) => setMessage(error instanceof Error ? error.message : String(error))); }, [id, token]);
  useEffect(() => {
    if (!token) return;
    loadContentLanguageSettings(token).then((settings) => setTargetLocale(settings.primaryLocale || locale)).catch(() => setTargetLocale(locale));
  }, [locale, token]);

  async function translate() {
    if (!token || !post) return;
    setTranslating(true);
    setMessage("");
    try {
      const requested = await requestCommunityPostTranslation(post.id, targetLocale, token);
      if (requested.translation) { setTranslation(requested.translation); return; }
      if (!requested.taskId) throw new Error(t("communityPosts.translationFailed"));
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const result = await loadCommunityPostTranslation(requested.taskId, token);
        if (result.status === "completed" && result.translation) { setTranslation(result.translation); return; }
        if (result.status === "failed") throw new Error(result.error || t("communityPosts.translationFailed"));
      }
      throw new Error(t("communityPosts.translationTimeout"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTranslating(false);
    }
  }

  async function acceptAnswer(commentId: string) {
    if (!token || !post || !window.confirm(t("communityPosts.bounty.acceptConfirm"))) return;
    setMessage("");
    try {
      const result = await acceptCommunityPostAnswer(post.id, commentId, token);
      setPost({ ...post, resolutionStatus: result.resolutionStatus, acceptedCommentId: result.acceptedCommentId, canResolve: false,
        bounty: post.bounty ? { ...post.bounty, status: "awarded", taxAmount: result.taxAmount, netAmount: result.netAmount } : undefined });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function markSelfSolved() {
    if (!token || !post || !window.confirm(t("communityPosts.bounty.selfSolvedConfirm"))) return;
    setMessage("");
    try {
      await selfSolveCommunityPost(post.id, token);
      setPost({ ...post, resolutionStatus: "self_solved", canResolve: false,
        bounty: post.bounty ? { ...post.bounty, status: "refunded" } : undefined });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  if (!post) return <main className="grid min-h-[65vh] place-items-center p-6 font-bold text-[var(--muted)]">{message || t("common.loading")}</main>;
  const title = translation?.title || post.title;
  const body = translation?.bodyMarkdown || post.bodyMarkdown;
  const collection = communityPostCollection(post.kind);
  return <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]"><article className="mx-auto max-w-6xl">
    <header className="border-b border-[var(--line)] pb-6"><div className="flex flex-wrap items-center justify-between gap-3"><Link className="font-bold text-[var(--accent)] hover:underline" href={`/${collection}`}>← {t(`communityPosts.${post.kind}.title`)}</Link><div className="flex flex-wrap gap-2">{user && post.sourceLocale.toLowerCase() !== targetLocale.toLowerCase() ? <button className="button-secondary focus-ring" disabled={translating} type="button" onClick={() => void translate()}>{translating ? t("communityPosts.translating") : t("communityPosts.translate")}</button> : null}{post.canResolve ? <button className="button-secondary focus-ring" type="button" onClick={() => void markSelfSolved()}>{t("communityPosts.bounty.selfSolved")}</button> : null}<Link className="button-secondary focus-ring" href={`/${collection}/${post.id}/history`}>{t("contentHistory.title")}</Link><UnifiedReportButton targetAuthor={post.authorName} targetId={post.id} targetSummary={title} targetType={reportTypeForCommunityPost(post.kind)} /><ReviewAwareEditAction canEdit={post.canEdit} editHref={`/${collection}/${post.id}/edit`} entityType="community_post" publicId={post.id} /></div></div><h1 className="mt-4 text-3xl font-black sm:text-4xl">{title}</h1><div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--muted)]"><span>{post.authorName}</span>{post.kind !== "news" ? <><span>·</span><span>{post.minecraftVersions.join(", ") || t("communityPosts.allVersions")}</span></> : null}{post.reviewStatus !== "approved" ? <span className="font-bold text-[var(--warning)]">{t("communityPosts.pending")}</span> : null}</div></header>
    {post.coverUrl ? <div className="relative mt-6 aspect-[121/75] max-h-[620px] overflow-hidden rounded-xl bg-[var(--panel-subtle)]"><Image unoptimized fill priority alt="" className="object-cover" src={communityPostCoverURL(post.coverUrl)} /></div> : post.kind === "issue" ? <div className="mt-6 aspect-[121/75] max-h-72 rounded-xl border border-[var(--line)] bg-[var(--panel-subtle)]"><RotatingResourceIcon resources={post.resources} /></div> : null}
    {post.kind === "issue" ? <section className="mt-6 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 sm:grid-cols-2 lg:grid-cols-4"><Meta label={t("communityPosts.fields.severity")} value={t(`communityPosts.severity.${post.severity}`)} /><Meta label={t("communityPosts.fields.modVersionRange")} value={[post.modVersionMin, post.modVersionMax].filter(Boolean).join(" – ") || t("communityPosts.unspecified")} /><Meta label={t("communityPosts.fields.hasFix")} value={t(post.hasFix ? "common.yes" : "common.no")} />{post.issueUrl ? <a className="button-secondary focus-ring self-end text-center" href={post.issueUrl} rel="noopener noreferrer" target="_blank">Issue ↗</a> : null}</section> : null}
    {post.kind === "discussion" ? <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"><div><strong className="text-lg font-black">{t(`communityPosts.bounty.status.${post.resolutionStatus || "open"}`)}</strong>{post.bounty ? <p className="mt-1 text-sm text-[var(--muted)]">{t("communityPosts.bounty.offered", { amount: post.bounty.amount, currency: localizedBountyCurrency(post, locale) })}{post.bounty.status === "awarded" ? ` · ${t("communityPosts.bounty.settled", { tax: post.bounty.taxAmount || 0, net: post.bounty.netAmount || 0 })}` : post.bounty.status === "refunded" ? ` · ${t("communityPosts.bounty.refunded")}` : ""}</p> : <p className="mt-1 text-sm text-[var(--muted)]">{t("communityPosts.bounty.noBounty")}</p>}</div></section> : null}
    <section className="mt-6 flex flex-wrap gap-2">{post.projects.map((project) => project.publicId && project.siteId ? <Link className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]" href={largeProjectPath(project.type || "mod", project.siteId)} key={`${project.type}:${project.publicId}`}>{project.name || project.identifier}</Link> : <span className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 font-bold" key={`${project.type}:${project.identifier}`}>? {project.identifier}</span>)}</section>
    <section className="markdown-preview mt-8 min-w-0"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={body} /></section>
    {message ? <p className="mt-5 rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{message}</p> : null}
    <div className="mt-6"><ProjectFollowButton publicId={post.id} /></div>
    <CommentSection acceptedCommentId={post.acceptedCommentId} canAcceptAnswer={post.canResolve} targetKey={post.id} targetType="community_post" onAcceptAnswer={acceptAnswer} />
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
