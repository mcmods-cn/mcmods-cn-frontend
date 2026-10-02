export type ProjectDetailFailure = {
  status: "not_found" | "error";
  message: string;
};

export function classifyProjectDetailFailure(error: unknown): ProjectDetailFailure {
  const status = error && typeof error === "object" && "status" in error
    ? Number(error.status)
    : undefined;
  return {
    status: status === 404 ? "not_found" : "error",
    message: error instanceof Error ? error.message : "",
  };
}
