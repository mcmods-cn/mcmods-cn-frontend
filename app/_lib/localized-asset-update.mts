type LocalizedAssetVersion = {
  locale: string;
  editable?: boolean;
  fields: {
    name: string;
    summary: string;
    contentMarkdown: string;
  };
};

export function localizedAssetContentPayload(
  defaultLocale: string,
  versions: readonly LocalizedAssetVersion[],
) {
  return {
    defaultLocale,
    localizations: versions
      .filter((version) => version.editable !== false && version.fields.name.trim())
      .map((version) => ({
        locale: version.locale,
        name: version.fields.name.trim(),
        summary: version.fields.summary.trim(),
        contentMarkdown: version.fields.contentMarkdown,
      })),
  };
}
