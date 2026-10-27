# Dwell

Read receipts for your resume, proposals, and portfolio. Per-page analytics with a live dashboard.

**Phase 3 (current):** scaffold, schema + RLS, email-link auth, PDF upload,
document library, per-recipient links, the public reader at `/v/[slug]`, and
engagement tracking.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Postgres, Storage, Auth; Realtime wired in the schema for Phase 5)
- `pdf-lib` for server-side page counting, `pdfjs-dist` for rendering
- `bowser` for coarse UA parsing
- Recharts arrives with the dashboard charts

## Setup

### 1. Create the Supabase project

Copy the project URL and keys from **Project Settings → API**.

### 2. Apply the migration

Open the Supabase **SQL Editor** and run, in order,
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and
[`supabase/migrations/0002_tracking.sql`](supabase/migrations/0002_tracking.sql).

Or, with the Supabase CLI linked to the project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates the four tables, RLS policies, indexes, the private `documents`
Storage bucket, and the Storage policies. `0002_tracking.sql` adds
`events.client_event_id`, `events.scroll_depth`, and the unique
`(view_id, client_event_id)` index that makes tracking retries idempotent.

### 3. Configure auth

**Authentication → URL Configuration**

- Site URL: `http://localhost:3000` (or your production URL)
- Redirect URLs: add `http://localhost:3000/auth/callback` and your production
  equivalent, e.g. `https://dwell.example.com/auth/callback`
- Keep the **Email** provider enabled. The default magic-link template is fine.
- Magic links are PKCE-bound: open the link in the same browser you requested it
  from. (A custom `{{ .TokenHash }}` template can lift this later.)

### 4. Environment

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon (legacy JWT) or publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key — **server only** |
| `NEXT_PUBLIC_SITE_URL` | optional; used to build auth redirect links |

The service key is imported only by `lib/supabase/admin.ts`, which begins with
`import "server-only"`, so a client component that tries to import it fails the
build instead of leaking the key.

### 5. Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, sign in with your email, click the link, upload a
PDF.

## How upload works

```
browser ──PUT bytes──▶ Supabase Storage   {owner_id}/{uuid}.pdf
   │
   └──server action──▶ download the object again
                       verify %PDF- header
                       count pages with pdf-lib
                       insert documents row (RLS on)
                       delete the object if any step fails
```

Bytes go straight from the browser to Storage, so files larger than a
serverless request limit still work (20 MB bucket cap). The browser's claims
about the file are ignored: page count and MIME come from the server's own read.

## How a link works

```
owner dashboard ──server action──▶ links row { slug: 16 base64url chars }
                                       │
recipient ──GET /v/<slug>──▶ validate + sign the PDF (1 h, service role)
                                       │
                           client: POST /api/view ──▶ views row + `open` event
                                       │
                           PDF.js paints viewport-sized pages on <canvas>
```

- The slug is the only credential: 12 random bytes, base64url, retried on
  collision. Nothing else about the recipient is guessable.
- `/v/[slug]` is `force-dynamic`, sends no cookies, and reads through the service
  role. Invalid, revoked, expired, and view-limited links all render the same
  “This link isn’t available” page.
- The reading session is created from the client (`POST /api/view`) rather than
  during the render, so prerenders, link previewers, and crawlers don't fabricate
  views. The route re-checks revocation, expiry, and `max_views` before inserting.
- Device / browser / OS come from a coarse UA parse (`bowser`); country and city
  from Vercel's geo headers; the referrer is stored as origin + path only. No IP
  and no raw UA string are stored.
- The reader is told plainly: *This link records views and engagement.*
- PDF.js renders lazily: only pages within ~1500 px of the viewport keep a
  bitmap, and each page wrapper carries `data-page="N"` for page detection.

## How tracking works

`components/viewer/use-engagement.ts` runs only after `/api/view` returns a
`viewId`; before that the reader sees the document but nothing is recorded.

- **Current page** is the most visible `[data-page]` element, chosen with an
  `IntersectionObserver` and a 150 ms settle window (10% minimum visibility; a
  new page must lead by 2 points). Page changes emit `page_enter` (with
  `duration_ms: 0`) and `page_leave` (with the active time and max depth).
- **Active time** ticks once per second only while the tab is visible *and* the
  window is focused or received input in the last 30 s. Hiding the tab pauses;
  `tab_hidden` / `tab_visible` are emitted and the queue is flushed with
  `navigator.sendBeacon`.
- **Scroll depth** is the furthest percentage of the current page that entered
  the viewport, kept in memory per page and sent with `page_leave`.
