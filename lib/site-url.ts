import "server-only";

import { headers } from "next/headers";
import { configuredSiteUrl } from "@/lib/env";

/**
 * Absolute origin for auth redirect links. Prefers NEXT_PUBLIC_SITE_URL so
 * preview deployments still link to the canonical domain, and falls back to the
 * request's forwarded host.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = configuredSiteUrl();
  if (configured) return configured;

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = requestHeaders.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");

  return `${proto}://${host}`;
}
