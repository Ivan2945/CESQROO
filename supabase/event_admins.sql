-- Show administrators: grant a user read access to ONE event's full roster.
-- A "show admin" is any user with a row here for that event. It does NOT grant
-- editing of other clubs' data — the app keeps all edit/commit/config controls
-- global-admin-only; show admins only get a whole-show read view.
--
-- Run once in the Supabase SQL editor.

create table if not exists public.event_admins (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_admins_user_idx on public.event_admins (user_id);

-- Accessed only through the service-role client, same as the other show tables.
alter table public.event_admins enable row level security;
