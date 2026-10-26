/**
 * Only same-origin relative paths are allowed back through the auth flow.
 * Rejects protocol-relative (`//evil.com`) and backslash tricks.
 */
export function safeNext(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (value.length === 0 || value.length > 500) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}
