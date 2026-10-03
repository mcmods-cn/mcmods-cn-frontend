export type AIDeliveryFailure = {
  taskUID: string;
  deadLetterId: string | null;
  stage: "publish";
  retryable: boolean;
};

// A failed consumer may already have incurred provider charges. Only the
// server's typed pre-provider publisher-dead declaration enables this action.
export function resolveAIDeliveryFailure(row: unknown): AIDeliveryFailure | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const value = record.delivery_failure;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const failure = value as Record<string, unknown>;
  if (failure.stage !== "publish" || typeof failure.retryable !== "boolean"
    || (failure.deadLetterId !== null && (typeof failure.deadLetterId !== "string" || !/^[1-9]\d*$/.test(failure.deadLetterId)))) return null;
  const taskUID = typeof record.task_uid === "string" ? record.task_uid : "";
  return {
    taskUID,
    deadLetterId: failure.deadLetterId as string | null,
    stage: "publish",
    retryable: record.status === "queued" && taskUID.length > 0 && failure.retryable && failure.deadLetterId !== null,
  };
}
