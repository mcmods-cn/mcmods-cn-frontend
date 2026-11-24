export const maxCommentCharacters = 10_000;

// One Unicode code point takes at most two UTF-16 units in a textarea.
// Keep enough room to edit a full valid comment without retaining a huge paste.
export const maxCommentDraftUnits = 2 * maxCommentCharacters;

// Go strings.TrimSpace uses Unicode White_Space. Its set differs from JS trim.
const commentWhitespace = /\p{White_Space}/u;

export function trimCommentBody(value: string) {
  let start = 0;
  let end = value.length;
  while (start < end && commentWhitespace.test(value[start])) start++;
  while (end > start && commentWhitespace.test(value[end - 1])) end--;
  return value.slice(start, end);
}

export function exceedsCommentTextLimit(value: string) {
  if (value.length <= maxCommentCharacters) return false;
  const body = trimCommentBody(value);
  if (body.length <= maxCommentCharacters) return false;
  if (body.length > maxCommentDraftUnits) return true;
  return Array.from(body).length > maxCommentCharacters;
}
