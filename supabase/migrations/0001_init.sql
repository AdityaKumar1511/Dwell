-- ============================================================================
-- Dwell — initial schema
-- Run once against your Supabase project (SQL editor, or `supabase db push`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.event_type as enum (
  'open',
  'page_enter',
  'page_leave',
  'scroll',
  'click',
  'download',
  'print',
  'copy',
  'tab_hidden',
  'tab_visible',
  'close'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  file_path   text not null unique,
  page_count  integer not null check (page_count > 0),
  size_bytes  bigint not null check (size_bytes > 0),
  mime_type   text not null default 'application/pdf',
  created_at  timestamptz not null default now()
);

create table public.links (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents (id) on delete cascade,
  slug            text not null unique check (slug ~ '^[A-Za-z0-9_-]{8,64}$'),
  recipient_name  text,
  recipient_email text,
  -- Stored here for spec fidelity, but owners have no SELECT privilege on this
  -- column (see grants below). Phase 3 moves it to a deny-all link_secrets table.
  password_hash   text,
  expires_at      timestamptz,
  max_views       integer check (max_views is null or max_views > 0),
  revoked         boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.views (
  id            uuid primary key default gen_random_uuid(),
  link_id       uuid not null references public.links (id) on delete cascade,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  device        text,
  browser       text,
  os            text,
  country       text,
  city          text,
  referrer      text
);

create table public.events (
  id          bigint generated always as identity primary key,
  view_id     uuid not null references public.views (id) on delete cascade,
  link_id     uuid not null references public.links (id) on delete cascade,
  event_type  public.event_type not null,
  page        integer check (page is null or page > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- link_id on events is denormalised for cheap dashboard queries; derive it so
-- the two columns can never disagree.
create function public.events_derive_link_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select v.link_id into new.link_id
  from public.views v
  where v.id = new.view_id;

  if new.link_id is null then
    raise exception 'events.view_id % does not exist', new.view_id;
  end if;

  return new;
end;
$$;

create trigger events_derive_link_id
  before insert or update of view_id on public.events
  for each row execute function public.events_derive_link_id();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index documents_owner_created_idx on public.documents (owner_id, created_at desc);
create index links_document_created_idx on public.links (document_id, created_at desc);
create index views_link_started_idx     on public.views (link_id, started_at desc);
create index events_link_created_idx    on public.events (link_id, created_at desc);
create index events_view_created_idx    on public.events (view_id, created_at);
create index events_page_leave_idx      on public.events (link_id, page)
  where event_type = 'page_leave';

-- ---------------------------------------------------------------------------
-- Row Level Security
--   Owners: read/write their own documents and links, read views/events.
--   Recipients: never touch Postgres directly. /api routes validate a token and
--   use the service role, so views/events have no client write policy at all.
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.links     enable row level security;
alter table public.views     enable row level security;
alter table public.events    enable row level security;

create policy "documents_owner_select" on public.documents
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "documents_owner_insert" on public.documents
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "documents_owner_update" on public.documents
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "documents_owner_delete" on public.documents
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "links_owner_select" on public.links
  for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = links.document_id
        and d.owner_id = (select auth.uid())
    )
  );

create policy "links_owner_insert" on public.links
  for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = links.document_id
        and d.owner_id = (select auth.uid())
    )
  );

create policy "links_owner_update" on public.links
  for update to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = links.document_id
        and d.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.documents d
      where d.id = links.document_id
        and d.owner_id = (select auth.uid())
    )
  );

create policy "links_owner_delete" on public.links
  for delete to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = links.document_id
        and d.owner_id = (select auth.uid())
    )
  );

create policy "views_owner_select" on public.views
  for select to authenticated
  using (
    exists (
      select 1
      from public.links l
      join public.documents d on d.id = l.document_id
      where l.id = views.link_id
        and d.owner_id = (select auth.uid())
    )
  );

create policy "events_owner_select" on public.events
  for select to authenticated
  using (
    exists (
      select 1
      from public.links l
      join public.documents d on d.id = l.document_id
      where l.id = events.link_id
        and d.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
--   Explicit rather than relying on Supabase's default privileges. Note the
--   column-level SELECT on links: password_hash is structurally unreadable by
--   any browser session, even the owner's.
-- ---------------------------------------------------------------------------
revoke all on public.documents from anon, authenticated;
revoke all on public.links     from anon, authenticated;
revoke all on public.views     from anon, authenticated;
revoke all on public.events    from anon, authenticated;

grant select, insert, update, delete on public.documents to authenticated;

grant select (id, document_id, slug, recipient_name, recipient_email,
              expires_at, max_views, revoked, created_at)
  on public.links to authenticated;
grant insert, update, delete on public.links to authenticated;

grant select on public.views  to authenticated;
grant select on public.events to authenticated;

grant all on public.documents, public.links, public.views, public.events
  to service_role;
grant usage, select on sequence public.events_id_seq to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime (consumed by the dashboard in Phase 5)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.views, public.events';
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, one folder per owner
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "documents_storage_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "documents_storage_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "documents_storage_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "documents_storage_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
