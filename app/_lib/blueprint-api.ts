type BlueprintUploader = {
  id: string;
  username: string;
  avatarUrl?: string;
};

export type BlueprintRequiredMod = {
  projectCode: string;
  siteId: string;
  primaryName: string;
  secondaryName: string;
  modId: string;
  iconUrl?: string;
  namespaces: string[];
};

export type BlueprintSummary = {
  id: string;
  title: string;
  description: string;
  sourceFormat: string;
  status: string;
  size: [number, number, number];
  blockCount: number;
  paletteCount: number;
  createdAt: string;
  updatedAt: string;
  coverUrl?: string;
  coverGenerated?: boolean;
  uploader: BlueprintUploader;
  requiredMods: BlueprintRequiredMod[];
};

type BlueprintVariant = {
  id: string;
  format: string;
  original: boolean;
  recommended: boolean;
  status: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export type BlueprintMaterial = {
  state: string;
  blockId: string;
  properties: Record<string, string>;
  count: number;
  name: string;
  names: Record<string, string>;
  iconPath?: string;
  previewPath?: string;
  sourceRevisionId?: string;
  sourceModSiteId?: string;
  sourceVersionPublicId?: string;
  detailUrl?: string;
  publicId?: string;
};

type BlueprintAssetRevision = { id: string; siteId: string; paths: string[] };

export type BlueprintDetailRecord = BlueprintSummary & {
  entityCount: number;
  dataVersion: number;
  lastError: string;
  canEdit: boolean;
  renderAvailable: boolean;
  variants: BlueprintVariant[];
  materials: BlueprintMaterial[];
  assetRevisions: BlueprintAssetRevision[];
};

export type BlueprintListResponse = {
  items: BlueprintSummary[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextCursor: string;
};

// Translated detail reads may return the same ordered asset index. Keeping it
// lets the viewer retain the active WebGL scene and its camera.
export function retainBlueprintAssetIndex(previous: BlueprintDetailRecord | null | undefined, next: BlueprintDetailRecord) {
  if (!previous || previous.id !== next.id) return next;
  const before = previous.assetRevisions;
  const after = next.assetRevisions;
  if (!before || !after || before.length !== after.length) return next;
  const equal = before.every((entry, i) => {
    const other = after[i];
    return entry.id === other.id && entry.siteId === other.siteId &&
      entry.paths.length === other.paths.length && entry.paths.every((path, j) => path === other.paths[j]);
  });
  return equal ? { ...next, assetRevisions: before } : next;
}