- **Interactions** are recorded without ever blocking them: link clicks
  (`click`, or `download` for `download` attributes / file extensions), print
  (`beforeprint`), copy, and Ctrl/Cmd+S.
- **Delivery** batches events in memory (flushed every 5 s and whenever 40 are
  queued), sends a final `page_leave` + `close` on `pagehide` with beacons, and
  drops the oldest events if the queue exceeds 200. Each event carries a
  client-generated UUID so retries are idempotent.
- **`POST /api/track`** accepts ≤ 24 KB and ≤ 40 events per request, whitelists
  the nine event types, clamps pages, durations (30 min) and depth (0–100),
  sanitizes click URLs to origin + path, rejects views whose link is revoked or
  expired, and allows 300 stored events per view per minute. It never reads or
  writes IP addresses. Events are inserted with the service role and
  `views.last_seen_at` is touched at the same time.

There is no dashboard yet; the recorded data is ready for Phase 4/5.

### pdf.js assets

`postinstall` runs `scripts/copy-pdf-worker.mjs`, which copies the worker,
`cmaps/`, `standard_fonts/`, and `wasm/` from `pdfjs-dist` into `public/`
(gitignored). Deployments must run install scripts; if
`public/pdf.worker.min.mjs` is missing, the viewer can't render. Running
`npm install` locally after pulling this phase is enough.

## Security model

- **Owner routes** use a cookie-bound anon-key client. RLS restricts every row to
  `owner_id = auth.uid()` (documents) or to a document the user owns (links,
  views, events).
- **Recipients are anonymous.** They never query Postgres. `/v/[slug]` resolves the
  link server-side with the service role, checks revocation / expiry /
  `max_views`, and hands the client only display fields plus a one-hour signed
  Storage URL. `views` and `events` have *select-only* policies, so no browser
  session can insert fake engagement.
- **`links.password_hash`** has no `SELECT` privilege for `anon` or
  `authenticated`, even for the owner. PostgREST queries that `select("*")` from
  `links` will fail by design. A later phase moves the hash into a deny-all
  `link_secrets` table read only by the service role.
- **Storage** is private; objects are namespaced by owner id and gated by Storage
  RLS policies.
- The signed URL embeds the object path (`documents/<owner>/<uuid>.pdf`), so a
  recipient who inspects the network tab learns it. Fully hiding the path needs
  a Range-proxying download route (deferred; it also removes the signed-URL
  expiry problem during long reads).

### Verify RLS actually bites

1. Sign in as user A and upload a document. Grab the UUIDs in the SQL editor:

```sql
select id, owner_id, title from public.documents;
```

2. Impersonate user B inside a transaction:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<USER_B_UUID>', 'role', 'authenticated')::text,
  true
);

select count(*) from public.documents;   -- 0
select count(*) from public.views;       -- 0
select password_hash from public.links;  -- ERROR: permission denied
rollback;
```

3. Repeat with user A's UUID: the document count becomes 1, but
   `select password_hash from public.links` is still denied — the column
   privilege is revoked independently of RLS, so even the owner can't read a
   hash through a browser session.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

`postinstall` copies the pdf.js worker, cmaps, standard fonts, and wasm decoders
into `public/` (gitignored) so the viewer can render offline from the app origin.

## Known gaps (Phase 3)

- No rate limit on `POST /api/view` beyond slug entropy. Add a per-IP limit
  before a public launch.
- Copy uses `navigator.clipboard` with an `execCommand` fallback; on a denied
  permission the button reports “Copy failed” and the slug is still visible.
- The signed URL lasts one hour; a very long read reloads the PDF URL from a
  fresh page load only.
- `POST /api/track`'s limit is database-backed (300 stored events per view per
  minute) rather than a distributed token bucket. Behind a botnet it only caps
  the damage per view, not the total request rate.
- Restoring a page from the back/forward cache after `pagehide` resumes timers
  without a second `page_enter`; the next page change or unload still records
  consistently.

## Data model

- `documents` — owner, title, storage path, server-derived `page_count` / `size_bytes`
- `links` — one per recipient; slug, optional password/expiry/max views/revoke
- `views` — one per reading session, with device/browser/os/geo/referrer
- `events` — `open`, `page_enter`, `page_leave`, `scroll`, `click`, `download`,
  `print`, `copy`, `tab_hidden`, `tab_visible`, `close`; `client_event_id` and
  `scroll_depth` arrive with `0002_tracking.sql`

`events.link_id` is denormalised for dashboard queries and derived from
`views.link_id` by a trigger, so the two can never disagree.
