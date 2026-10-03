export const reviewPreviewTypes = ["mod", "modpack", "plugin", "map", "resource_pack", "shader_pack", "datapack", "addon", "project_changelog"] as const;
export type ReviewPreviewType = typeof reviewPreviewTypes[number];
export type RevisionPreview = { id: string; entityType: ReviewPreviewType; projectId: string; status: "pending"; snapshot: Record<string, unknown> };

type Check = (value: unknown) => boolean;
type Shape = Record<string, Check>;
const text: Check = (value) => typeof value === "string";
const boolean: Check = (value) => typeof value === "boolean";
const number: Check = (value) => typeof value === "number" && Number.isFinite(value);
const optional = (check: Check): Check => (value) => value === undefined || value === null || check(value);
// Go nil slices encode as null; this is a valid empty collection in this contract.
const list = (check: Check): Check => (value) => value === null || (Array.isArray(value) && value.length <= 10_000 && value.every(check));
const texts = list(text);
function shape(fields: Shape): Check {
  return (value) => isObject(value) && Object.keys(value).every((key) => Object.hasOwn(fields, key)) && Object.entries(fields).every(([key, check]) => check(value[key]));
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const optionalText = optional(text);
const member = shape({ creatorId: text, kind: text, name: text, avatarUrl: text, roleId: optionalText, role: text, title: optionalText });
const author = shape({ creatorId: optionalText, kind: optionalText, name: optionalText, avatarUrl: optionalText, roleId: optionalText, role: optionalText, members: optional(list(member)) });
const link = shape({ type: text, url: text, note: text });
const gallery = shape({ publicId: optionalText, fileId: text, name: optionalText, contentType: optionalText, sizeBytes: optional(number), url: optionalText });
const compatibility = shape({ loader: text, versions: texts });
const modLocalization = shape({ locale: text, name: text, summary: text, contentMarkdown: text, provenance: optionalText, sourceLocale: optionalText, editable: optional(boolean), reviewStatus: optionalText });
const common: Shape = { siteId: text, defaultLocale: text, abbreviation: text, officialStatus: text, sourceStatus: text, license: text, curseforgeProjectId: text, modrinthProjectId: text, iconUrl: text, searchKeywords: texts, submissionMethod: text, authors: list(author), links: list(link), galleryImages: list(gallery) };
const catalog: Shape = { ...common, primaryName: text, secondaryName: text, summary: text, environment: text, primaryCategory: text, compatibilities: list(compatibility), tags: texts, bodyMarkdown: text };
const relationship = shape({ type: text, relatedModId: optionalText, relatedModSiteId: optionalText, relatedModName: text, relatedModIdentifier: optionalText });
const mod = shape({ ...catalog, githubProjectPath: text, localizations: list(modLocalization), modIds: list(shape({ identifier: text, primary: boolean, minecraftVersionMin: optionalText, minecraftVersionMax: optionalText, minecraftVersions: texts })), relationshipGroups: list(shape({ label: text, loader: text, minecraftVersions: texts, modVersion: text, direction: optionalText, relationships: list(relationship) })) });
const packMod = shape({ modPublicId: optionalText, modSiteId: optionalText, modName: text, iconUrl: optionalText, provider: text, providerProjectId: optionalText, providerVersionId: optionalText, identifier: optionalText, fileName: optionalText, clientRequired: boolean, serverRequired: boolean, resolved: boolean });
const modpack = shape({ ...catalog, packType: text, packagingMethod: text, mods: list(packMod), importSelection: optional(shape({ provider: text, projectId: text, versionId: text, versionName: text, fileId: text, fileName: text, releaseType: text, publishedAt: text })) });
const simple = shape({ ...common, projectType: text, localizations: list(shape({ locale: text, name: text, summary: text, bodyMarkdown: text })), minecraftVersions: texts, loaders: texts, categories: texts, features: texts, resolution: text, performance: text, mapSize: text, parentProjects: list(shape({ publicId: optionalText, type: text, identifier: optionalText, name: optionalText, siteId: optionalText, iconUrl: optionalText, unresolved: optional(boolean) })) });
const changelog = shape({ eventAt: (value) => typeof value === "string" && Number.isFinite(Date.parse(value)), minecraftVersions: texts, projectVersion: text, defaultLocale: text, categoryId: optionalText, newCategory: optional(shape({ defaultLocale: text, localizations: list(shape({ locale: text, name: text })) })), localizations: list(shape({ locale: text, bodyMarkdown: text })), reason: optionalText });

// This validates the server's typed allowlist before displaying anything. It
// deliberately renders text only; URLs, Markdown and HTML remain inert strings.
export function parseRevisionPreview(value: unknown, revisionId: string): RevisionPreview {
  const invalid = () => { throw new Error("Invalid review preview response"); };
  if (!isObject(value) || Object.keys(value).some((key) => !["id", "entityType", "projectId", "status", "snapshot"].includes(key))) return invalid();
  if (value.id !== revisionId || !/^[a-z0-9]{9}$/.test(revisionId) || typeof value.projectId !== "string" || !/^[a-z0-9]{9}$/.test(value.projectId) || value.status !== "pending") return invalid();
  if (typeof value.entityType !== "string" || !reviewPreviewTypes.some((type) => type === value.entityType) || !isObject(value.snapshot)) return invalid();
  const entityType = value.entityType as ReviewPreviewType;
  const check = entityType === "mod" ? mod : entityType === "modpack" ? modpack : entityType === "project_changelog" ? changelog : simple;
  if (!check(value.snapshot) || (check === simple && value.snapshot.projectType !== entityType)) return invalid();
  return { id: revisionId, entityType, projectId: value.projectId, status: "pending", snapshot: value.snapshot };
}
