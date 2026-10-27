-- Phase 3: engagement tracking.
--
-- client_event_id makes the client's batched/beacon retries idempotent. The
-- index is deliberately not partial: Postgres can only infer an ON CONFLICT
-- target from a full unique index, and NULLs stay distinct for older rows.
--
-- scroll_depth is the deepest percentage of a page the reader reached; it is
-- flushed on page_leave alongside duration_ms.

alter table public.events
  add column client_event_id uuid,
  add column scroll_depth smallint
    check (scroll_depth is null or scroll_depth between 0 and 100);

create unique index events_view_client_event_idx
  on public.events (view_id, client_event_id);

comment on column public.events.client_event_id is
  'Client-generated UUID; makes beacon retries idempotent.';
comment on column public.events.scroll_depth is
  'Max percentage (0-100) of the page that entered the viewport, sent with page_leave.';
