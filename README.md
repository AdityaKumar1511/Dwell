# Dwell

Read receipts for your resume, proposals, and portfolio. Per-page analytics with a live dashboard.

**Phase 1 (current):** scaffold, schema + RLS, email-link auth, PDF upload to Storage, document library.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase (Postgres, Storage, Auth; Realtime wired in the schema for Phase 5)
- `pdf-lib` for server-side page counting — `pdfjs-dist` arrives with the viewer
- Recharts arrives with the dashboard charts

## Setup

### 1. Create the Supabase project

Copy the project URL and keys from **Project Settings → API**.

### 2. Apply the migration

Open the Supabase **SQL Editor** and run the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

Or, with the Supabase CLI linked to the project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates the four tables, RLS policies, indexes, the private `documents`
Storage bucket, and the Storage policies.

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

## Security model

- **Owner routes** use a cookie-bound anon-key client. RLS restricts every row to
  `owner_id = auth.uid()` (documents) or to a document the user owns (links,
  views, events).
- **Recipients are anonymous.** They will never query Postgres directly. Viewer
  routes validate a signed link token and use the service role. `views` and
  `events` therefore have *select-only* policies — no client can insert fake
  engagement.
- **`links.password_hash`** has no `SELECT` privilege for `anon` or
  `authenticated`, even for the owner. PostgREST queries that `select("*")` from
  `links` will fail by design. Phase 3 moves the hash into a deny-all
  `link_secrets` table read only by the service role.
- **Storage** is private; objects are namespaced by owner id and gated by Storage
  RLS policies.

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

## Data model

- `documents` — owner, title, storage path, server-derived `page_count` / `size_bytes`
- `links` — one per recipient; slug, optional password/expiry/max views/revoke
- `views` — one per reading session, with device/browser/os/geo/referrer
- `events` — `open`, `page_enter`, `page_leave`, `scroll`, `click`, `download`,
  `print`, `copy`, `tab_hidden`, `tab_visible`, `close`

`events.link_id` is denormalised for dashboard queries and derived from
`views.link_id` by a trigger, so the two can never disagree.
