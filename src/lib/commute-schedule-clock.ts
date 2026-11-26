export const WEEKDAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
};

export const WEEKDAY_SHORT_NAMES: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};

export interface LocalClockParts {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
  weekday: number;
  hour: number;
  minute: number;
  /** YYYY-MM-DD in local timezone */
  dateKey: string;
  /** YYYY-MM-DD of the Sunday that starts this week in local timezone */
  sundayWeekKey: string;
  timeZone: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function getResolvedTimeZone(explicitTz?: string): string {
  return (
    explicitTz ||
    process.env.TZ ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"
  );
}

export function getLocalClockParts(
  now: Date = new Date(),
  explicitTz?: string,
): LocalClockParts {
  const timeZone = getResolvedTimeZone(explicitTz);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const weekday = WEEKDAY_MAP[get("weekday")] ?? 0;
  const rawHour = Number(get("hour"));
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(get("minute"));
  const dateKey = `${year}-${pad2(month)}-${pad2(day)}`;

  // Compute Sunday of this week using UTC calendar math on the local Y/M/D
  const localMidnightUtc = new Date(Date.UTC(year, month - 1, day));
  localMidnightUtc.setUTCDate(localMidnightUtc.getUTCDate() - weekday);
  const sundayWeekKey = `${localMidnightUtc.getUTCFullYear()}-${pad2(
    localMidnightUtc.getUTCMonth() + 1,
  )}-${pad2(localMidnightUtc.getUTCDate())}`;

  return {
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    dateKey,
    sundayWeekKey,
    timeZone,
  };
}

/**
 * Runs once every Sunday at or after 1:00 AM local time.
 */
export function shouldRunWeeklyGeneration(
  clock: LocalClockParts,
  lastGeneratedWeekKey: string | null | undefined,
): boolean {
  if (clock.weekday !== 0) return false;
  if (clock.hour < 1) return false;
  return lastGeneratedWeekKey !== clock.sundayWeekKey;
}

/**
 * Runs once every weekday (Mon–Fri) at or after 1:00 AM local time.
 */
export function shouldRunDailyRotation(
  clock: LocalClockParts,
  lastAppliedDateKey: string | null | undefined,
): boolean {
  if (clock.weekday < 1 || clock.weekday > 5) return false;
  if (clock.hour < 1) return false;
  return lastAppliedDateKey !== clock.dateKey;
}
