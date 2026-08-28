// Sending in the recipient's morning rather than ours. Vercel cron is UTC-only
// and, on Hobby, runs once a day — so the window check lives here and the queue
// is polled hourly from outside (see .github/workflows/send.yml).
//
// No dependency needed: Intl already knows every IANA zone.

export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Europe/Athens";

// Founders triage mail before the day fragments. Inclusive bounds, local hours.
export const SEND_WINDOW_START = 7;
export const SEND_WINDOW_END = 10;

export function localHour(at: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    }).format(at)
  );
}

export function isInSendWindow(at: Date, timeZone: string | null | undefined): boolean {
  try {
    const hour = localHour(at, timeZone || DEFAULT_TIMEZONE);
    return hour >= SEND_WINDOW_START && hour <= SEND_WINDOW_END;
  } catch {
    // An unrecognised zone string must not strand a contact in the queue
    // forever. Better to send at a mediocre hour than never.
    return true;
  }
}

// Cities that appear in the target list, so an import carrying only a city
// still gets a usable zone. Anything unmapped falls back to DEFAULT_TIMEZONE.
const CITY_TO_TIMEZONE: Record<string, string> = {
  athens: "Europe/Athens",
  thessaloniki: "Europe/Athens",
  london: "Europe/London",
  dublin: "Europe/Dublin",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  munich: "Europe/Berlin",
  hamburg: "Europe/Berlin",
  amsterdam: "Europe/Amsterdam",
  stockholm: "Europe/Stockholm",
  copenhagen: "Europe/Copenhagen",
  oslo: "Europe/Oslo",
  helsinki: "Europe/Helsinki",
  madrid: "Europe/Madrid",
  barcelona: "Europe/Madrid",
  lisbon: "Europe/Lisbon",
  milan: "Europe/Rome",
  rome: "Europe/Rome",
  zurich: "Europe/Zurich",
  vienna: "Europe/Vienna",
  warsaw: "Europe/Warsaw",
  prague: "Europe/Prague",
  tallinn: "Europe/Tallinn",
  bucharest: "Europe/Bucharest",
  "new york": "America/New_York",
  "new york city": "America/New_York",
  brooklyn: "America/New_York",
  boston: "America/New_York",
  atlanta: "America/New_York",
  miami: "America/New_York",
  toronto: "America/Toronto",
  chicago: "America/Chicago",
  austin: "America/Chicago",
  denver: "America/Denver",
  "san francisco": "America/Los_Angeles",
  "san francisco bay area": "America/Los_Angeles",
  "palo alto": "America/Los_Angeles",
  "los angeles": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  vancouver: "America/Vancouver",
  singapore: "Asia/Singapore",
  bengaluru: "Asia/Kolkata",
  bangalore: "Asia/Kolkata",
  "tel aviv": "Asia/Jerusalem",
  sydney: "Australia/Sydney",
};

export function timezoneForCity(city: string | null | undefined): string | null {
  if (!city) return null;
  // Target-list values arrive as "Berlin, Berlin, Germany" — the first
  // component is the city.
  const key = city.split(",")[0].trim().toLowerCase();
  return CITY_TO_TIMEZONE[key] ?? null;
}
