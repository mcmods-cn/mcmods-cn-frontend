import { apiRequest } from "./api";

export type OnlineStatus = "online" | "offline" | "hidden";

export type PublicUserProfile = {
  id: string;
  username: string;
  status: string;
  createdAt: string;
  followers: number;
  following: number;
  isOwn: boolean;
  isFollowing: boolean;
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

const userCardCache = new Map<string, { expiresAt: number; value: PublicUserCard }>();
const maximumUserCardCacheEntries = 200;

export async function loadPublicUserCard(userId: string, token?: string) {
  const key = userId.toLowerCase();
  const cached = userCardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await apiRequest<PublicUserCard>(`/api/v1/users/${encodeURIComponent(userId)}/card`, {}, token);
  userCardCache.set(key, { expiresAt: Date.now() + 60_000, value });
  while (userCardCache.size > maximumUserCardCacheEntries) {
    const oldest = userCardCache.keys().next().value;
    if (!oldest) break;
    userCardCache.delete(oldest);
  }
  return value;
}

export function invalidatePublicUserCard(userId: string) {
  userCardCache.delete(userId.toLowerCase());
}
