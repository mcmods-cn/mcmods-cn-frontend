export type MarkdownDraftSaveCoordinator = {
  revision: number;
  nextSequence: number;
  latestIssuedSequence: number;
};

export type MarkdownDraftSaveRequest = {
  content: string;
  baseRevision: number;
  saveSessionId: string;
  clientSequence: number;
};

export type MarkdownDraftSaveResult = {
  clientSequence: number;
  revision: number;
};

export type MarkdownDraftConflict = MarkdownDraftSaveResult & {
  content: string;
  updatedAt: string | null;
};

export function createMarkdownDraftSaveCoordinator(revision: number): MarkdownDraftSaveCoordinator {
  return { revision: validRevision(revision) ? revision : 0, nextSequence: 1, latestIssuedSequence: 0 };
}

export function issueMarkdownDraftSave(
  coordinator: MarkdownDraftSaveCoordinator,
  saveSessionId: string,
  content: string,
): { coordinator: MarkdownDraftSaveCoordinator; request: MarkdownDraftSaveRequest } {
  const clientSequence = coordinator.nextSequence;
  return {
    coordinator: { ...coordinator, nextSequence: clientSequence + 1, latestIssuedSequence: clientSequence },
    request: { content, baseRevision: coordinator.revision, saveSessionId, clientSequence },
  };
}

export function applyMarkdownDraftSaveResult(
  coordinator: MarkdownDraftSaveCoordinator,
  result: MarkdownDraftSaveResult,
): { coordinator: MarkdownDraftSaveCoordinator; isLatest: boolean } {
  const revision = validRevision(result.revision) ? Math.max(coordinator.revision, result.revision) : coordinator.revision;
  return {
    coordinator: { ...coordinator, revision },
    isLatest: result.clientSequence === coordinator.latestIssuedSequence,
  };
}

export function rebaseMarkdownDraftSaveCoordinator(
  coordinator: MarkdownDraftSaveCoordinator,
  revision: number,
): MarkdownDraftSaveCoordinator {
  return validRevision(revision) ? { ...coordinator, revision } : coordinator;
}

export function parseMarkdownDraftConflict(value: unknown): MarkdownDraftConflict | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.content !== "string" || !validRevision(candidate.revision) || !positiveInteger(candidate.clientSequence)) return null;
  if (candidate.updatedAt !== null && typeof candidate.updatedAt !== "string") return null;
  return {
    content: candidate.content,
    revision: candidate.revision,
    clientSequence: candidate.clientSequence,
    updatedAt: candidate.updatedAt ?? null,
  };
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
