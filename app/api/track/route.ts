import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TRACK_LIMITS,
  UUID_PATTERN,
  isTrackableEventType,
  sanitizeClickHref,
  type TrackableEventType,
} from "@/lib/tracking";
import type { Database, Json } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

/**
 * Ingests a reader's batched engagement events.
 *
 * The view id is the credential: it is a UUID created by /api/view and handed
 * only to that reader. Nothing here can read a document, and a rejected event
 * batch never blocks the reader — the client fires and forgets.
 */
export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > TRACK_LIMITS.bodyBytes) {
      return respond(413, "too_large");
    }

    let raw: string;
    try {
      raw = await request.text();
    } catch {
      return respond(400, "bad_request");
    }

    // Also enforce the cap when content-length is absent (beacons, HTTP/2).
    if (raw.length > TRACK_LIMITS.bodyBytes) {
      return respond(413, "too_large");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return respond(400, "bad_request");
    }

    if (typeof payload !== "object" || payload === null) {
      return respond(400, "bad_request");
    }

    const { viewId, events } = payload as {
      viewId?: unknown;
      events?: unknown;
    };

    if (typeof viewId !== "string" || !UUID_PATTERN.test(viewId)) {
      return respond(400, "bad_request");
    }

    if (
      !Array.isArray(events) ||
      events.length === 0 ||
      events.length > TRACK_LIMITS.eventsPerRequest
    ) {
      return respond(400, "bad_request");
    }

    const rows = normalizeBatch(viewId, events);
    if (rows.length === 0) return respond(400, "bad_request");

    const admin = createAdminClient();

    // The view must still belong to a live link: revoked or expired links stop
    // accepting engagement immediately, even for tabs opened before revocation.
    const { data: view, error: viewError } = await admin
      .from("views")
      .select("id, link_id")
      .eq("id", viewId)
      .maybeSingle();

    if (viewError) return respond(500, "server");
    if (!view) return respond(404, "unavailable");

    const { data: link, error: linkError } = await admin
      .from("links")
      .select("revoked, expires_at")
      .eq("id", view.link_id)
      .maybeSingle();

    if (linkError) return respond(500, "server");
    if (!link || link.revoked) return respond(404, "unavailable");
    if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) {
      return respond(404, "unavailable");
    }

    // Cheap per-view rate limit backed by events_view_created_idx. It counts
    // stored rows, so duplicate (retried) events do not consume budget.
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error: countError } = await admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("view_id", viewId)
      .gte("created_at", since);

    if (countError) return respond(500, "server");
    if ((count ?? 0) + rows.length > TRACK_LIMITS.eventsPerMinute) {
      return respond(429, "rate_limited", { "retry-after": "30" });
    }

    // Client event ids make beacon/flush retries idempotent. The unique index
    // on (view_id, client_event_id) is the conflict target.
    const { error: insertError } = await admin.from("events").upsert(rows, {
      onConflict: "view_id,client_event_id",
      ignoreDuplicates: true,
    });

    if (insertError) {
      console.error("dwell: /api/track insert failed", insertError.code);
      return respond(500, "server");
    }

    const { error: seenError } = await admin
      .from("views")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", viewId);

    // Events are already stored; a missed heartbeat must not fail the batch.
    if (seenError) {
      console.error("dwell: /api/track heartbeat failed", seenError.code);
    }

    return new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("dwell: /api/track failed", error);
    return respond(500, "server");
  }
}

function normalizeBatch(viewId: string, items: unknown[]): EventInsert[] {
  const rows: EventInsert[] = [];
  const seenIds = new Set<string>();

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;

    const event = item as Record<string, unknown>;
    const id = event.id;
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const type = event.type;
    if (!isTrackableEventType(type)) continue;

    rows.push({
      view_id: viewId,
      client_event_id: id,
      event_type: type,
      page: clampPage(event.page),
      duration_ms: clampDuration(event.durationMs, type),
      scroll_depth: clampDepth(event.depth),
      meta: buildMeta(type, event.meta),
    });
  }

  return rows;
}

/** Only real page numbers; the DB check also requires page > 0. */
function clampPage(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const page = Math.round(value);
  if (page < 1) return null;
  return Math.min(page, TRACK_LIMITS.maxPage);
}

/** `page_leave` carries the session slice; tab/click events carry zero. */
function clampDuration(
  value: unknown,
  type: TrackableEventType,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (type !== "page_leave") return 0;
  return Math.min(
    Math.max(Math.round(value), 0),
    TRACK_LIMITS.maxDurationMs,
  );
}

function clampDepth(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(Math.max(Math.round(value), 0), 100);
}

/** Clicks may carry a destination; nothing else is accepted. */
function buildMeta(type: TrackableEventType, value: unknown): Json {
  if (type !== "click" && type !== "download") return {};

  const raw =
    typeof value === "object" && value !== null
      ? (value as { href?: unknown }).href
      : null;

  const href =
    typeof raw === "string" ? sanitizeClickHref(raw) : null;
  return href ? { href } : {};
}

function respond(
  status: number,
  error: string,
  extraHeaders: Record<string, string> = {},
) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "cache-control": "no-store", ...extraHeaders },
    },
  );
}
