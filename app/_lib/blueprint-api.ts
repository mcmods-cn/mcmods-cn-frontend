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

type BlueprintSummary = {
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
  entityId?: string;
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
};
