import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUserAgent } from "@/lib/user-agent";
import { SLUG_PATTERN } from "@/lib/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

/**
 * Registers a reading session for a public link. There is no session cookie
 * here — the unguessable slug is the credential, and the service role does the
 * write because recipients have no Postgres access by design.
 */
export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const slug =
      typeof payload === "object" && payload !== null && "slug" in payload
        ? (payload as { slug?: unknown }).slug
        : null;

    if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
      return unavailableResponse();
    }

    const admin = createAdminClient();

    const { data: link, error: linkError } = await admin
      .from("links")
      .select("id, revoked, expires_at, max_views")
      .eq("slug", slug)
      .maybeSingle();

    if (linkError || !link || link.revoked) return unavailableResponse();
    if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) {
      return unavailableResponse();
    }

    if (link.max_views !== null) {
      const { count, error: countError } = await admin
        .from("views")
        .select("id", { count: "exact", head: true })
        .eq("link_id", link.id);

      if (countError) return unavailableResponse();
      if ((count ?? 0) >= link.max_views) return unavailableResponse();
    }

    const signature = parseUserAgent(request.headers.get("user-agent"));
    const referrer = cleanReferrer(request.headers.get("referer"));
    const country = cleanCountry(
      request.headers.get("x-vercel-ip-country") ??
        request.headers.get("cf-ipcountry"),
    );
    const city = cleanCity(request.headers.get("x-vercel-ip-city"));

    const { data: view, error: viewError } = await admin
      .from("views")
      .insert({
        link_id: link.id,
        device: signature.device,
        browser: signature.browser,
        os: signature.os,
        country,
        city,
        referrer,
      })
      .select("id")
      .single();

    if (viewError || !view) {
      return NextResponse.json({ error: "server" }, { status: 500 });
    }

    // The view is what matters; a failed open event shouldn't hide the document.
    const { error: eventError } = await admin.from("events").insert({
      view_id: view.id,
      event_type: "open",
      meta: {},
    });
    if (eventError) {
      console.error("dwell: open event insert failed", eventError.code);
    }

    return NextResponse.json(
      { viewId: view.id },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("dwell: /api/view failed", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

function unavailableResponse() {
  return NextResponse.json(
    { error: "unavailable" },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

/** Origin + path only: query strings and fragments can carry personal data. */
function cleanReferrer(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}

function cleanCountry(raw: string | null): string | null {
  if (!raw || !/^[A-Za-z]{2}$/.test(raw)) return null;
  return raw.toUpperCase();
}

function cleanCity(raw: string | null): string | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Vercel URL-encodes the city; if it isn't valid encoding, keep it raw.
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return cleaned || null;
}
