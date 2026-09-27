export type RealtimeEventDetail = {
  id?: string;
  type: string;
  data?: unknown;
};

type QueryListener = () => void;
type QueryLoader<T> = () => Promise<T>;

type QueryCacheEntry = {
  generation: number;
  promise?: Promise<unknown>;
  hasValue: boolean;
  value?: unknown;
  cachedAt: number;
};

type RealtimeQueryCoordinatorOptions = {
  schedule?: (callback: () => void) => void;
  now?: () => number;
};

type ReadQueryOptions = {
  maxAgeMs?: number;
};

export const realtimeQueryKeys = {
  unreadSummary: (userID: string) => `unread-summary:${userID}`,
  notifications: (userID: string, kind: string) => `notifications:${userID}:${kind}`,
  notificationPrefix: (userID: string) => `notifications:${userID}:`,
  conversations: (userID: string) => `direct-conversations:${userID}`,
  messages: (userID: string, conversationID: string) => `direct-messages:${userID}:${conversationID}`,
};

function dataString(data: unknown, key: string): string {
  if (!data || typeof data !== "object") return "";
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function createRealtimeQueryCoordinator(options: RealtimeQueryCoordinatorOptions = {}) {
  const schedule = options.schedule ?? queueMicrotask;
  const now = options.now ?? Date.now;
  const listeners = new Map<string, Set<QueryListener>>();
  const cache = new Map<string, QueryCacheEntry>();
  const generations = new Map<string, number>();
  const pendingKeys = new Set<string>();
  let flushScheduled = false;

  const generation = (key: string) => generations.get(key) ?? 0;

  function flush() {
    flushScheduled = false;
    const callbacks = new Set<QueryListener>();
    for (const key of pendingKeys) {
      for (const listener of listeners.get(key) ?? []) callbacks.add(listener);
    }
    pendingKeys.clear();
    for (const callback of callbacks) callback();
  }

  function invalidate(key: string) {
    generations.set(key, generation(key) + 1);
    cache.delete(key);
    pendingKeys.add(key);
    if (!flushScheduled) {
      flushScheduled = true;
      schedule(flush);
    }
  }

  function invalidatePrefix(prefix: string) {
    const matching = new Set<string>();
    for (const key of listeners.keys()) if (key.startsWith(prefix)) matching.add(key);
    for (const key of cache.keys()) if (key.startsWith(prefix)) matching.add(key);
    for (const key of matching) invalidate(key);
  }

  function subscribe(key: string, listener: QueryListener) {
    const current = listeners.get(key) ?? new Set<QueryListener>();
    current.add(listener);
    listeners.set(key, current);
    return () => {
      current.delete(listener);
      if (current.size === 0) listeners.delete(key);
    };
  }

  function hasSubscribers(key: string) {
    return (listeners.get(key)?.size ?? 0) > 0;
  }

  function routeRealtimeEvent(userID: string, event: RealtimeEventDetail) {
    if (!userID) return;
    const unreadKey = realtimeQueryKeys.unreadSummary(userID);
    if (event.type === "message.created") {
      invalidate(realtimeQueryKeys.conversations(userID));
      const conversationID = dataString(event.data, "conversationId");
      const messageKey = conversationID ? realtimeQueryKeys.messages(userID, conversationID) : "";
      if (messageKey && hasSubscribers(messageKey)) invalidate(messageKey);
      else invalidate(unreadKey);
      return;
    }
    if (event.type === "notification.created" || event.type === "notification.changed") {
      invalidate(unreadKey);
      const kind = dataString(event.data, "kind");
      if (kind) invalidate(realtimeQueryKeys.notifications(userID, kind));
      else invalidatePrefix(realtimeQueryKeys.notificationPrefix(userID));
      return;
    }
    if (event.type === "unread.changed") invalidate(unreadKey);
  }

  async function readQuery<T>(key: string, loader: QueryLoader<T>, readOptions: ReadQueryOptions = {}): Promise<T> {
    const maxAgeMs = Math.max(0, readOptions.maxAgeMs ?? 0);
    const existing = cache.get(key);
    if (existing?.promise) {
      try {
        const value = await existing.promise as T;
        if (generation(key) !== existing.generation) return readQuery(key, loader, readOptions);
        return value;
      } catch (error) {
        if (generation(key) !== existing.generation) return readQuery(key, loader, readOptions);
        throw error;
      }
    }
    if (existing?.hasValue && maxAgeMs > 0 && now() - existing.cachedAt <= maxAgeMs) {
      return existing.value as T;
    }

    const requestGeneration = generation(key);
    const promise = loader();
    const entry: QueryCacheEntry = {
      generation: requestGeneration,
      promise,
      hasValue: false,
      cachedAt: 0,
    };
    cache.set(key, entry);
    try {
      const value = await promise;
      if (generation(key) !== requestGeneration) return readQuery(key, loader, readOptions);
      if (cache.get(key) === entry) {
        cache.set(key, {
          generation: requestGeneration,
          hasValue: true,
          value,
          cachedAt: now(),
        });
      }
      return value;
    } catch (error) {
      if (generation(key) !== requestGeneration) return readQuery(key, loader, readOptions);
      if (cache.get(key) === entry) cache.delete(key);
      throw error;
    }
  }

  return {
    invalidate,
    readQuery,
    routeRealtimeEvent,
    subscribe,
  };
}

export const realtimeQueryCoordinator = createRealtimeQueryCoordinator();
