let backendUnavailable = false;

export function reportBackendAvailability(available: boolean) {
  const nextUnavailable = !available;
  if (backendUnavailable === nextUnavailable) return;
  backendUnavailable = nextUnavailable;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mcmods-backend-status", { detail: { available } }));
}

export function isBackendUnavailable() {
  return backendUnavailable;
}
