import type { CreatorProfileSnapshot, CreatorSnapshot } from "./community-api";

export function creatorProfilePayload(snapshot: CreatorSnapshot): CreatorProfileSnapshot {
  return {
    kind: snapshot.kind,
    name: snapshot.name,
    descriptionMarkdown: snapshot.descriptionMarkdown,
    defaultLocale: snapshot.defaultLocale,
    localizations: snapshot.localizations,
    avatarUrl: snapshot.avatarUrl,
    avatarFileId: snapshot.avatarFileId,
    links: snapshot.links,
  };
}
