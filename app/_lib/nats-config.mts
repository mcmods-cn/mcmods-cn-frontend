export type NATSTaskConfig = {
  code: string;
  enabled: boolean;
  subject: string;
  queueGroup: string;
  maxConcurrent: number;
  timeoutSeconds: number;
};

export type NATSJetStreamConfig = {
  newStreamMaxBytes?: number;
  enabled: boolean;
  stream: string;
  maxDeliver: number;
  ackWaitSeconds: number;
  publishTimeoutSeconds: number;
};

export type NATSStatus = {
  enabled: boolean;
  connected: boolean;
  url: string;
  subjectPrefix: string;
  tasks: NATSTaskConfig[];
  lastError?: string;
  jetStream: boolean;
};

export type NATSConfig = {
  revision?: string;
  enabled: boolean;
  url: string;
  username: string;
  password?: string;
  hasPassword: boolean;
  clearPassword?: boolean;
  token?: string;
  hasToken: boolean;
  clearToken?: boolean;
  subjectPrefix: string;
  tasks: NATSTaskConfig[];
  outboxEnabled: boolean;
  realtime: boolean;
  jetStream: NATSJetStreamConfig;
  status: NATSStatus;
};

export function hasNATSSettings(value: NATSConfig): boolean {
  return Boolean(value?.status && value.jetStream && Array.isArray(value.tasks) && typeof value.url === "string" &&
    typeof value.username === "string" && typeof value.hasPassword === "boolean" && typeof value.hasToken === "boolean");
}

export type NATSUpdatePayload = Pick<
  NATSConfig,
  "revision" | "enabled" | "url" | "username" | "subjectPrefix" | "tasks" | "outboxEnabled" | "realtime" | "jetStream"
> & {
  password: string;
  clearPassword: boolean;
  token: string;
  clearToken: boolean;
};

export const bytesPerMiB = 1024 * 1024;

export function streamCapacityBytes(mib: string): number | undefined {
  const bytes = Number(mib) * bytesPerMiB;
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined;
}

export function buildNATSUpdatePayload(draft: NATSConfig, newStreamMaxBytes?: number): NATSUpdatePayload {
  const jetStream = { ...draft.jetStream };
  // An untouched limit stays in the database at its native int64 precision.
  // Backends without this optional field keep their original request shape.
  if (newStreamMaxBytes === undefined) delete jetStream.newStreamMaxBytes;
  else jetStream.newStreamMaxBytes = newStreamMaxBytes;
  return {
    revision: draft.revision,
    enabled: draft.enabled,
    url: draft.url,
    username: draft.username,
    password: draft.password ?? "",
    clearPassword: draft.clearPassword ?? false,
    token: draft.token ?? "",
    clearToken: draft.clearToken ?? false,
    subjectPrefix: draft.subjectPrefix,
    tasks: draft.tasks,
    // Older servers accept this field. Durable delivery is always required.
    outboxEnabled: true,
    realtime: draft.realtime,
    jetStream,
  };
}
