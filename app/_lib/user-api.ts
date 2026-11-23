import { apiRequest } from "./api";

export type OnlineStatus = "online" | "offline" | "hidden";

export type PublicUserProfile = {
  id: string;
  username: string;
  status: string;
  createdAt: string;
  followers: number;
  following: number;
  blocked: number;
  isOwn: boolean;
  isFollowing: boolean;
  isBlocked: boolean;
  canBlock: boolean;
  canFollow: boolean;
  canMessage: boolean;
  avatarUrl: string;
  signature: string;
  profileBackgroundUrl: string;
  onlineStatus: OnlineStatus;
};

export type UserLevelSummary = {
  level: number;
  experience: number;
  experienceInLevel: number;
  experienceToNextLevel: number;
  lifetimeExperience: number;
  progressPercent: number;
};

export type PublicUserCard = {
  id: string;
  username: string;
  avatarUrl: string;
  onlineStatus: OnlineStatus;
  level: UserLevelSummary;
  statistics: Array<{ key: string; value: number } | null>;
};

export type AITokenBalance = {
  usedTokens: number;
  reservedTokens: number;
  limitTokens: number;
  remainingTokens: number;
  unlimited: boolean;
};

export function loadPublicUserProfile(userId: string, token?: string) {
  return apiRequest<PublicUserProfile>(`/api/v1/users/${userId}/profile`, {}, token);
}

type PendingUserCard = {
  controller: AbortController;
  result: Promise<PublicUserCard>;
  subscribers: number;
};

const pendingUserCards = new Map<string, PendingUserCard>();

export async function loadPublicUserCard(userId: string, viewerScope: string, signal: AbortSignal, token?: string) {
  signal.throwIfAborted();
  const key = JSON.stringify([viewerScope, token, userId.toLowerCase()]);
  let pending = pendingUserCards.get(key);
  if (!pending) {
    const controller = new AbortController();
    const result = apiRequest<PublicUserCard>(`/api/v1/users/${encodeURIComponent(userId)}/card`, {
      cache: "no-store",
      signal: controller.signal,
    }, token);
    pending = { controller, result, subscribers: 0 };
    pendingUserCards.set(key, pending);
  }

  const request = pending;
  request.subscribers++;
  let subscribed = true;
  function release() {
    if (!subscribed) return;
    subscribed = false;
    request.subscribers--;
    if (request.subscribers > 0 || pendingUserCards.get(key) !== request) return;
    pendingUserCards.delete(key);
    request.controller.abort();
  }
  signal.addEventListener("abort", release, { once: true });
  try {
    const card = await request.result;
    signal.throwIfAborted();
    return card;
  } finally {
    signal.removeEventListener("abort", release);
    release();
  }
}
