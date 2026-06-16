-- =====================================================================
--  Multi-circuit restructure — ADDITIVE migration for cesqroo-portal
--  Project ref: mgynqookxoaluoanolew
--
--  Adds two concepts on top of the EXISTING schema, nothing destructive:
--    * regions  — identity isolation boundary (scopes the master + show
--                 catalogs). "Centro" today; a future "Puebla" is isolated.
--    * series   — a championship (CESQROO, Copa Refugio): owns a subdomain,
--                 branding, and its standings rules. Events belong to a series.
--
--  Every existing row keeps its primary key. events / event_submissions /
--  event_entries / event_results / the catalogs are only LABELED with new
--  FK columns. Re-runnable (idempotent): create-if-not-exists, add-if-not-
--  exists, on-conflict-do-nothing, and null-guarded backfills.
--
--  NOTE: "series" is deliberately NOT called "circuit" — the existing
--  show_*.circuit_*_id columns already use "circuit" to mean the master
--  championship-rider catalog. We leave those untouched.
-- =====================================================================

begin;

-- ---------- 1) REGIONS (identity isolation boundary) -----------------
create table if not exists public.regions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

insert into public.regions (name, slug)
values ('Centro', 'centro')
on conflict (slug) do nothing;

-- ---------- 2) SERIES (CESQROO, Copa Refugio) ------------------------
--  standings_config (per series): shared sections scored SEPARATELY, plus a
--  rule per scope (mini-series award vs season title):
--   sections         : ["Abierta","Especial"]  (each its own ranking)
--   section_fallback : ["Libre"]  (only at heights with none of `sections`)
--   scopes.<scope>.basis       : "class" (rank full section, all binomios)
--                                | "registered" (registered only, re-ranked)
--   scopes.<scope>.per_day_cap : "first_class" | "none" | { "max": N }
create table if not exists public.series (
  id               uuid primary key default gen_random_uuid(),
  region_id        uuid not null references public.regions(id),
  name             text not null,
  slug             text not null unique,
  subdomain        text not null unique,
  branding         jsonb not null default '{}'::jsonb,
  standings_config jsonb not null default '{}'::jsonb,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

insert into public.series (region_id, name, slug, subdomain, standings_config)
select r.id, 'CESQROO', 'cesqroo', 'cesqroo', '{
  "sections": ["Abierta", "Especial"],
  "section_fallback": ["Libre"],
  "rider_points_heights": ["40cm", "60cm", "75cm"],
  "rider_points_section": "Abierta",
  "scopes": {
    "mini_series": { "basis": "class",      "eligibility": "circuit", "per_day_cap": "first_class" },
    "season":      { "basis": "registered", "eligibility": "circuit", "per_day_cap": "first_class" }
  }
}'::jsonb
from public.regions r where r.slug = 'centro'
on conflict (slug) do nothing;

insert into public.series (region_id, name, slug, subdomain, standings_config)
select r.id, 'Copa Refugio', 'coparefugio', 'coparefugio', '{
  "sections": ["Abierta", "Especial"],
  "section_fallback": ["Libre"],
  "scopes": {
    "mini_series": { "basis": "class", "eligibility": "all", "per_day_cap": "none" },
    "season":      { "basis": "class", "eligibility": "all", "per_day_cap": "none" }
  }
}'::jsonb
from public.regions r where r.slug = 'centro'
on conflict (slug) do nothing;

-- ---------- 3) REGION SCOPING on identity + show catalogs ------------
alter table public.clubs       add column if not exists region_id uuid references public.regions(id);
alter table public.riders      add column if not exists region_id uuid references public.regions(id);
alter table public.horses      add column if not exists region_id uuid references public.regions(id);
alter table public.coaches     add column if not exists region_id uuid references public.regions(id);
alter table public.grooms      add column if not exists region_id uuid references public.regions(id);
alter table public.show_clubs  add column if not exists region_id uuid references public.regions(id);
alter table public.show_riders add column if not exists region_id uuid references public.regions(id);
alter table public.show_horses add column if not exists region_id uuid references public.regions(id);

-- Backfill EVERYTHING that exists today to Centro (commingled, as desired).
update public.clubs       set region_id = (select id from public.regions where slug='centro') where region_id is null;
update public.riders      set region_id = (select id from public.regions where slug='centro') where region_id is null;
update public.horses      set region_id = (select id from public.regions where slug='centro') where region_id is null;
update public.coaches     set region_id = (select id from public.regions where slug='centro') where region_id is null;
update public.grooms      set region_id = (select id from public.regions where slug='centro') where region_id is null;
update public.show_clubs  set region_id = (select id from public.regions where slug='centro') where region_id is null;
update public.show_riders set region_id = (select id from public.regions where slug='centro') where region_id is null;
update public.show_horses set region_id = (select id from public.regions where slug='centro') where region_id is null;

-- ---------- 4) SERIES GROUPING on events -----------------------------
alter table public.events add column if not exists series_id uuid references public.series(id);

-- Heuristic assignment: anything mentioning "refugio" -> Copa Refugio, else
-- CESQROO. REVIEW the result (see the SELECT in the plan) and correct any
-- event by hand before relying on standings. series_id is reversible.
update public.events e
set series_id = s.id
from public.series s
where s.slug = case
    when e.slug ilike '%refugio%' or e.name ilike '%refugio%' then 'coparefugio'
    else 'cesqroo'
  end
  and e.series_id is null;

-- ---------- 4b) Row Level Security -----------------------------------
--  Match the existing event tables: RLS ENABLED with NO public policies.
--  All access is server-side via the service-role key (supabaseAdmin), which
--  bypasses RLS, so the anon key cannot read or write these tables directly.
--  (regions/series hold only config: names, subdomains, branding, point rules.)
alter table public.regions enable row level security;
alter table public.series  enable row level security;

-- ---------- 5) Indexes -----------------------------------------------
create index if not exists clubs_region_idx       on public.clubs(region_id);
create index if not exists riders_region_idx      on public.riders(region_id);
create index if not exists horses_region_idx      on public.horses(region_id);
create index if not exists show_clubs_region_idx  on public.show_clubs(region_id);
create index if not exists show_riders_region_idx on public.show_riders(region_id);
create index if not exists show_horses_region_idx on public.show_horses(region_id);
create index if not exists events_series_idx       on public.events(series_id);

commit;
