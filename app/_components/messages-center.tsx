"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "../_lib/api";
import type { AITokenBalance, OnlineStatus } from "../_lib/user-api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { LoginRequiredState, PageFeedback } from "./page-feedback";
import { normalizeInternalPath } from "../_lib/navigation";
import { OnlineStatusDot, UserAvatar } from "./user-avatar";

type NotificationKind = "system" | "reply_mention" | "comment_watch_reply" | "review" | "new_follower";

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  sourceLocale: string;
  read: boolean;
  data: Record<string, unknown>;
  actors: Array<{ id: string; username: string }>;
  createdAt: string;
  updatedAt: string;
	translationAllowed: boolean;
};

type Conversation = {
  id: string;
  partnerId: string;
  username: string;
  avatarUrl: string;
  onlineStatus: OnlineStatus;
  lastMessage: string;
  lastAt?: string;
  unreadCount: number;
  canMessage: boolean;
};

type DirectMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  readAt?: string;
  createdAt: string;
};

type Translation = { title: string; body: string };
type NotificationTarget = { href: string; label: string };

const notificationKinds: NotificationKind[] = ["system", "reply_mention", "comment_watch_reply", "review", "new_follower"];

export function MessagesCenter() {
  const { t, locale } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserID = searchParams.get("user") ?? "";
  const [mode, setMode] = useState<"notifications" | "chats">(targetUserID ? "chats" : "notifications");
  const [kind, setKind] = useState<NotificationKind>("system");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationID, setSelectedConversationID] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [translatingID, setTranslatingID] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [aiBalance, setAIBalance] = useState<AITokenBalance | null>(null);
  const [status, setStatus] = useState("");
  const lastMessageIDRef = useRef("");
  const messagesLoadingRef = useRef(false);
  const conversationsLoadingRef = useRef(false);

  const selectedConversation = conversations.find((item) => item.id === selectedConversationID) ?? null;

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    const result = await apiRequest<NotificationItem[]>(`/api/v1/notifications?kind=${kind}`, {}, token);
    setNotifications(result);
  }, [kind, token]);

  const loadUnreadNotifications = useCallback(async () => {
    if (!token) return;
    const result = await apiRequest<{ notifications: number }>("/api/v1/me/unread-summary", {}, token);
    setUnreadNotifications(result.notifications);
  }, [token]);

  const loadConversations = useCallback(async () => {
    if (!token || conversationsLoadingRef.current) return;
    conversationsLoadingRef.current = true;
    try {
      const result = await apiRequest<Conversation[]>("/api/v1/messages/conversations", {}, token);
      setConversations(result);
    } finally { conversationsLoadingRef.current = false; }
  }, [token]);

  const loadBalance = useCallback(async () => {
    if (!token) return;
    setAIBalance(await apiRequest<AITokenBalance>("/api/v1/notifications/ai-balance", {}, token));
  }, [token]);

  const loadMessages = useCallback(async (conversationID: string) => {
    if (!token || messagesLoadingRef.current) return;
    messagesLoadingRef.current = true;
    try {
      const after = lastMessageIDRef.current ? `?after=${encodeURIComponent(lastMessageIDRef.current)}` : "";
      const result = await apiRequest<DirectMessage[]>(`/api/v1/messages/conversations/${conversationID}${after}`, {}, token);
      if (result.length > 0) {
        lastMessageIDRef.current = result[result.length - 1].id;
        setMessages((current) => {
          if (!after) return result;
          const existing = new Set(current.map((item) => item.id));
          return [...current, ...result.filter((item) => !existing.has(item.id))];
        });
      } else if (!after) setMessages([]);
      window.dispatchEvent(new Event("mcmods-unread-change"));
    } finally { messagesLoadingRef.current = false; }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => {
      void Promise.all([loadNotifications(), loadUnreadNotifications(), loadConversations()]).catch((error) => {
        setStatus(error instanceof Error ? error.message : t("messages.loadFailed"));
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadConversations, loadNotifications, loadUnreadNotifications, t, token]);

  useEffect(() => {
    if (!token) return;
    const receive = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (detail?.type?.startsWith("notification.")) {
        void Promise.all([loadNotifications(), loadUnreadNotifications()]);
      }
      if (detail?.type === "message.created") void loadConversations();
    };
    window.addEventListener("mcmods-realtime", receive);
    return () => window.removeEventListener("mcmods-realtime", receive);
  }, [loadConversations, loadNotifications, loadUnreadNotifications, token]);

  useEffect(() => {
    if (!token || !targetUserID || targetUserID === user?.id) return;
    let cancelled = false;
    apiRequest<{ id: string }>(
      "/api/v1/messages/conversations",
      { method: "POST", body: JSON.stringify({ userId: targetUserID }) },
      token,
    ).then(async (result) => {
      if (cancelled) return;
      setMode("chats");
      setSelectedConversationID(result.id);
      await loadConversations();
    }).catch((error) => setStatus(error instanceof Error ? error.message : t("messages.startFailed")));
    return () => {
      cancelled = true;
    };
  }, [loadConversations, t, targetUserID, token, user?.id]);

  useEffect(() => {
    if (!selectedConversationID || !token) return;
    lastMessageIDRef.current = "";
    const initialTimer = window.setTimeout(() => {
      setMessages([]);
      void loadMessages(selectedConversationID).catch((error) => setStatus(error instanceof Error ? error.message : t("messages.loadFailed")));
    }, 0);
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadMessages(selectedConversationID);
      void loadConversations();
    };
    const timer = window.setInterval(refresh, 60_000);
    const presence = window.setInterval(() => {
      if (document.visibilityState === "visible") void apiRequest(`/api/v1/messages/conversations/${selectedConversationID}/presence`, { method: "PUT" }, token);
    }, 20_000);
    const realtime = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (detail?.type === "message.created" || detail?.type === "unread.changed") refresh();
    };
    window.addEventListener("mcmods-realtime", realtime);
    void apiRequest(`/api/v1/messages/conversations/${selectedConversationID}/presence`, { method: "PUT" }, token);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.clearInterval(presence);
      window.removeEventListener("mcmods-realtime", realtime);
    };
  }, [loadConversations, loadMessages, selectedConversationID, t, token]);

  async function markRead(item: NotificationItem) {
    if (!token || item.read) return;
    try {
      await apiRequest(`/api/v1/notifications/${item.id}/read`, { method: "POST" }, token);
      setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
      setUnreadNotifications((current) => Math.max(0, current - 1));
      window.dispatchEvent(new Event("mcmods-unread-change"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("messages.markReadFailed"));
    }
  }

  async function openNotificationTarget(event: React.MouseEvent<HTMLAnchorElement>, item: NotificationItem, href: string) {
    event.preventDefault();
    event.stopPropagation();
    await markRead(item);
    router.push(href);
  }

  async function markAllRead() {
    if (!token || markingAllRead || unreadNotifications === 0) return;
    setMarkingAllRead(true);
    setStatus("");
    try {
      await apiRequest<{ read: true; updated: number }>("/api/v1/notifications/read-all", { method: "POST" }, token);
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadNotifications(0);
      window.dispatchEvent(new Event("mcmods-unread-change"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("messages.markReadFailed"));
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function translate(item: NotificationItem) {
	if (!token || translatingID || !item.translationAllowed) return;
    setTranslatingID(item.id);
    setStatus("");
    try {
      const started = await apiRequest<{ cached: boolean; taskId?: string; translation?: Translation }>(
        `/api/v1/notifications/${item.id}/translate`,
        { method: "POST", body: JSON.stringify({ targetLocale: locale }) },
        token,
      );
      let translation = started.translation;
      if (!started.cached && started.taskId) {
        translation = await waitForTranslation(started.taskId, token);
      }
      if (translation) setTranslations((current) => ({ ...current, [item.id]: translation! }));
      await loadBalance();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("messages.translationFailed"));
    } finally {
      setTranslatingID(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedConversationID || !selectedConversation?.canMessage || !messageDraft.trim()) return;
    try {
      const result = await apiRequest<{ message: DirectMessage }>(
        `/api/v1/messages/conversations/${selectedConversationID}`,
        { method: "POST", body: JSON.stringify({ body: messageDraft }) },
        token,
      );
      setMessages((current) => [...current, result.message]);
      setMessageDraft("");
      await loadConversations();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("messages.sendFailed"));
    }
  }

  if (!ready) return <PageFeedback title={t("common.loading")} />;
  if (!user || !token) return <LoginRequiredState nextPath="/messages" description={t("messages.loginRequired")} />;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--accent)]">{t("messages.kicker")}</p>
            <h1 className="text-2xl font-black">{t("messages.title")}</h1>
          </div>
          <div className="flex rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1">
            <ModeButton active={mode === "notifications"} onClick={() => setMode("notifications")}>{t("messages.notifications")}</ModeButton>
            <ModeButton active={mode === "chats"} onClick={() => setMode("chats")}>{t("messages.privateChats")}</ModeButton>
          </div>
        </div>
        {status ? <div className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm">{status}</div> : null}

        {mode === "notifications" ? (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="surface h-fit p-3">
              <nav className="grid gap-1">
                {notificationKinds.map((item) => (
                  <button key={item} className={`focus-ring rounded-md px-3 py-3 text-left text-sm font-bold ${kind === item ? "bg-[var(--accent)] text-white" : "hover:bg-[var(--panel-subtle)]"}`} type="button" onClick={() => setKind(item)}>
                    {t(`messages.kinds.${item}`)}
                  </button>
                ))}
              </nav>
			  {notifications.some((item) => item.translationAllowed) && aiBalance ? <AIBalanceCard balance={aiBalance} /> : null}
            </aside>
            <section className="grid content-start gap-3">
              <div className="flex justify-end">
                <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={markingAllRead || unreadNotifications === 0} type="button" onClick={() => void markAllRead()}>
                  {markingAllRead ? t("messages.markingAllRead") : t("messages.markAllRead")}
                </button>
              </div>
              {notifications.map((item) => {
                const translated = translations[item.id];
                const target = notificationTarget(item, t("messages.openRelatedContent"));
                const title = translated?.title || item.title;
                const body = translated?.body || item.body;
                return (
                  <article key={item.id} className={`surface p-5 ${item.read ? "opacity-75" : "border-l-4 border-l-[var(--accent)]"}`} onClick={() => void markRead(item)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold">
                          {target ? (
                            <Link className="focus-ring rounded-sm hover:text-[var(--accent)] hover:underline" href={target.href} onClick={(event) => void openNotificationTarget(event, item, target.href)}>
                              {title}
                            </Link>
                          ) : title}
                        </h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--muted)]">
                          <NotificationBody body={body} item={item} target={target} onOpen={openNotificationTarget} />
                        </p>
                      </div>
                      {!item.read ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]" /> : null}
                    </div>
                    {item.actors.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.actors.slice(0, 3).map((actor) => {
                          const actorHref = `/user/${encodeURIComponent(actor.id)}`;
                          return (
                            <Link key={actor.id} className="focus-ring rounded-sm text-xs font-semibold text-[var(--accent)] hover:underline" href={actorHref} onClick={(event) => void openNotificationTarget(event, item, actorHref)}>
                              {actor.username}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--line)] pt-3">
                      <time className="text-xs text-[var(--muted)]">{new Date(item.updatedAt).toLocaleString()}</time>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {target ? (
                          <Link className="button-secondary focus-ring px-3 py-2 text-sm" href={target.href} onClick={(event) => void openNotificationTarget(event, item, target.href)}>
                            {t("messages.openRelatedContent")}
                          </Link>
                        ) : null}
						{item.translationAllowed ? <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={translatingID !== null || item.sourceLocale === locale} type="button" onClick={(event) => { event.stopPropagation(); void translate(item); }}>
						  {translatingID === item.id ? t("messages.translating") : t("messages.aiTranslate")}
						</button> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
              {notifications.length === 0 ? <MessageState text={t("messages.emptyNotifications")} /> : null}
            </section>
          </div>
        ) : (
          <div className="grid min-h-[620px] overflow-hidden border border-[var(--line)] bg-[var(--panel)] lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="border-b border-[var(--line)] lg:border-b-0 lg:border-r">
              <div className="border-b border-[var(--line)] p-4 font-bold">{t("messages.conversations")}</div>
              <div className="max-h-[620px] overflow-y-auto">
                {conversations.map((item) => (
                  <button key={item.id} className={`focus-ring flex w-full items-start gap-3 border-b border-[var(--line)] p-4 text-left ${selectedConversationID === item.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--panel-subtle)]"}`} type="button" onClick={() => setSelectedConversationID(item.id)}>
                    <UserAvatar avatarUrl={item.avatarUrl} onlineStatus={item.onlineStatus} size={40} username={item.username} />
                    <span className="min-w-0 flex-1">
<span className="flex items-center justify-between gap-2"><strong className="truncate">{item.username}</strong>{item.unreadCount > 0 ? <b className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs text-white">{item.unreadCount}</b> : null}</span>
                      <span className="mt-1 block truncate text-xs text-[var(--muted)]">{item.lastMessage || t("messages.noMessages")}</span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
            <section className="flex min-h-0 flex-col">
              {selectedConversation ? (
                <>
                  <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
                    <Link className="flex items-center gap-2 font-bold hover:text-[var(--accent)]" href={`/user/${selectedConversation.partnerId}`}><OnlineStatusDot className="h-3 w-3" status={selectedConversation.onlineStatus} />{selectedConversation.username}</Link>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--background)] p-4">
                    {messages.map((item) => <MessageBubble key={item.id} item={item} own={item.senderId === user.id} />)}
                  </div>
                  {selectedConversation.canMessage ? (
                    <form className="flex gap-3 border-t border-[var(--line)] p-4" onSubmit={sendMessage}>
                      <textarea className="field min-h-16 flex-1 resize-none" maxLength={4000} value={messageDraft} placeholder={t("messages.messagePlaceholder")} onChange={(event) => setMessageDraft(event.target.value)} />
                      <button className="button-primary focus-ring self-end" type="submit">{t("messages.send")}</button>
                    </form>
                  ) : <p className="border-t border-[var(--line)] p-4 text-sm text-[var(--muted)]">{t("messages.blockedConversation")}</p>}
                </>
              ) : <MessageState text={t("messages.selectConversation")} />}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function NotificationBody({
  body,
  item,
  target,
  onOpen,
}: {
  body: string;
  item: NotificationItem;
  target: NotificationTarget | null;
  onOpen: (event: React.MouseEvent<HTMLAnchorElement>, item: NotificationItem, href: string) => Promise<void>;
}) {
  if (!target || target.label.length === 0) return body;
  const labelIndex = body.indexOf(target.label);
  if (labelIndex < 0) return body;
  return (
    <>
      {body.slice(0, labelIndex)}
      <Link className="focus-ring rounded-sm font-semibold text-[var(--accent)] hover:underline" href={target.href} onClick={(event) => void onOpen(event, item, target.href)}>
        {target.label}
      </Link>
      {body.slice(labelIndex + target.label.length)}
    </>
  );
}

function notificationTarget(item: NotificationItem, fallbackLabel: string): NotificationTarget | null {
  const data = item.data ?? {};
  const href = normalizeInternalPath(data.url);
  if (!href) return null;
  const label = notificationDataText(data, "targetLabel")
    || notificationDataText(data, "targetTitle")
    || fallbackLabel;
  return { href, label };
}

function notificationDataText(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function ModeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={`focus-ring rounded-md px-4 py-2 text-sm font-bold ${active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"}`} type="button" onClick={onClick}>{children}</button>;
}

function MessageBubble({ item, own }: { item: DirectMessage; own: boolean }) {
  return (
    <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-lg px-4 py-3 text-sm leading-6 ${own ? "bg-[var(--accent)] text-white" : "border border-[var(--line)] bg-[var(--panel)]"}`}>
        <p className="whitespace-pre-wrap break-words">{item.body}</p>
        <time className={`mt-1 block text-right text-[11px] ${own ? "text-white/75" : "text-[var(--muted)]"}`}>{new Date(item.createdAt).toLocaleTimeString()}</time>
      </div>
    </div>
  );
}

function AIBalanceCard({ balance }: { balance: AITokenBalance }) {
  const { t } = useI18n();
  const used = balance.usedTokens + balance.reservedTokens;
  const percent = balance.unlimited || balance.limitTokens <= 0 ? 0 : Math.min(100, Math.round((used / balance.limitTokens) * 100));
  return (
    <div className="mt-4 border-t border-[var(--line)] pt-4 text-xs">
      <div className="flex justify-between gap-2 font-semibold"><span>{t("messages.aiBalance")}</span><span>{balance.unlimited ? t("user.unlimited") : `${balance.remainingTokens}`}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--panel-subtle)]"><div className="h-full bg-[var(--accent)]" style={{ width: balance.unlimited ? "100%" : `${percent}%` }} /></div>
      <div className="mt-1 text-[var(--muted)]">{t("messages.tokensUsed", { used, limit: balance.unlimited ? "∞" : balance.limitTokens })}</div>
    </div>
  );
}

function MessageState({ text, children }: { text: string; children?: React.ReactNode }) {
  return <div className="grid min-h-56 place-items-center p-6 text-center text-sm text-[var(--muted)]"><div>{text}{children}</div></div>;
}

async function waitForTranslation(taskID: string, token: string): Promise<Translation> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const task = await apiRequest<{ status: string; error?: string; translation?: Translation }>(`/api/v1/notifications/translations/${taskID}`, {}, token);
    if (task.status === "completed" && task.translation) return task.translation;
    if (task.status === "failed") throw new Error(task.error || "AI translation failed");
    await new Promise((resolve) => window.setTimeout(resolve, 800));
  }
  throw new Error("AI translation timed out");
}
