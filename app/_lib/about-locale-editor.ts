type AboutDraftIdentity = {
  locale: string;
};

export function isCurrentAboutDraftResponse(input: {
  aborted: boolean;
  currentGeneration: number;
  requestGeneration: number;
  requestedLocale: string;
  responseLocale: string;
  selectedLocale: string;
}) {
  return !input.aborted
    && input.requestGeneration === input.currentGeneration
    && input.requestedLocale === input.selectedLocale
    && input.responseLocale === input.requestedLocale;
}

export function canSubmitAboutDraft(input: {
  draft?: AboutDraftIdentity;
  loadError: string;
  loading: boolean;
  saving: boolean;
  selectedLocale: string;
}) {
  return !input.loading
    && !input.saving
    && !input.loadError
    && input.draft?.locale === input.selectedLocale;
}
