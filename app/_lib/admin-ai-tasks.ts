import { apiRequest } from "./api";
import { waitForPolledJob } from "./job-polling.mts";

type AITaskStatus = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: AITranslationResult;
  error?: string;
};

type AITranslationResult = {
  items?: Array<{
    key: string;
    text?: string;
    name?: string;
    description?: string;
  }>;
};

export const aiTranslationTaskTypes = {
  permission: "permission_translation_completion",
  i18n: "i18n_translation_completion",
  notification: "notification_translation_completion",
} as const;

export function aiTaskTypeLabel(taskType: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const labels: Record<string, string> = {
    [aiTranslationTaskTypes.permission]: t("admin.ai.permissionTranslationTask"),
    [aiTranslationTaskTypes.i18n]: t("admin.ai.i18nTranslationTask"),
    [aiTranslationTaskTypes.notification]: t("admin.ai.notificationTranslationTask"),
  };
  return labels[taskType] ?? taskType;
}

export async function runAITranslationTask(token: string, taskType: string, payload: Record<string, unknown>, signal: AbortSignal) {
  const created = await apiRequest<{ id: string }>("/api/v1/admin/ai/tasks", {
    method: "POST", body: JSON.stringify({ taskType, payload }), signal,
  }, token);
  const deadline = AbortSignal.timeout(180_000);
  const polling = AbortSignal.any([signal, deadline]);
  const task = await waitForPolledJob(
    current => apiRequest<AITaskStatus>(`/api/v1/admin/ai/tasks/${encodeURIComponent(created.id)}`, { signal: current }, token),
    new Set(["completed", "failed"]), () => {}, polling, undefined, 800,
  );
  if (task.status === "failed") throw new Error(task.error || "AI translation task failed");
  return task.result ?? { items: [] };
}
