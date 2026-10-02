const datetimeLocalPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function datetimeLocalToRFC3339(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  const match = datetimeLocalPattern.exec(value);
  if (!match) throw new RangeError("invalid datetime-local value");

  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth) - 1;
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const local = new Date(year, month, day, hour, minute, 0, 0);
  if (year < 1000
    || local.getFullYear() !== year
    || local.getMonth() !== month
    || local.getDate() !== day
    || local.getHours() !== hour
    || local.getMinutes() !== minute) {
    throw new RangeError("invalid datetime-local value");
  }
  return local.toISOString();
}
