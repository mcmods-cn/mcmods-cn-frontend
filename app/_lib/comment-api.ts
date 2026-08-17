import { apiRequest } from "./api";
import type { OnlineStatus } from "./user-api";

export type CommentTargetType = "mod" | "modpack" | "plugin" | "map" | "resource_pack" | "shader_pack" | "datapack" | "addon" | "mod_resource" | "blueprint" | "skin" | "creator" | "player_profile" | "tag" | "recipe_type" | "community_post" | "ban_record";

export type CommentTarget = {
  type: CommentTargetType;
  key: string;
  title: string;
  url: string;
};

export type CommentWatchState = {
  id?: string;
  active: boolean;
  mutedUntil?: string;
  mutedForever: boolean;
  unreadCount: number;
  watchedReplies: number;
};

export type CommentItem = {
  id: string;
  floorNumber: number | null;
  parentId?: string;
  rootId?: string;
  depth: number;
  body: string;
  deleted: boolean;
  author: {
    id: string;
    username: string;
    avatarUrl: string;
	    onlineStatus: OnlineStatus;
    projectRole?: "owner" | "editor";
  };
  parent?: { id: string; authorName: string; bodySummary: string; deleted: boolean };
  reactions: Record<string, number>;
  userReactions: string[];
  childCount: number;
  descendantCount: number;
  heatScore: number;
  hasMoreReplies: boolean;
  currentUserWatch?: CommentWatchState;
  pinned: boolean;
  pinnedAt?: string;
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  canReply: boolean;
  canReact: boolean;
  canReport: boolean;
  canWatch: boolean;
  createdAt: string;
  updatedAt: string;
  logAttachments: Array<{ fileId: string; fileName: string; publicCode?: string; status: string; url?: string }>;
};

export type CommentPage = {
  items: CommentItem[];
  total: number;
  target: CommentTarget;
  nextCursor: string;
  capabilities: { canCreate: boolean };
};

export type CommentWatchListItem = {
  id: string;
  comment: CommentItem;
  target: CommentTarget;
  mutedUntil?: string;
  mutedForever: boolean;
  unreadCount: number;
  watchedReplies: number;
  createdAt: string;
  lastActivityAt: string;
};

export function targetCommentsPath(targetType: CommentTargetType, targetKey: string) {
  return `/api/v1/comment-targets/${encodeURIComponent(targetType)}/${encodeURIComponent(targetKey)}/comments`;
}

export function loadComments(
  targetType: CommentTargetType,
  targetKey: string,
  options: { sort?: string; cursor?: string; limit?: number },
  token?: string,
) {
  const query = new URLSearchParams();
  query.set("sort", options.sort || "latest");
  query.set("limit", String(options.limit || 20));
  if (options.cursor) query.set("cursor", options.cursor);
  return apiRequest<CommentPage>(`${targetCommentsPath(targetType, targetKey)}?${query}`, {}, token);
}

export function loadCommentFloor(targetType: CommentTargetType, targetKey: string, floor: number, token?: string) {
  return apiRequest<{ comment: CommentItem; target: CommentTarget }>(
    `${targetCommentsPath(targetType, targetKey)}/floors/${floor}`,
    {},
    token,
  );
}

export function createComment(
  targetType: CommentTargetType,
  targetKey: string,
  body: string,
  parentId: string | undefined,
  token: string,
  antiAbuse: { idempotencyKey: string; formToken?: string; honeypot?: string; challengeProof?: string },
  attachmentFileIds: string[] = [],
) {
  return apiRequest<CommentItem | { watchOnly: true; watch: CommentWatchState } | { id: string; status: "pending"; moderation: true }>(
    targetCommentsPath(targetType, targetKey),
    {
      method: "POST",
      headers: {
        "Idempotency-Key": antiAbuse.idempotencyKey,
        ...(antiAbuse.formToken ? { "X-Anti-Abuse-Form": antiAbuse.formToken } : {}),
        ...(antiAbuse.honeypot ? { "X-Anti-Abuse-Trap": antiAbuse.honeypot } : {}),
        ...(antiAbuse.challengeProof ? { "X-Anti-Abuse-Challenge": antiAbuse.challengeProof } : {}),
      },
      body: JSON.stringify({ body, parentId, idempotencyKey: antiAbuse.idempotencyKey, attachmentFileIds }),
    },
    token,
  );
}

export function loadCommentReplies(commentId: string, cursor: string | undefined, token?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiRequest<{ items: CommentItem[]; nextCursor: string }>(
    `/api/v1/comments/${encodeURIComponent(commentId)}/replies${query}`,
    {},
    token,
  );
}

export function loadCommentThread(commentId: string, token?: string) {
  return apiRequest<{ items: CommentItem[]; focusId: string; target: CommentTarget }>(
    `/api/v1/comments/${encodeURIComponent(commentId)}/thread`,
    {},
    token,
  );
}

export function setCommentReaction(commentId: string, reaction: string, active: boolean, token: string) {
  return apiRequest(
    `/api/v1/comments/${encodeURIComponent(commentId)}/reaction${active ? "" : `?reaction=${encodeURIComponent(reaction)}`}`,
    active
      ? { method: "PUT", body: JSON.stringify({ reaction }) }
      : { method: "DELETE" },
    token,
  );
}

export function setCommentWatch(commentId: string, active: boolean, token: string) {
  return apiRequest<CommentWatchState>(
    `/api/v1/comments/${encodeURIComponent(commentId)}/watch`,
    { method: active ? "PUT" : "DELETE" },
    token,
  );
}

export function deleteComment(commentId: string, token: string) {
  return apiRequest(`/api/v1/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" }, token);
}

export function updateComment(commentId: string, body: string, token: string) {
  return apiRequest<CommentItem>(
    `/api/v1/comments/${encodeURIComponent(commentId)}`,
    { method: "PATCH", body: JSON.stringify({ body }) },
    token,
  );
}

export function setCommentPinned(commentId: string, pinned: boolean, token: string) {
  return apiRequest<CommentItem>(
    `/api/v1/comments/${encodeURIComponent(commentId)}/pin`,
    { method: pinned ? "PUT" : "DELETE" },
    token,
  );
}

export function loadMyCommentWatches(
  token: string,
  options: { sort?: string; filter?: string; cursor?: string; limit?: number } = {},
) {
  const query = new URLSearchParams({
    sort: options.sort || "activity",
    filter: options.filter || "all",
    limit: String(options.limit || 30),
  });
  if (options.cursor) query.set("cursor", options.cursor);
  return apiRequest<{ items: CommentWatchListItem[]; nextCursor: string }>(
    `/api/v1/users/me/comment-watches?${query}`,
    {},
    token,
  );
}

export function markCommentWatchRead(watchId: string, token: string) {
  return apiRequest(`/api/v1/comment-watches/${encodeURIComponent(watchId)}/read`, { method: "POST" }, token);
}

export function updateCommentWatchMute(watchId: string, mute: "none" | "1h" | "24h" | "7d" | "forever", token: string) {
  return apiRequest(
    `/api/v1/comment-watches/${encodeURIComponent(watchId)}`,
    { method: "PATCH", body: JSON.stringify({ mute }) },
    token,
  );
}
