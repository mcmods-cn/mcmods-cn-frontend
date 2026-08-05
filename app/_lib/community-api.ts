export type CreatorKind = "author" | "team";

export type CreatorSummary = {
  publicId: string;
  kind: CreatorKind;
  name: string;
  avatarUrl: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  workCount: number;
  claimed: boolean;
};

export type CreatorLink = {
  type: string;
  url: string;
  label: string;
};

export type CreatorRole = {
  id: string;
  code: string;
  name: string;
  description: string;
  translations: Record<string, unknown>;
  custom: boolean;
};

export type CreatorMember = {
  creatorId: string;
  name: string;
  avatarUrl: string;
  role: Pick<CreatorRole, "id" | "code" | "name">;
  title: string;
};

export type CreatorTeamMembership = {
  team: CreatorSummary;
  role: Pick<CreatorRole, "id" | "code" | "name">;
  title: string;
};

export type CreatorLocalization = {
  locale: string;
  contentMarkdown: string;
};

type CreatorWork = {
  uniqueId: string;
  siteId: string;
  primaryName: string;
  secondaryName: string;
  summary: string;
  iconUrl: string;
};

export type CreatorDetail = {
  creator: CreatorSummary;
  descriptionMarkdown: string;
  defaultLocale?: string;
  localizations?: CreatorLocalization[];
  links: CreatorLink[];
  collaborators: CreatorSummary[];
  members: CreatorMember[];
  teams: CreatorTeamMembership[];
  works: CreatorWork[];
  claimedUser: {
    id: string;
    publicId: string;
    username: string;
    avatarUrl: string;
  } | null;
  canEdit: boolean;
  canClaim: boolean;
  publishedRevisionId?: string;
};

export type CreatorSnapshot = {
  kind: CreatorKind;
  name: string;
  descriptionMarkdown: string;
  defaultLocale: string;
  localizations: CreatorLocalization[];
  avatarUrl: string;
  avatarFileId?: string;
  links: CreatorLink[];
  members: Array<{ creatorId: string; roleId: string; title: string }>;
};

export type CreatorImportResult = {
  kind: CreatorKind;
  name: string;
  avatarUrl: string;
  avatarFileId?: string;
  links: CreatorLink[];
  members: Array<{
    creatorId: string;
    kind: "author";
    name: string;
    avatarUrl: string;
    roleId: string;
    role: string;
    title: string;
  }>;
  createdMembers: number;
};

export type CreatorClaimAttachment = {
  id: string;
  name: string;
  sizeBytes: number;
};

export type CreatorClaim = {
  id: string;
  creatorId: string;
  kind: CreatorKind;
  name: string;
  userId: string;
  username: string;
  proofMarkdown: string;
  attachments: CreatorClaimAttachment[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type Currency = {
  publicId: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  translations: Record<string, unknown>;
  transferTaxBps: number;
  status: "active" | "disabled";
  displayOrder: number;
};

export type ShopItem = {
  publicId: string;
  code: string;
  itemType: string;
  name: string;
  description: string;
  icon: string;
  translations: Record<string, unknown>;
  priceCurrency: string;
  priceAmount: number;
  purchasePermission: string;
  usePermission: string;
  config: Record<string, unknown>;
  status: "active" | "disabled";
  inventoryQuantity?: number;
  canPurchase?: boolean;
  canUse?: boolean;
};

export type EconomyOverview = {
  balances: Array<Pick<Currency, "publicId" | "code" | "name" | "icon"> & { balance: number }>;
  experience: number;
  level: number;
  timezone: string;
  checkin: {
    enabled: boolean;
    currency: string;
    amount: number;
    checkedInToday: boolean;
    eligibleAt?: string;
  };
  inventory: Array<{
    publicId: string;
    code: string;
    itemType: string;
    name: string;
    icon: string;
    quantity: number;
  }>;
};

export type EconomyConfig = {
  checkin: {
    enabled: boolean;
    currency: string;
    amount: number;
    minimumHours: number;
  };
  downloadRewards: Array<{
    objectType: string;
    currency: string;
    downloadsPerReward: number;
    amount: number;
  }>;
};

export type LevelConfig = {
  roleTrackCode: string;
  levelThresholds: number[];
};

export type TaskDefinition = {
  publicId: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  translations: Record<string, unknown>;
  refreshPeriod: "never" | "daily" | "weekly" | "monthly";
  condition: {
    action?: string;
    objectType?: string;
    metric?: "count" | "markdown_bytes";
    target?: number;
    objectPublicId?: string;
  };
  rewards: {
    experience?: number;
    currencies?: Record<string, number>;
  };
  status: "active" | "disabled";
  periodKey?: string;
  progress?: number;
  completedAt?: string;
  rewardedAt?: string;
};

export type ActivityEvent = {
  id: string;
  userId?: string;
  username?: string;
  action: string;
  actionName: string;
  objectType: string;
  objectTypeName: string;
  objectPublicId: string;
  markdownAddedBytes: number;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

export function creatorHref(creator: Pick<CreatorSummary, "kind" | "publicId">) {
  return creator.kind === "team" ? `/teams/${creator.publicId}` : `/authors/${creator.publicId}`;
}

export function translatedRecord(
  translations: Record<string, unknown> | undefined,
  locale: string,
  field: "name" | "description",
  fallback: string,
) {
  const localized = translations?.[locale];
  if (localized && typeof localized === "object") {
    const value = (localized as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}
