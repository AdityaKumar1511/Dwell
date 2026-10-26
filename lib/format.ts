const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(input: string | Date, now: number = Date.now()): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const delta = date.getTime() - now;
  const abs = Math.abs(delta);

  if (abs < 45_000) return "just now";
  if (abs < HOUR) return relative.format(Math.round(delta / MINUTE), "minute");
  if (abs < DAY) return relative.format(Math.round(delta / HOUR), "hour");
  if (abs < 7 * DAY) return relative.format(Math.round(delta / DAY), "day");

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date(now).getFullYear()
      ? { year: "numeric" }
      : {}),
  }).format(date);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[index]}`;
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en")} ${count === 1 ? singular : plural}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
