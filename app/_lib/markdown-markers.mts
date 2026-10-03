// Internal syntax markers must not be accepted from user-authored Markdown.
// Restore escaped literals only after the extension transform has finished.
const literalStart = "\uE002MCLITERAL_START\uE003";
const literalEscape = "\uE002MCLITERAL_ESCAPE\uE003";

export function escapeMarkdownMarkerLiterals(value: string): string {
  return value.replaceAll("\uE002", literalEscape).replaceAll("\uE000", literalStart);
}

export function restoreMarkdownMarkerLiterals(value: string): string {
  return value.replaceAll(literalStart, "\uE000").replaceAll(literalEscape, "\uE002");
}

export function decodeMarkdownMarker(value: string): string | undefined {
  try { return decodeURIComponent(value); }
  catch { return undefined; }
}
