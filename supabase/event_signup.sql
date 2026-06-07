-- =====================================================================
--  Event Sign-Up — schema for cesqroo-portal
--  Reuses existing public.clubs / public.riders / public.horses.
--  Run in the Supabase SQL Editor for project mgynqookxoaluoanolew.
-- =====================================================================

-- ---------- Clean up the earlier standalone prototype tables ---------
-- These were created by the separate "Web App" experiment and are now
-- superseded by the event_* tables below. Safe to drop (no real data).
drop table if exists public.entries     cascade;
drop table if exists public.submissions cascade;

-- ---------- EVENTS ---------------------------------------------------
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,          -- used in the public URL /signup/<slug>
  saturday_date date,
  sunday_date   date,
  is_open       boolean not null default true, -- closes the public form when false
  created_at    timestamptz not null default now()
);

-- ---------- EVENT SUBMISSIONS (one per club batch) -------------------
create table if not exists public.event_submissions (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  club_id        uuid references public.clubs(id),
  club_name      text not null,                 -- snapshot at submit time
  representative text,
  coach          text,
  phone          text,
  email          text,
  created_at     timestamptz not null default now()
);

-- ---------- EVENT ENTRIES (one per rider+horse participation) --------
create table if not exists public.event_entries (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.event_submissions(id) on delete cascade,
  event_id      uuid not null references public.events(id) on delete cascade,
  club_id       uuid references public.clubs(id),
  rider_id      uuid references public.riders(id),  -- resolved/created portal rider
  horse_id      uuid references public.horses(id),  -- resolved/created portal horse
  rider_name    text not null,                       -- snapshot for display
  horse_name    text not null,                       -- snapshot for display
  height        text not null,
  section       text not null,
  saturday      boolean not null default false,
  sunday        boolean not null default false,
  circuit       boolean not null default false,      -- registered in the circuit
  discount      boolean not null default false,      -- eligible for discount
  created_at    timestamptz not null default now(),
  constraint event_entry_at_least_one_day check (saturday or sunday)
);

create index if not exists event_submissions_event_idx on public.event_submissions(event_id);
create index if not exists event_submissions_club_idx  on public.event_submissions(club_id);
create index if not exists event_entries_submission_idx on public.event_entries(submission_id);
create index if not exists event_entries_event_idx      on public.event_entries(event_id);
create index if not exists event_entries_club_idx       on public.event_entries(club_id);

-- =====================================================================
--  Row Level Security
--  All access goes through server-side API routes / server components
--  using the SERVICE ROLE key (supabaseAdmin), which BYPASSES RLS.
--  We enable RLS with NO public policies so the anon key cannot read or
--  write these tables directly.
-- =====================================================================
alter table public.events            enable row level security;
alter table public.event_submissions enable row level security;
alter table public.event_entries     enable row level security;

-- =====================================================================
--  Seed the current event (edit name/dates as needed)
-- =====================================================================
insert into public.events (name, slug, saturday_date, sunday_date, is_open)
values ('Concurso de Salto', 'concurso-salto', null, null, true)
on conflict (slug) do nothing;
