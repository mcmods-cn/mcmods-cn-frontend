"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "../_lib/api";
import { loadPublicUserProfile, type AITokenBalance, type OnlineStatus } from "../_lib/user-api";
import { useAuthSnapshot } from "../_lib/auth";
import { useI18n } from "../_lib/i18n-provider";
import { LoginRequiredState, PageFeedback } from "./page-feedback";
import { normalizeInternalPath } from "../_lib/navigation";
import { realtimeQueryCoordinator, realtimeQueryKeys } from "../_lib/realtime-query-cache.mts";
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

type NotificationPage = {
  items: NotificationItem[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
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

type ConversationPage = {
  items: Conversation[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
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

type DirectMessagePage = {
  items: DirectMessage[];
  limit: number;
  hasMore: boolean;
  nextCursor: string;
};

type Translation = { title: string; body: string };
type NotificationTarget = { href: string; label: string };

const notificationKinds: NotificationKind[] = ["system", "reply_mention", "comment_watch_reply", "review", "new_follower"];
const emptyNotificationPage = (): NotificationPage => ({ items: [], limit: 50, hasMore: false, nextCursor: "" });
const emptyConversationPage = (): ConversationPage => ({ items: [], limit: 30, hasMore: false, nextCursor: "" });
const emptyDirectMessagePage = (): DirectMessagePage => ({ items: [], limit: 100, hasMore: false, nextCursor: "" });

export function MessagesCenter() {
  const { token, user } = useAuthSnapshot();
  return <MessagesCenterSession key={`${user?.id || "guest"}:${token || "guest"}`} />;
}

function MessagesCenterSession() {
  const { t, locale } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserID = searchParams.get("user") ?? "";
  const [mode, setMode] = useState<"notifications" | "chats">(targetUserID ? "chats" : "notifications");
  const [kind, setKind] = useState<NotificationKind>("system");
  const [notifications, setNotifications] = useState<NotificationPage>(emptyNotificationPage);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [conversationPage, setConversationPage] = useState<ConversationPage>(emptyConversationPage);
  const [selectedConversationID, setSelectedConversationID] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messageHistory, setMessageHistory] = useState<DirectMessagePage>(emptyDirectMessagePage);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const sendingMessageRef = useRef(false);
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [translatingID, setTranslatingID] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [aiBalanceSnapshot, setAIBalanceSnapshot] = useState<{ token: string; balance: AITokenBalance } | null>(null);
  const [status, setStatus] = useState("");
  const lastMessageIDRef = useRef("");
  const selectedConversationIDRef = useRef<string | null>(null);
  const messagesLoadingConversationRef = useRef("");
  const messageRefreshSequenceRef = useRef(0);
  const messageRequestAbortRef = useRef<AbortController | null>(null);
  const olderMessageRequestAbortRef = useRef<AbortController | null>(null);
  const conversationRequestVersionRef = useRef(0);
  const messageRequestVersionRef = useRef(0);
  const notificationRequestVersionRef = useRef(0);
  const [loadingMoreNotifications, setLoadingMoreNotifications] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  const reportLoadError = useCallback((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t("messages.loadFailed"));
  }, [t]);

  const conversations = conversationPage.items;
  const selectedConversation = conversations.find((item) => item.id === selectedConversationID) ?? null;
  const hasTranslatableNotifications = notifications.items.some((item) => item.translationAllowed);
  const aiBalance = aiBalanceSnapshot?.token === token ? aiBalanceSnapshot.balance : null;
  const hasCurrentAIBalance = aiBalance !== null;

  useEffect(() => {
    selectedConversationIDRef.current = selectedConversationID;
  }, [selectedConversationID]);

  const invalidateMessageRequests = useCallback(() => {
    messageRequestVersionRef.current++;
    messageRequestAbortRef.current?.abort();
    messageRequestAbortRef.current = null;
    olderMessageRequestAbortRef.current?.abort();
    olderMessageRequestAbortRef.current = null;
    messagesLoadingConversationRef.current = "";
  }, []);

  const selectConversation = useCallback((conversationID: string) => {
    if (selectedConversationIDRef.current === conversationID) return;
    invalidateMessageRequests();
    selectedConversationIDRef.current = conversationID;
    lastMessageIDRef.current = "";
    setMessages([]);
    setMessageHistory(emptyDirectMessagePage());
    setMessageDraft("");
    setLoadingOlderMessages(false);
    setSelectedConversationID(conversationID);
  }, [invalidateMessageRequests]);

  const loadNotifications = useCallback(async () => {
    if (!token || !user) return;
    const requestVersion = ++notificationRequestVersionRef.current;
    const result = await realtimeQueryCoordinator.readQuery(
      realtimeQueryKeys.notifications(user.id, kind),
      () => apiRequest<NotificationPage>(`/api/v1/notifications?kind=${kind}`, {}, token),
      { maxAgeMs: 1_000 },
    );
    if (requestVersion === notificationRequestVersionRef.current) setNotifications(result);
  }, [kind, token, user]);

  async function loadMoreNotifications() {
    if (!token || !notifications.hasMore || !notifications.nextCursor || loadingMoreNotifications) return;
    const requestVersion = notificationRequestVersionRef.current;
    setLoadingMoreNotifications(true);
    try {
      const result = await apiRequest<NotificationPage>(`/api/v1/notifications?kind=${kind}&limit=${notifications.limit}&cursor=${encodeURIComponent(notifications.nextCursor)}`, {}, token);
      if (requestVersion !== notificationRequestVersionRef.current) return;
      setNotifications((current) => {
        const existing = new Set(current.items.map((item) => item.id));
        return { ...result, items: [...current.items, ...result.items.filter((item) => !existing.has(item.id))] };
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("messages.loadFailed"));
    } finally {
      setLoadingMoreNotifications(false);
    }
  }

  const loadUnreadNotifications = useCallback(async () => {
    if (!token || !user) return;
    const result = await realtimeQueryCoordinator.readQuery(
      realtimeQueryKeys.unreadSummary(user.id),
      () => apiRequest<{ notifications: number }>("/api/v1/me/unread-summary", {}, token),
      { maxAgeMs: 1_000 },
    );
    setUnreadNotifications(result.notifications);
  }, [token, user]);

  const loadConversations = useCallback(async () => {
    if (!token || !user) return;
    const requestVersion = ++conversationRequestVersionRef.current;
    const result = await realtimeQueryCoordinator.readQuery(
      realtimeQueryKeys.conversations(user.id),
      () => apiRequest<ConversationPage>("/api/v1/messages/conversations?limit=30", {}, token),
      { maxAgeMs: 1_000 },
    );
    if (requestVersion !== conversationRequestVersionRef.current) return;
    setConversationPage((current) => {
      const selected = current.items.find((item) => item.id === selectedConversationIDRef.current);
      if (!selected || result.items.some((item) => item.id === selected.id)) return result;
      return { ...result, items: [...result.items, selected] };
    });
  }, [token, user]);

  async function loadMoreConversations() {
    if (!token || !conversationPage.hasMore || !conversationPage.nextCursor || loadingMoreConversations) return;
    const requestVersion = conversationRequestVersionRef.current;
    setLoadingMoreConversations(true);
    try {
      const result = await apiRequest<ConversationPage>(`/api/v1/messages/conversations?limit=${conversationPage.limit}&cursor=${encodeURIComponent(conversationPage.nextCursor)}`, {}, token);
      if (requestVersion !== conversationRequestVersionRef.current) return;
      setConversationPage((current) => {
        const existing = new Set(current.items.map((item) => item.id));
        return { ...result, items: [...current.items, ...result.items.filter((item) => !existing.has(item.id))] };
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("messages.loadFailed"));
    } finally {
      setLoadingMoreConversations(false);
    }
  }

  const loadBalance = useCallback(async (signal?: AbortSignal) => {
    if (!token) return;
    const balance = await apiRequest<AITokenBalance>("/api/v1/notifications/ai-balance", { signal }, token);
    if (signal?.aborted) return;
    setAIBalanceSnapshot({ token, balance });
  }, [token]);

  useEffect(() => {
    if (!hasTranslatableNotifications || hasCurrentAIBalance) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadBalance(controller.signal).catch((error) => {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : t("messages.loadFailed"));
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hasCurrentAIBalance, hasTranslatableNotifications, loadBalance, t]);

  const loadMessages = useCallback(async (conversationID: string, initial = false) => {
    if (!token) return;
    const refreshSequence = ++messageRefreshSequenceRef.current;
    if (!initial && messagesLoadingConversationRef.current === conversationID) return;
    messageRequestAbortRef.current?.abort();
    const requestController = new AbortController();
    messageRequestAbortRef.current = requestController;
    const requestVersion = ++messageRequestVersionRef.current;
    messagesLoadingConversationRef.current = conversationID;
    try {
      let observedRefreshSequence = refreshSequence;
      let loadInitialPage = initial;
      do {
        let afterID = loadInitialPage ? "" : lastMessageIDRef.current;
        loadInitialPage = false;
        if (!afterID) {
          const page = await apiRequest<DirectMessagePage>(`/api/v1/messages/conversations/${conversationID}?limit=100`, { signal: requestController.signal }, token);
          if (requestController.signal.aborted || selectedConversationIDRef.current !== conversationID || requestVersion !== messageRequestVersionRef.current) return;
          setMessages(page.items);
          setMessageHistory(page);
          lastMessageIDRef.current = page.items.at(-1)?.id ?? "";
        } else {
          let page: DirectMessagePage;
          do {
            page = await apiRequest<DirectMessagePage>(`/api/v1/messages/conversations/${conversationID}?limit=100&after=${encodeURIComponent(afterID)}`, { signal: requestController.signal }, token);
            if (requestController.signal.aborted || selectedConversationIDRef.current !== conversationID || requestVersion !== messageRequestVersionRef.current) return;
            if (page.items.length > 0) {
              afterID = page.items.at(-1)!.id;
              lastMessageIDRef.current = afterID;
              setMessages((current) => {
                const existing = new Set(current.map((item) => item.id));
                return [...current, ...page.items.filter((item) => !existing.has(item.id))];
              });
            }
          } while (page.hasMore && page.items.length > 0);
        }
        if (observedRefreshSequence === messageRefreshSequenceRef.current) break;
        observedRefreshSequence = messageRefreshSequenceRef.current;
      } while (selectedConversationIDRef.current === conversationID);
    } catch (error) {
      if (requestController.signal.aborted) return;
      throw error;
    } finally {
      if (messageRequestAbortRef.current === requestController) messageRequestAbortRef.current = null;
      if (messagesLoadingConversationRef.current === conversationID) messagesLoadingConversationRef.current = "";
    }
  }, [token]);

  async function loadOlderMessages() {
    if (!token || !selectedConversationID || !messageHistory.hasMore || !messageHistory.nextCursor || loadingOlderMessages) return;
    const conversationID = selectedConversationID;
    const requestVersion = messageRequestVersionRef.current;
    olderMessageRequestAbortRef.current?.abort();
    const requestController = new AbortController();
    olderMessageRequestAbortRef.current = requestController;
    setLoadingOlderMessages(true);
    try {
      const result = await apiRequest<DirectMessagePage>(`/api/v1/messages/conversations/${conversationID}?limit=${messageHistory.limit}&cursor=${encodeURIComponent(messageHistory.nextCursor)}`, { signal: requestController.signal }, token);
      if (requestController.signal.aborted || selectedConversationIDRef.current !== conversationID || requestVersion !== messageRequestVersionRef.current) return;
      setMessages((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [...result.items.filter((item) => !existing.has(item.id)), ...current];
      });
      setMessageHistory(result);
    } catch (error) {
      if (requestController.signal.aborted) return;
      setStatus(error instanceof Error ? error.message : t("messages.loadFailed"));
    } finally {
      if (olderMessageRequestAbortRef.current === requestController) {
        olderMessageRequestAbortRef.current = null;
        setLoadingOlderMessages(false);
      }
    }
  }

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
    if (!token || !user) return;
    const unsubscribeNotifications = realtimeQueryCoordinator.subscribe(
      realtimeQueryKeys.notifications(user.id, kind),
      () => { void loadNotifications().catch(reportLoadError); },
    );
    const unsubscribeConversations = realtimeQueryCoordinator.subscribe(
      realtimeQueryKeys.conversations(user.id),
      () => { void loadConversations().catch(reportLoadError); },
    );
    const unsubscribeUnread = realtimeQueryCoordinator.subscribe(
      realtimeQueryKeys.unreadSummary(user.id),
      () => { void loadUnreadNotifications().catch(reportLoadError); },
    );
    return () => {
      unsubscribeNotifications();
      unsubscribeConversations();
      unsubscribeUnread();
    };
  }, [kind, loadConversations, loadNotifications, loadUnreadNotifications, reportLoadError, token, user]);

  useEffect(() => {
    if (!token || !user || !targetUserID || targetUserID === user.id) return;
    let cancelled = false;
    Promise.all([
      apiRequest<{ id: string }>(
        "/api/v1/messages/conversations",
        { method: "POST", body: JSON.stringify({ userId: targetUserID }) },
        token,
      ),
      loadPublicUserProfile(targetUserID, token),
    ]).then(async ([result, profile]) => {
      if (cancelled) return;
      setMode("chats");
      selectConversation(result.id);
      realtimeQueryCoordinator.invalidate(realtimeQueryKeys.conversations(user.id));
      await loadConversations();
      if (cancelled) return;
      setConversationPage((current) => current.items.some((item) => item.id === result.id) ? current : {
        ...current,
        items: [...current.items, {
          id: result.id,
          partnerId: profile.id,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          onlineStatus: profile.onlineStatus,
          lastMessage: "",
          unreadCount: 0,
          canMessage: profile.canMessage,
        }],
      });
    }).catch((error) => setStatus(error instanceof Error ? error.message : t("messages.startFailed")));
    return () => {
      cancelled = true;
    };
  }, [loadConversations, selectConversation, t, targetUserID, token, user]);

  useEffect(() => {
    if (!selectedConversationID || !token || !user) return;
    const initialTimer = window.setTimeout(() => {
      void loadMessages(selectedConversationID, true).catch((error) => setStatus(error instanceof Error ? error.message : t("messages.loadFailed")));
    }, 0);
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadMessages(selectedConversationID).catch(reportLoadError);
      void loadConversations().catch(reportLoadError);
    };
    const timer = window.setInterval(refresh, 60_000);
    const presence = window.setInterval(() => {
      if (document.visibilityState === "visible") void apiRequest(`/api/v1/messages/conversations/${selectedConversationID}/presence`, { method: "PUT" }, token).catch(reportLoadError);
    }, 20_000);
    const unsubscribeMessages = realtimeQueryCoordinator.subscribe(
      realtimeQueryKeys.messages(user.id, selectedConversationID),
      () => {
        if (document.visibilityState !== "visible") {
          realtimeQueryCoordinator.invalidate(realtimeQueryKeys.unreadSummary(user.id));
          return;
        }
        void loadMessages(selectedConversationID).catch((error) => {
          setStatus(error instanceof Error ? error.message : t("messages.loadFailed"));
          realtimeQueryCoordinator.invalidate(realtimeQueryKeys.unreadSummary(user.id));
        });
      },
    );
    void apiRequest(`/api/v1/messages/conversations/${selectedConversationID}/presence`, { method: "PUT" }, token).catch(reportLoadError);
    return () => {
      invalidateMessageRequests();
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.clearInterval(presence);
      unsubscribeMessages();
    };
  }, [invalidateMessageRequests, loadConversations, loadMessages, reportLoadError, selectedConversationID, t, token, user]);

  async function markRead(item: NotificationItem) {
    if (!token || !user || item.read) return;
    try {
      await apiRequest(`/api/v1/notifications/${item.id}/read`, { method: "POST" }, token);
      setNotifications((current) => ({ ...current, items: current.items.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry) }));
      setUnreadNotifications((current) => Math.max(0, current - 1));
      realtimeQueryCoordinator.invalidate(realtimeQueryKeys.unreadSummary(user.id));
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
    if (!token || !user || markingAllRead || unreadNotifications === 0) return;
    setMarkingAllRead(true);
    setStatus("");
    try {
      await apiRequest<{ read: true; readBefore: string }>("/api/v1/notifications/read-all", { method: "POST" }, token);
      setNotifications((current) => ({ ...current, items: current.items.map((item) => ({ ...item, read: true })) }));
      setUnreadNotifications(0);
      realtimeQueryCoordinator.invalidate(realtimeQueryKeys.unreadSummary(user.id));
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
    let balanceRefreshNeeded = false;
    let translationFailed = false;
    try {
      const started = await apiRequest<{ cached: boolean; taskId?: string; translation?: Translation }>(
        `/api/v1/notifications/${item.id}/translate`,
        { method: "POST", body: JSON.stringify({ targetLocale: locale }) },
        token,
      );
      balanceRefreshNeeded = !started.cached;
      let translation = started.translation;
      if (!started.cached && started.taskId) {
        translation = await waitForTranslation(started.taskId, token);
      }
      if (translation) setTranslations((current) => ({ ...current, [`${locale}:${item.id}`]: translation! }));
    } catch (error) {
      translationFailed = true;
      setStatus(error instanceof Error ? error.message : t("messages.translationFailed"));
    } finally {
      if (balanceRefreshNeeded) {
        try {
          await loadBalance();
        } catch (error) {
          if (!translationFailed) setStatus(error instanceof Error ? error.message : t("messages.loadFailed"));
        }
      }
      setTranslatingID(null);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingMessageRef.current || !token || !user || !selectedConversationID || !selectedConversation?.canMessage || !messageDraft.trim()) return;
    const conversationID = selectedConversationID;
    const submittedBody = messageDraft;
    sendingMessageRef.current = true;
    setSendingMessage(true);
    try {
      const result = await apiRequest<{ message: DirectMessage }>(
        `/api/v1/messages/conversations/${conversationID}`,
        { method: "POST", body: JSON.stringify({ body: submittedBody }) },
        token,
      );
      if (selectedConversationIDRef.current !== conversationID) return;
      setMessages((current) => current.some((item) => item.id === result.message.id) ? current : [...current, result.message]);
      lastMessageIDRef.current = result.message.id;
      setMessageDraft((current) => current === submittedBody ? "" : current);
      realtimeQueryCoordinator.invalidate(realtimeQueryKeys.conversations(user.id));
      await loadConversations();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("messages.sendFailed"));
    } finally {
      sendingMessageRef.current = false;
      setSendingMessage(false);
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
                  <button key={item} className={`focus-ring rounded-md px-3 py-3 text-left text-sm font-bold ${kind === item ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--panel-subtle)]"}`} type="button" onClick={() => { notificationRequestVersionRef.current++; setNotifications(emptyNotificationPage()); setTranslations({}); setKind(item); }}>
                    {t(`messages.kinds.${item}`)}
                  </button>
                ))}
              </nav>
			  {hasTranslatableNotifications && hasCurrentAIBalance && aiBalance ? <AIBalanceCard balance={aiBalance} /> : null}
            </aside>
            <section className="grid content-start gap-3">
              <div className="flex justify-end">
                <button className="button-secondary focus-ring px-3 py-2 text-sm" disabled={markingAllRead || unreadNotifications === 0} type="button" onClick={() => void markAllRead()}>
                  {markingAllRead ? t("messages.markingAllRead") : t("messages.markAllRead")}
                </button>
              </div>
              {notifications.items.map((item) => {
                const translated = translations[`${locale}:${item.id}`];
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
              {notifications.items.length === 0 ? <MessageState text={t("messages.emptyNotifications")} /> : null}
              {notifications.hasMore ? <button className="button-secondary focus-ring justify-self-center" disabled={loadingMoreNotifications} type="button" onClick={() => void loadMoreNotifications()}>{loadingMoreNotifications ? t("messages.loadingMoreNotifications") : t("messages.loadMoreNotifications")}</button> : null}
            </section>
          </div>
        ) : (
          <div className="grid min-h-[620px] overflow-hidden border border-[var(--line)] bg-[var(--panel)] lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="border-b border-[var(--line)] lg:border-b-0 lg:border-r">
              <div className="border-b border-[var(--line)] p-4 font-bold">{t("messages.conversations")}</div>
              <div className="max-h-[620px] overflow-y-auto">
                {conversations.map((item) => (
                  <button key={item.id} className={`focus-ring flex w-full items-start gap-3 border-b border-[var(--line)] p-4 text-left ${selectedConversationID === item.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--panel-subtle)]"}`} type="button" onClick={() => selectConversation(item.id)}>
                    <UserAvatar avatarUrl={item.avatarUrl} onlineStatus={item.onlineStatus} size={40} username={item.username} />
                    <span className="min-w-0 flex-1">
<span className="flex items-center justify-between gap-2"><strong className="truncate">{item.username}</strong>{item.unreadCount > 0 ? <b className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--on-accent)]">{item.unreadCount}</b> : null}</span>
                      <span className="mt-1 block truncate text-xs text-[var(--muted)]">{item.lastMessage || t("messages.noMessages")}</span>
                    </span>
                  </button>
                ))}
                {conversationPage.hasMore ? <button className="button-secondary focus-ring m-3 w-[calc(100%-1.5rem)]" disabled={loadingMoreConversations} type="button" onClick={() => void loadMoreConversations()}>{loadingMoreConversations ? t("messages.loadingMoreConversations") : t("messages.loadMoreConversations")}</button> : null}
              </div>
            </aside>
            <section className="flex min-h-0 flex-col">
              {selectedConversation ? (
                <>
                  <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
                    <Link className="flex items-center gap-2 font-bold hover:text-[var(--accent)]" href={`/user/${selectedConversation.partnerId}`}><OnlineStatusDot className="h-3 w-3" status={selectedConversation.onlineStatus} />{selectedConversation.username}</Link>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--background)] p-4">
                    {messageHistory.hasMore ? <div className="flex justify-center"><button className="button-secondary focus-ring" disabled={loadingOlderMessages} type="button" onClick={() => void loadOlderMessages()}>{loadingOlderMessages ? t("messages.loadingOlderMessages") : t("messages.loadOlderMessages")}</button></div> : null}
                    {messages.map((item) => <MessageBubble key={item.id} item={item} own={item.senderId === user.id} />)}
                  </div>
                  {selectedConversation.canMessage ? (
                    <form className="flex gap-3 border-t border-[var(--line)] p-4" onSubmit={sendMessage}>
                      <textarea className="field min-h-16 flex-1 resize-none" maxLength={4000} value={messageDraft} placeholder={t("messages.messagePlaceholder")} onChange={(event) => setMessageDraft(event.target.value)} />
                      <button className="button-primary focus-ring self-end" disabled={sendingMessage} type="submit">{t("messages.send")}</button>
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
  return <button className={`focus-ring rounded-md px-4 py-2 text-sm font-bold ${active ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--muted)]"}`} type="button" onClick={onClick}>{children}</button>;
}

function MessageBubble({ item, own }: { item: DirectMessage; own: boolean }) {
  return (
    <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-lg px-4 py-3 text-sm leading-6 ${own ? "bg-[var(--accent)] text-[var(--on-accent)]" : "border border-[var(--line)] bg-[var(--panel)]"}`}>
        <p className="whitespace-pre-wrap break-words">{item.body}</p>
        <time className={`mt-1 block text-right text-[11px] ${own ? "text-[var(--on-accent)]" : "text-[var(--muted)]"}`}>{new Date(item.createdAt).toLocaleTimeString()}</time>
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
