import { DEFAULT_TIMEZONE, SEND_WINDOW_START } from "@/lib/timezone";

// Which weekdays outreach may go out on, in the *recipient's* local calendar:
// 0 = Sunday ... 6 = Saturday. Sunday is excluded by default because a cold
// email arriving on a Sunday morning reads as automated no matter how well it
// is written.
const DEFAULT_SENDING_DAYS = "1,2,3,4,5,6";

export const SENDING_DAYS: ReadonlySet<number> = new Set(
  (process.env.SENDING_DAYS || DEFAULT_SENDING_DAYS)
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
);

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Day of week (0-6) as it is *there*, not here. */
export function localWeekday(at: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(at);
  const day = WEEKDAY_INDEX[label];
  if (day === undefined) throw new Error(`unrecognised weekday: ${label}`);
  return day;
}

export function isSendingDay(at: Date, timeZone: string | null | undefined): boolean {
  try {
    return SENDING_DAYS.has(localWeekday(at, timeZone || DEFAULT_TIMEZONE));
  } catch {
    // An unknown zone must not strand a contact in the queue forever; the
    // send-window check applies the same fallback.
    return true;
  }
}

/** Milliseconds a zone is ahead of UTC at that instant. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  // en-CA gives YYYY-MM-DD, so the parts reassemble into a parseable string.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  // Hour 24 appears at midnight in some locales; normalise it to 00.
  const hour = get("hour") === "24" ? "00" : get("hour");
  const asUtc = Date.parse(
    `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}Z`
  );
  return asUtc - at.getTime();
}

/**
 * The UTC instant at which the send window opens on the given local calendar
 * day. Scheduling to the window's start (rather than local midnight) means a
 * step becomes due exactly when it may first be sent, so a queue spread over
 * several days does not all collapse into the first run.
 */
export function windowStartUtc(localDay: Date, timeZone: string): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(localDay);
  const naive = Date.parse(`${ymd}T${String(SEND_WINDOW_START).padStart(2, "0")}:00:00Z`);
  // Correct the naive instant by the offset in force around that moment.
  const approx = new Date(naive);
  return new Date(naive - zoneOffsetMs(approx, timeZone));
}

/**
 * Walk forward from `from` to the `index`-th sending day (0 = the first
 * sending day at or after `from`), and return when its window opens.
 */
export function nthSendingSlot(from: Date, index: number, timeZone: string | null | undefined): Date {
  const tz = timeZone || DEFAULT_TIMEZONE;
  let cursor = new Date(from);
  let seen = -1;

  // A year of headroom: enough for any realistic drip, and a hard stop so a
  // misconfigured SENDING_DAYS cannot loop forever.
  for (let i = 0; i < 400; i++) {
    if (isSendingDay(cursor, tz)) {
      const slot = windowStartUtc(cursor, tz);
      // Only count a day whose window has not already closed for us.
      if (slot >= from || seen >= 0) {
        seen++;
        if (seen === index) return slot < from ? from : slot;
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 3600_000);
  }
  throw new Error("no sending day found; check SENDING_DAYS");
}
