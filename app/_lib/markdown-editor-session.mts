export type MarkdownEditorSession = {
  documentId: string;
  markdown: string;
  externalValue: string;
  dirty: boolean;
};

export function createMarkdownEditorSession(documentId: string, value: string): MarkdownEditorSession {
  return { documentId, markdown: value, externalValue: value, dirty: false };
}

export function editMarkdownEditorSession(session: MarkdownEditorSession, markdown: string): MarkdownEditorSession {
  if (markdown === session.markdown) return session;
  return { ...session, markdown, dirty: markdown !== session.externalValue };
}

export function synchronizeMarkdownEditorSession(
  session: MarkdownEditorSession,
  documentId: string,
  externalValue: string,
): MarkdownEditorSession {
  if (documentId !== session.documentId) return createMarkdownEditorSession(documentId, externalValue);

  // The parent has accepted the local edit. Clear dirty state without changing the textarea.
  if (externalValue === session.markdown) {
    if (!session.dirty && externalValue === session.externalValue) return session;
    return { ...session, externalValue, dirty: false };
  }

  // An unchanged parent value is commonly observed between a keystroke and its controlled echo.
  if (externalValue === session.externalValue) return session;

  // A competing same-document refresh must not destroy active input. Remember its new base so
  // a subsequent parent echo can still acknowledge the user's latest value.
  if (session.dirty) return { ...session, externalValue };

  return createMarkdownEditorSession(documentId, externalValue);
}
