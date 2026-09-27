export type AntiAbusePolicy = {
  burstLimit: number;
  burstSeconds: number;
  hourLimit: number;
  dayLimit: number;
  objectLimit: number;
  objectMinutes: number;
  pendingLimit: number;
};

export type AntiAbuseSettings = {
  enabled: boolean;
  emergencyMode: boolean;
  logThreshold: number;
  moderationThreshold: number;
  challengeThreshold: number;
  tempBlockThreshold: number;
  denyThreshold: number;
  newAccountDays: number;
  trustedAccountDays: number;
  trustedMinimumLevel: number;
  duplicateWindowHours: number;
  similarityThreshold: number;
  temporaryBlockMinutes: number;
  policies: Record<string, AntiAbusePolicy>;
};

export type AntiAbuseSettingsError =
  | "integerRequired"
  | "globalBounds"
  | "thresholdOrder"
  | "accountOrder"
  | "policyBounds";

export function validateAntiAbuseSettings(settings: AntiAbuseSettings): AntiAbuseSettingsError | undefined {
  const globalValues = [
    settings.logThreshold, settings.moderationThreshold, settings.challengeThreshold,
    settings.tempBlockThreshold, settings.denyThreshold, settings.newAccountDays,
    settings.trustedAccountDays, settings.trustedMinimumLevel, settings.duplicateWindowHours,
    settings.similarityThreshold, settings.temporaryBlockMinutes,
  ];
  const policyValues = Object.values(settings.policies).flatMap((policy) => [
    policy.burstLimit, policy.burstSeconds, policy.hourLimit, policy.dayLimit,
    policy.objectLimit, policy.objectMinutes, policy.pendingLimit,
  ]);
  if (![...globalValues, ...policyValues].every(Number.isInteger)) return "integerRequired";
  if (!between(settings.logThreshold, 1, 100) || !between(settings.moderationThreshold, 1, 200) ||
    !between(settings.challengeThreshold, 1, 300) || !between(settings.tempBlockThreshold, 1, 500) ||
    !between(settings.denyThreshold, 1, 1000) || !between(settings.newAccountDays, 1, 90) ||
    !between(settings.trustedAccountDays, 1, 3650) || !between(settings.trustedMinimumLevel, 0, 1000) ||
    !between(settings.duplicateWindowHours, 1, 720) || !between(settings.similarityThreshold, 700, 1000) ||
    !between(settings.temporaryBlockMinutes, 1, 43200)) return "globalBounds";
  if (!(settings.logThreshold <= settings.moderationThreshold &&
    settings.moderationThreshold <= settings.challengeThreshold &&
    settings.challengeThreshold <= settings.tempBlockThreshold &&
    settings.tempBlockThreshold <= settings.denyThreshold)) return "thresholdOrder";
  if (settings.trustedAccountDays < settings.newAccountDays) return "accountOrder";
  for (const policy of Object.values(settings.policies)) {
    if (!between(policy.burstLimit, 1, 10000) || !between(policy.burstSeconds, 1, 3600) ||
      !between(policy.hourLimit, 1, 100000) || !between(policy.dayLimit, 1, 1000000) ||
      !between(policy.objectLimit, 1, 10000) || !between(policy.objectMinutes, 1, 10080) ||
      !between(policy.pendingLimit, 0, 10000)) return "policyBounds";
  }
  return undefined;
}

function between(value: number, minimum: number, maximum: number) {
  return value >= minimum && value <= maximum;
}
