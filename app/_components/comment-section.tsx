"use client";

import Link from "next/link";
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSnapshot } from "../_lib/auth";
import {
  CommentItem,
  CommentTarget,
  CommentTargetType,
  createComment,
  deleteComment,
  loadCommentReplies,
  loadComments,
  loadCommentThread,
  reportComment,
  setCommentPinned,
  setCommentReaction,
  setCommentWatch,
  updateComment,
} from "../_lib/comment-api";
import { useI18n } from "../_lib/i18n-provider";
import { defaultMarkdownConfig } from "../_lib/markdown-config";
import { MarkdownRenderer } from "./markdown-renderer";
import { UserCardAvatar } from "./user-avatar";

const reactionOptions = [
  ["thumbs_up", "👍"], ["thumbs_down", "👎"], ["laugh", "😄"], ["hooray", "🎉"],
  ["confused", "😕"], ["heart", "❤️"], ["rocket", "🚀"], ["eyes", "👀"],
] as const;

type CommentSectionProps = {
  targetType: CommentTargetType;
  targetKey: string;
  className?: string;
  acceptedCommentId?: string;
  canAcceptAnswer?: boolean;
  onAcceptAnswer?: (commentId: string) => Promise<void>;
};

export function CommentSection({ targetType, targetKey, className = "", acceptedCommentId = "", canAcceptAnswer = false, onAcceptAnswer }: CommentSectionProps) {
  const { t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [items, setItems] = useState<CommentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState("");
  const [sort, setSort] = useState("latest");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);

  const load = useCallback(async (cursor = "", append = false) => {
    setLoading(true);
    try {
      const result = await loadComments(targetType, targetKey, { sort, cursor }, token || undefined);
      setItems((current) => append ? mergeComments(current, result.items) : result.items);
      setTotal(result.total);
      setNextCursor(result.nextCursor || "");
      setCanCreate(Boolean(result.capabilities?.canCreate));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.comments.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [sort, t, targetKey, targetType, token]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, ready]);

  async function publish(event: FormEvent, content: string, parentId?: string) {
    event.preventDefault();
    if (!token) {
      setMessage(t("mods.comments.loginRequired"));
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const result = await createComment(targetType, targetKey, content, parentId, token);
      if ("watchOnly" in result) {
        setMessage(t("mods.comments.cyWatched"));
      } else {
        setItems((current) => appendPublishedComment(current, result));
        setTotal((current) => current + 1);
      }
      setBody("");
      setReplyBody("");
      setReplyTo(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("mods.comments.publishFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={`mt-10 border-t border-[var(--line)] pt-8 ${className}`} aria-labelledby={`comments-${targetType}-${targetKey}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black" id={`comments-${targetType}-${targetKey}`}>{t("mods.comments.title")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("mods.comments.count", { count: total })}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
          <span>{t("mods.comments.sort")}</span>
          <select className="field min-w-32 py-2" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="latest">{t("mods.comments.sortLatest")}</option>
            <option value="oldest">{t("mods.comments.sortOldest")}</option>
            <option value="hot">{t("mods.comments.sortHot")}</option>
            <option value="replies">{t("mods.comments.sortReplies")}</option>
          </select>
        </label>
      </div>

      {user && canCreate ? (
        <form className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4" onSubmit={(event) => void publish(event, body)}>
          <textarea className="field min-h-28 resize-y" maxLength={10000} required value={body} placeholder={t("mods.comments.placeholder")} onChange={(event) => setBody(event.target.value)} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--muted)]">{t("mods.comments.markdownHint")}</span>
            <button className="button-primary focus-ring" disabled={submitting} type="submit">{t("mods.comments.publish")}</button>
          </div>
        </form>
      ) : !user ? (
        <Link className="button-primary focus-ring mt-5 inline-flex" href={`/login?next=${encodeURIComponent(currentPath())}`}>{t("mods.comments.loginToComment")}</Link>
      ) : <p className="mt-5 text-sm font-bold text-[var(--muted)]">{t("mods.comments.noCreatePermission")}</p>}

      {message ? <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-sm font-bold">{message}</p> : null}
      <CommentTree
        items={items}
        loading={loading}
        token={token}
        sort={sort}
        replyTo={replyTo}
        replyBody={replyBody}
        submitting={submitting}
        onItemsChange={setItems}
        onMessage={setMessage}
        onReply={(comment) => { setReplyTo(comment); setReplyBody(""); }}
        onReplyBodyChange={setReplyBody}
        onReplyCancel={() => setReplyTo(null)}
        onReplySubmit={(event, comment) => void publish(event, replyBody, comment.id)}
        acceptedCommentId={acceptedCommentId}
        canAcceptAnswer={canAcceptAnswer}
        onAcceptAnswer={onAcceptAnswer}
      />
      {!loading && items.length === 0 ? <EmptyComments /> : null}
      {nextCursor ? <button className="button-secondary focus-ring mt-5 w-full" disabled={loading} type="button" onClick={() => void load(nextCursor, true)}>{t("mods.comments.loadMore")}</button> : null}
    </section>
  );
}

type CommentTreeProps = {
  items: CommentItem[];
  loading: boolean;
  token: string;
  sort: string;
  replyTo: CommentItem | null;
  replyBody: string;
  submitting: boolean;
  onItemsChange: (items: CommentItem[]) => void;
  onMessage: (message: string) => void;
  onReply: (comment: CommentItem) => void;
  onReplyBodyChange: (body: string) => void;
  onReplyCancel: () => void;
  onReplySubmit: (event: FormEvent, comment: CommentItem) => void;
  acceptedCommentId: string;
  canAcceptAnswer: boolean;
  onAcceptAnswer?: (commentId: string) => Promise<void>;
};

function CommentTree(props: CommentTreeProps) {
  const { t } = useI18n();
  const { user } = useAuthSnapshot();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [highlighted, setHighlighted] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const [replyCursors, setReplyCursors] = useState<Record<string, string>>({});
  const tree = useMemo(() => buildTree(props.items, props.sort), [props.items, props.sort]);
  const visible = useMemo(() => flattenTree(tree, collapsed), [collapsed, tree]);

  useEffect(() => {
    const id = window.location.hash.startsWith("#comment-") ? window.location.hash.slice("#comment-".length) : "";
    if (!id || !props.items.some((item) => item.id === id)) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(id);
      window.setTimeout(() => setHighlighted((current) => current === id ? "" : current), 2000);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [props.items]);

  function jumpTo(id: string, remember = true) {
    if (remember) {
      const visibleElement = document.querySelector<HTMLElement>("[data-comment-visible='true']");
      setReturnTo(visibleElement?.id.replace("comment-", "") || "");
    }
    document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(id);
    window.setTimeout(() => setHighlighted((current) => current === id ? "" : current), 2000);
  }

  async function react(comment: CommentItem, reaction: string) {
    if (!props.token) {
      props.onMessage(t("mods.comments.loginRequired"));
      return;
    }
    const active = !comment.userReactions.includes(reaction);
    try {
      await setCommentReaction(comment.id, reaction, active, props.token);
      props.onItemsChange(props.items.map((item) => item.id === comment.id ? {
        ...item,
        reactions: { ...item.reactions, [reaction]: Math.max(0, (item.reactions[reaction] || 0) + (active ? 1 : -1)) },
        userReactions: active ? [...item.userReactions, reaction] : item.userReactions.filter((value) => value !== reaction),
      } : item));
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : t("mods.comments.reactionFailed"));
    }
  }

  async function watch(comment: CommentItem) {
    if (!props.token) {
      props.onMessage(t("mods.comments.loginRequired"));
      return;
    }
    const active = !comment.currentUserWatch?.active;
    try {
      const state = await setCommentWatch(comment.id, active, props.token);
      props.onItemsChange(props.items.map((item) => item.id === comment.id
        ? { ...item, currentUserWatch: active ? state : { active: false, mutedForever: false, unreadCount: 0, watchedReplies: 0 } }
        : item));
      props.onMessage(t(active ? "mods.comments.watched" : "mods.comments.unwatched"));
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : t("mods.comments.watchFailed"));
    }
  }

  async function edit(comment: CommentItem) {
    if (!props.token) return;
    const nextBody = window.prompt(t("mods.comments.editPrompt"), comment.body);
    if (!nextBody?.trim() || nextBody.trim() === comment.body) return;
    try {
      const result = await updateComment(comment.id, nextBody.trim(), props.token);
      props.onItemsChange(props.items.map((item) => item.id === result.id ? result : item));
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : t("mods.comments.editFailed"));
    }
  }

  async function remove(comment: CommentItem) {
    if (!props.token || !window.confirm(t("mods.comments.deleteConfirm"))) return;
    try {
      await deleteComment(comment.id, props.token);
      props.onItemsChange(props.items.map((item) => item.id === comment.id ? { ...item, body: "", deleted: true } : item));
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : t("mods.comments.deleteFailed"));
    }
  }

  async function report(comment: CommentItem) {
    if (!props.token) {
      props.onMessage(t("mods.comments.loginRequired"));
      return;
    }
    const detail = window.prompt(t("mods.comments.reportPrompt"));
    if (detail === null) return;
    try {
      await reportComment(comment.id, "user_report", detail.trim(), props.token);
      props.onMessage(t("mods.comments.reported"));
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : t("mods.comments.reportFailed"));
    }
  }

  async function pin(comment: CommentItem) {
    if (!props.token) return;
    try {
      const result = await setCommentPinned(comment.id, !comment.pinned, props.token);
      props.onItemsChange(props.items.map((item) => item.id === result.id ? result : item));
      props.onMessage(t(result.pinned ? "mods.comments.pinned" : "mods.comments.unpinned"));
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : t("mods.comments.pinFailed"));
    }
  }

  async function loadChildren(comment: CommentItem) {
    try {
      const result = await loadCommentReplies(comment.id, replyCursors[comment.id], props.token || undefined);
      setReplyCursors((current) => ({ ...current, [comment.id]: result.nextCursor || "" }));
      props.onItemsChange(mergeComments(props.items, result.items).map((item) => item.id === comment.id ? { ...item, hasMoreReplies: Boolean(result.nextCursor) } : item));
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : t("mods.comments.loadFailed"));
    }
  }

  async function copyBranch(comment: CommentItem) {
    const url = `${window.location.origin}/comments/${comment.id}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    props.onMessage(t("mods.comments.branchCopied"));
  }

  if (props.loading && props.items.length === 0) {
    return <p className="mt-6 rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p>;
  }
  return (
    <div className="mt-6 grid gap-3" role="tree" aria-label={t("mods.comments.title")}>
      {returnTo ? <button className="button-secondary focus-ring sticky top-20 z-20 justify-self-start text-xs" type="button" onClick={() => { jumpTo(returnTo, false); setReturnTo(""); }}>{t("mods.comments.returnPosition")}</button> : null}
      {visible.map(({ item, visualDepth, hasChildren }) => (
        <div
          className="relative transition"
          data-comment-visible="true"
          id={`comment-${item.id}`}
          key={item.id}
          role="treeitem"
          aria-level={item.depth + 1}
          aria-selected={highlighted === item.id}
          aria-expanded={hasChildren ? !collapsed.has(item.id) : undefined}
          style={{
            "--comment-depth": Math.min(3, visualDepth),
            "--comment-mobile-depth": Math.min(2, visualDepth),
          } as CSSProperties}
        >
          <div className="ml-[calc(var(--comment-depth)*1.5rem)] max-sm:ml-[calc(var(--comment-mobile-depth)*0.75rem)]">
            {visualDepth > 0 ? (
              <button
                aria-label={collapsed.has(item.id) ? t("mods.comments.expandBranch") : t("mods.comments.collapseBranch")}
                className="focus-ring absolute bottom-0 left-[calc(var(--comment-depth)*1.5rem-0.75rem)] top-0 w-3 border-l-2 border-[var(--line)] hover:border-[var(--accent)] max-sm:left-[calc(var(--comment-mobile-depth)*0.75rem-0.4rem)]"
                type="button"
                onClick={() => setCollapsed((current) => toggleSet(current, item.id))}
              />
            ) : null}
            <CommentCard
              comment={item}
              acceptedAnswer={props.acceptedCommentId === item.id}
              canAcceptAnswer={props.canAcceptAnswer && !item.deleted && item.author.id !== user?.id}
              highlighted={highlighted === item.id}
              onEdit={() => void edit(item)}
              onDelete={() => void remove(item)}
              onJumpParent={(id) => jumpTo(id)}
              onReact={(reaction) => void react(item, reaction)}
              onReply={() => props.onReply(item)}
              onReport={() => void report(item)}
              onPin={() => void pin(item)}
              onShare={() => void copyBranch(item)}
              onToggleCollapse={hasChildren ? () => setCollapsed((current) => toggleSet(current, item.id)) : undefined}
              onWatch={() => void watch(item)}
              onAcceptAnswer={props.onAcceptAnswer ? () => void props.onAcceptAnswer?.(item.id) : undefined}
            />
            {item.hasMoreReplies ? <button className="mt-2 text-sm font-bold text-[var(--accent)] hover:underline" type="button" onClick={() => void loadChildren(item)}>{t("mods.comments.loadReplies", { count: item.childCount })}</button> : null}
            {props.replyTo?.id === item.id ? (
              <form className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4" onSubmit={(event) => props.onReplySubmit(event, item)}>
<p className="mb-2 text-sm font-bold text-[var(--muted)]">{t("mods.comments.replyingTo", { name: item.author.username })}</p>
                <textarea className="field min-h-24 resize-y" maxLength={10000} required value={props.replyBody} onChange={(event) => props.onReplyBodyChange(event.target.value)} />
                <p className="mt-2 text-xs text-[var(--muted)]">{t("mods.comments.cyHint")}</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button className="button-secondary focus-ring" type="button" onClick={props.onReplyCancel}>{t("common.cancel")}</button>
                  <button className="button-primary focus-ring" disabled={props.submitting} type="submit">{t("mods.comments.reply")}</button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentCard({
  comment,
  acceptedAnswer,
  canAcceptAnswer,
  highlighted,
  onDelete,
  onEdit,
  onJumpParent,
  onReact,
  onReply,
  onReport,
  onPin,
  onShare,
  onToggleCollapse,
  onWatch,
  onAcceptAnswer,
}: {
  comment: CommentItem;
  acceptedAnswer: boolean;
  canAcceptAnswer: boolean;
  highlighted: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onJumpParent: (id: string) => void;
  onReact: (reaction: string) => void;
  onReply: () => void;
  onReport: () => void;
  onPin: () => void;
  onShare: () => void;
  onToggleCollapse?: () => void;
  onWatch: () => void;
  onAcceptAnswer?: () => void;
}) {
  const { locale, t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const authorName = comment.author.username;
  return (
    <article className={`rounded-lg border bg-[var(--panel)] p-4 transition ${acceptedAnswer ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : highlighted ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[var(--line)]"}`}>
      <div className="flex gap-3">
        <UserCardAvatar avatarUrl={comment.author.avatarUrl} onlineStatus={comment.author.onlineStatus} size={36} userId={comment.author.id} username={authorName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link className="font-black hover:text-[var(--accent)]" href={`/user/${comment.author.id}`}>{authorName}</Link>
            {comment.author.projectRole ? <span className="rounded-md border border-[var(--accent)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">{t(`mods.comments.projectRoles.${comment.author.projectRole}`)}</span> : null}
            {comment.pinned ? <span className="rounded-md border border-[var(--line)] px-2 py-0.5 text-xs font-bold text-[var(--muted)]">{t("mods.comments.pinnedBadge")}</span> : null}
            {acceptedAnswer ? <span className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent)]">{t("communityPosts.bounty.acceptedAnswer")}</span> : null}
            <time className="text-xs text-[var(--muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(comment.createdAt))}</time>
          </div>
          {comment.parent ? <button className="mt-2 block max-w-full truncate rounded border-l-2 border-[var(--accent)] bg-[var(--panel-subtle)] px-3 py-2 text-left text-xs text-[var(--muted)] hover:text-[var(--accent)]" type="button" onClick={() => onJumpParent(comment.parent!.id)}>@{comment.parent.authorName} · {comment.parent.deleted ? t("mods.comments.deleted") : comment.parent.bodySummary}</button> : null}
          {comment.deleted ? <p className="mt-3 text-sm italic text-[var(--muted)]">{t("mods.comments.deleted")}</p> : <div className="markdown-preview mt-3 text-sm leading-7"><MarkdownRenderer config={defaultMarkdownConfig} emptyText="" markdown={comment.body} /></div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {reactionOptions.map(([reaction, emoji]) => {
              const count = comment.reactions[reaction] || 0;
              return count ? <button key={reaction} className={`focus-ring rounded-full border px-2.5 py-1 text-xs ${comment.userReactions.includes(reaction) ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"}`} disabled={!comment.canReact} type="button" onClick={() => onReact(reaction)}>{emoji} {count}</button> : null;
            })}
            {comment.canReact ? <div className="relative"><button className="focus-ring grid h-8 w-8 place-items-center rounded-full border border-[var(--line)]" title={t("mods.comments.addReaction")} type="button" onClick={() => setPickerOpen((current) => !current)}>☺</button>{pickerOpen ? <div className="absolute bottom-full left-0 z-30 mb-2 flex gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-xl">{reactionOptions.map(([reaction, emoji]) => <button className="focus-ring grid h-9 w-9 place-items-center rounded-md text-lg hover:bg-[var(--panel-subtle)]" key={reaction} type="button" onClick={() => { setPickerOpen(false); onReact(reaction); }}>{emoji}</button>)}</div> : null}</div> : null}
            {comment.canReply ? <button className="text-xs font-bold text-[var(--accent)] hover:underline" type="button" onClick={onReply}>{t("mods.comments.reply")}</button> : null}
            {comment.canWatch ? <button className={`text-xs font-bold hover:underline ${comment.currentUserWatch?.active ? "text-[var(--accent)]" : "text-[var(--muted)]"}`} type="button" onClick={onWatch}>{t(comment.currentUserWatch?.active ? "mods.comments.watchedButton" : "mods.comments.watchButton")}</button> : null}
            {onToggleCollapse ? <button className="text-xs font-bold text-[var(--muted)] hover:underline" type="button" onClick={onToggleCollapse}>{t("mods.comments.collapseBranch")}</button> : null}
            <button className="text-xs font-bold text-[var(--muted)] hover:underline" type="button" onClick={onShare}>{t("mods.comments.shareBranch")}</button>
            {comment.canPin ? <button className="text-xs font-bold text-[var(--accent)] hover:underline" type="button" onClick={onPin}>{t(comment.pinned ? "mods.comments.unpin" : "mods.comments.pin")}</button> : null}
            {comment.canEdit ? <button className="text-xs font-bold text-[var(--muted)] hover:underline" type="button" onClick={onEdit}>{t("common.edit")}</button> : null}
            {comment.canDelete ? <button className="text-xs font-bold text-[var(--red)] hover:underline" type="button" onClick={onDelete}>{t("common.delete")}</button> : null}
            {comment.canReport ? <button className="text-xs font-bold text-[var(--red)] hover:underline" type="button" onClick={onReport}>{t("mods.comments.report")}</button> : null}
            {canAcceptAnswer && onAcceptAnswer ? <button className="text-xs font-black text-[var(--accent)] hover:underline" type="button" onClick={onAcceptAnswer}>{t("communityPosts.bounty.acceptAnswer")}</button> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function CommentThread({ commentId }: { commentId: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [items, setItems] = useState<CommentItem[]>([]);
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    loadCommentThread(commentId, token || undefined).then((result) => {
      if (!cancelled) {
        setItems(result.items);
        setTarget(result.target);
      }
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : t("mods.comments.loadFailed")); });
    return () => { cancelled = true; };
  }, [commentId, ready, t, token]);
  return <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]"><section className="mx-auto max-w-5xl">
    {target ? <><Link className="font-bold text-[var(--accent)] hover:underline" href={target.url}>← {target.title}</Link><h1 className="mt-4 text-3xl font-black">{t("mods.comments.branchTitle")}</h1></> : null}
    {error ? <p className="surface mt-5 p-5">{error}</p> : null}
    {items.length ? <CommentTree items={items} loading={false} token={token} sort="oldest" replyTo={null} replyBody="" submitting={false} acceptedCommentId="" canAcceptAnswer={false} onItemsChange={setItems} onMessage={setError} onReply={() => setError(t("mods.comments.replyOnOriginal"))} onReplyBodyChange={() => undefined} onReplyCancel={() => undefined} onReplySubmit={() => undefined} /> : !error ? <p className="mt-5 text-[var(--muted)]">{t("common.loading")}</p> : null}
  </section></main>;
}

type TreeNode = { item: CommentItem; children: TreeNode[] };

function buildTree(items: CommentItem[], sort: string): TreeNode[] {
  const nodes = new Map(items.map((item) => [item.id, { item, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.item.parentId ? nodes.get(node.item.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const chronological = (left: TreeNode, right: TreeNode) => new Date(left.item.createdAt).getTime() - new Date(right.item.createdAt).getTime();
  for (const node of nodes.values()) node.children.sort(chronological);
  const selectedOrder = sort === "oldest"
    ? chronological
    : sort === "hot"
      ? (left: TreeNode, right: TreeNode) => right.item.heatScore - left.item.heatScore
      : sort === "replies"
        ? (left: TreeNode, right: TreeNode) => right.item.descendantCount - left.item.descendantCount
        : (left: TreeNode, right: TreeNode) => chronological(right, left);
  roots.sort((left, right) => {
    if (left.item.pinned !== right.item.pinned) return left.item.pinned ? -1 : 1;
    if (left.item.pinned && right.item.pinned) {
      const difference = new Date(right.item.pinnedAt || 0).getTime() - new Date(left.item.pinnedAt || 0).getTime();
      if (difference) return difference;
    }
    return selectedOrder(left, right);
  });
  return roots;
}

function flattenTree(nodes: TreeNode[], collapsed: Set<string>, depth = 0): Array<{ item: CommentItem; visualDepth: number; hasChildren: boolean }> {
  const result: Array<{ item: CommentItem; visualDepth: number; hasChildren: boolean }> = [];
  for (const node of nodes) {
    result.push({ item: node.item, visualDepth: depth, hasChildren: node.children.length > 0 || node.item.childCount > 0 });
    if (!collapsed.has(node.item.id)) result.push(...flattenTree(node.children, collapsed, depth + 1));
  }
  return result;
}

function mergeComments(current: CommentItem[], incoming: CommentItem[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

function appendPublishedComment(current: CommentItem[], incoming: CommentItem) {
  const byID = new Map(current.map((item) => [item.id, item]));
  const ancestors = new Set<string>();
  let ancestorID = incoming.parentId;
  while (ancestorID && !ancestors.has(ancestorID)) {
    ancestors.add(ancestorID);
    ancestorID = byID.get(ancestorID)?.parentId;
  }
  const updated = current.map((item) => {
    if (!ancestors.has(item.id)) return item;
    return {
      ...item,
      childCount: item.childCount + (item.id === incoming.parentId ? 1 : 0),
      descendantCount: item.descendantCount + 1,
    };
  });
  return mergeComments(updated, [incoming]);
}

function toggleSet(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function currentPath() {
  return typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
}

function EmptyComments() {
  const { t } = useI18n();
  return <div className="mt-6 grid min-h-40 place-items-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] p-6 text-center font-bold text-[var(--muted)]">{t("mods.comments.empty")}</div>;
}
