export type NATSTaskConfig = {
  code: string;
  enabled: boolean;
  subject: string;
  queueGroup: string;
  maxConcurrent: number;
  timeoutSeconds: number;
};

export type NATSJetStreamConfig = {
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

export type NATSUpdatePayload = Pick<
  NATSConfig,
  "enabled" | "url" | "username" | "subjectPrefix" | "tasks" | "outboxEnabled" | "realtime" | "jetStream"
> & {
  password: string;
  clearPassword: boolean;
  token: string;
  clearToken: boolean;
};

export function buildNATSUpdatePayload(draft: NATSConfig): NATSUpdatePayload {
  return {
    enabled: draft.enabled,
    url: draft.url,
    username: draft.username,
    password: draft.password ?? "",
    clearPassword: draft.clearPassword ?? false,
    token: draft.token ?? "",
    clearToken: draft.clearToken ?? false,
    subjectPrefix: draft.subjectPrefix,
    tasks: draft.tasks,
    outboxEnabled: draft.outboxEnabled,
    realtime: draft.realtime,
    jetStream: draft.jetStream,
  };
}
