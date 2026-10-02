export type AdminProjectDetailState<T> =
  | { status: "idle" }
  | { status: "loading"; projectID: string; days: number }
  | { status: "ready"; projectID: string; days: number; detail: T }
  | { status: "error"; projectID: string; days: number };

export type AdminProjectDetailRequest = Extract<AdminProjectDetailState<never>, { status: "loading" }>;

function normalizedProjectID(value: string) {
  return value.trim().toLowerCase();
}

export function beginAdminProjectDetailLoad(projectID: string, days: number): AdminProjectDetailRequest {
  return { status: "loading", projectID: normalizedProjectID(projectID), days };
}

export function completeAdminProjectDetailLoad<T>(
  request: AdminProjectDetailRequest,
  responseProjectID: string,
  responseDays: number,
  detail: T,
): AdminProjectDetailState<T> {
  if (normalizedProjectID(responseProjectID) !== request.projectID || responseDays !== request.days) {
    return failAdminProjectDetailLoad(request);
  }
  return { ...request, status: "ready", detail };
}

export function failAdminProjectDetailLoad<T>(request: AdminProjectDetailRequest): AdminProjectDetailState<T> {
  return { status: "error", projectID: request.projectID, days: request.days };
}

export function adminProjectDetailStateMatches<T>(
  state: AdminProjectDetailState<T>,
  selectedProjectID: string,
  days: number,
) {
  return state.status !== "idle"
    && state.projectID === normalizedProjectID(selectedProjectID)
    && state.days === days;
}

export function visibleAdminProjectDetail<T>(
  state: AdminProjectDetailState<T>,
  selectedProjectID: string,
  days: number,
) {
  return state.status === "ready" && adminProjectDetailStateMatches(state, selectedProjectID, days)
    ? state.detail
    : undefined;
}
