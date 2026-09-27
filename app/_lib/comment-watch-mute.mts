export type CommentWatchMutePresentation =
  | { selection: "none" }
  | { selection: "forever" }
  | { selection: "until"; expiresAt: number }
  | { selection: "invalid" };

export function resolveCommentWatchMute(
  mutedForever: boolean,
  mutedUntil: string | undefined,
  now = Date.now(),
): CommentWatchMutePresentation {
  if (mutedForever) return { selection: "forever" };
  if (!mutedUntil) return { selection: "none" };
  const expiresAt = Date.parse(mutedUntil);
  if (!Number.isFinite(expiresAt)) return { selection: "invalid" };
  if (expiresAt <= now) return { selection: "none" };
  return { selection: "until", expiresAt };
}
