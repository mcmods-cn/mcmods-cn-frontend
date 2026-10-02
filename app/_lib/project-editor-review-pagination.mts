export function projectEditorReviewPagePath(status: string, limit: number, cursor = "") {
  const query = new URLSearchParams({ status, limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return `/api/v1/admin/project-editor-applications?${query.toString()}`;
}

export function mergeProjectEditorReviewPage<T extends { id: string }>(current: T[], incoming: T[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
