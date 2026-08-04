const fallbackTimezones = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Pacific/Auckland",
  "Pacific/Honolulu",
] as const;

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

export function supportedTimezones(additional: readonly string[] = []) {
  const supportedValuesOf = (Intl as IntlWithSupportedValues).supportedValuesOf;
  let discovered: readonly string[] = fallbackTimezones;
  if (supportedValuesOf) {
    try {
      discovered = supportedValuesOf.call(Intl, "timeZone");
    } catch {
      discovered = fallbackTimezones;
    }
  }
  return [...new Set(["UTC", "Asia/Shanghai", ...discovered, ...additional].filter(Boolean))].sort();
}

export function timezoneOffsetLabel(timezone: string, locale: string, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(date).find((item) => item.type === "timeZoneName")?.value;
    return (part || "UTC").replace(/^GMT/, "UTC");
  } catch {
    return "UTC";
  }
}

export function timezoneDisplayName(timezone: string, locale: string, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: "longGeneric",
    }).formatToParts(date).find((item) => item.type === "timeZoneName")?.value;
    if (part && part !== timezone) return part;
  } catch {
    // Invalid persisted values are still rendered as plain text until corrected.
  }
  return humanizeTimezone(timezone);
}

export function timezoneLabel(timezone: string, locale: string, date = new Date()) {
  const name = timezoneDisplayName(timezone, locale, date);
  return `${name} (${timezoneOffsetLabel(timezone, locale, date)})`;
}

export function timezoneSearchText(timezone: string, locale: string, date = new Date()) {
  return `${timezone} ${humanizeTimezone(timezone)} ${timezoneDisplayName(timezone, locale, date)} ${timezoneOffsetLabel(timezone, locale, date)}`.toLocaleLowerCase();
}

function humanizeTimezone(timezone: string) {
  return timezone.replaceAll("_", " ").replaceAll("/", " / ");
}
