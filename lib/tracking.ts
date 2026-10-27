/**
 * Shared contract between the viewer tracker and POST /api/track.
 * Keep this module free of server-only imports: the client bundles it too.
 */

export const TRACKABLE_EVENT_TYPES = [
  "page_enter",
  "page_leave",
  "tab_hidden",
  "tab_visible",
  "click",
  "download",
  "print",
  "copy",
  "close",
] as const;

export type TrackableEventType = (typeof TRACKABLE_EVENT_TYPES)[number];

export type TrackedEvent = {
  id: string;
  type: TrackableEventType;
  page?: number | null;
  durationMs?: number | null;
  /** Max percentage of the page that entered the viewport (0-100). */
  depth?: number | null;
  meta?: { href?: string };
};

export const TRACK_LIMITS = {
  // 40 events x (uuid + type + page + duration + depth + 300-char href) fits
  // comfortably; the client also chunks beacons to this same event count.
  bodyBytes: 24 * 1024,
  eventsPerRequest: 40,
  eventsPerMinute: 300,
  maxDurationMs: 30 * 60 * 1000,
  maxPage: 10_000,
  maxHrefLength: 300,
  flushIntervalMs: 5_000,
  queueCap: 200,
} as const;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLICKABLE_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
]);

/** Parses a destination only when the viewer is allowed to make it clickable. */
export function parseClickableUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return CLICKABLE_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * What we persist for a click: origin + path for web links, scheme only for
 * mailto/tel so addresses and phone numbers never reach the database.
 */
export function sanitizeClickHref(raw: string): string | null {
  const url = parseClickableUrl(raw);
  if (!url) return null;

  if (url.protocol === "mailto:") return "mailto:";
  if (url.protocol === "tel:") return "tel:";

  return `${url.origin}${url.pathname}`.slice(0, TRACK_LIMITS.maxHrefLength);
}

export function isTrackableEventType(value: unknown): value is TrackableEventType {
  return (
    typeof value === "string" &&
    (TRACKABLE_EVENT_TYPES as readonly string[]).includes(value)
  );
}
