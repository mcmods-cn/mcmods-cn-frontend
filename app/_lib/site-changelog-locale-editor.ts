export type ChangelogLocaleDraft = {
  bodyMarkdown: string;
  publish: boolean;
  title: string;
};

type ChangelogTranslation = {
  bodyMarkdown: string;
  status: string;
  title: string;
};

const emptyChangelogLocaleDraft = (): ChangelogLocaleDraft => ({
  bodyMarkdown: "",
  publish: false,
  title: "",
});

export function changelogDraftForLocale(
  translations: Record<string, ChangelogTranslation>,
  locale: string,
  drafts: Record<string, ChangelogLocaleDraft> = {},
) {
  if (drafts[locale]) return { ...drafts[locale] };
  const translation = translations[locale];
  if (!translation) return emptyChangelogLocaleDraft();
  return {
    bodyMarkdown: translation.bodyMarkdown,
    publish: translation.status === "published",
    title: translation.title,
  };
}

export function switchChangelogLocaleDraft(input: {
  currentDraft: ChangelogLocaleDraft;
  currentLocale: string;
  drafts: Record<string, ChangelogLocaleDraft>;
  nextLocale: string;
  translations: Record<string, ChangelogTranslation>;
}) {
  const drafts = {
    ...input.drafts,
    [input.currentLocale]: { ...input.currentDraft },
  };
  return {
    drafts,
    nextDraft: changelogDraftForLocale(input.translations, input.nextLocale, drafts),
  };
}
