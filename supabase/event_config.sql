-- =====================================================================
--  Event Sign-Up — make events configurable (run AFTER event_signup.sql)
--  Adds events.config (jsonb) and moves entry days to a flexible array.
-- =====================================================================

-- ---------- 1) Per-event configuration --------------------------------
alter table public.events
  add column if not exists config jsonb not null default '{}'::jsonb;

-- ---------- 2) event_entries: days array replaces sat/sun booleans -----
alter table public.event_entries
  add column if not exists days text[] not null default '{}';

-- Backfill the new array from the old booleans (only if they still exist)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_entries' and column_name = 'saturday'
  ) then
    update public.event_entries
      set days = array_remove(array[
        case when saturday then 'Sábado' end,
        case when sunday   then 'Domingo' end
      ], null);
  end if;
end $$;

alter table public.event_entries drop constraint if exists event_entry_at_least_one_day;
alter table public.event_entries drop column if exists saturday;
alter table public.event_entries drop column if exists sunday;

alter table public.event_entries drop constraint if exists event_entry_has_day;
alter table public.event_entries
  add constraint event_entry_has_day check (cardinality(days) >= 1);

-- ---------- 3) Seed the current event's configuration ------------------
-- Heights now include 90cm. sectionsByHeight is listed for every height so
-- the rules are explicit (any height NOT listed defaults to "all sections").
update public.events
set config = '{
  "heights": ["Cruces","40cm","60cm","75cm","80cm","90cm","1m","1.10m","1.20m","1.30m"],
  "sections": ["Abierta","Libre","Especial","Exhibición"],
  "sectionsByHeight": {
    "Cruces": ["Exhibición","Abierta","Libre"],
    "40cm":  ["Abierta","Libre"],
    "60cm":  ["Abierta","Libre","Especial"],
    "75cm":  ["Abierta","Libre"],
    "80cm":  ["Abierta","Libre","Especial"],
    "90cm":  ["Abierta","Libre"],
    "1m":    ["Abierta","Libre"],
    "1.10m": ["Abierta","Libre"],
    "1.20m": ["Abierta","Libre"],
    "1.30m": ["Abierta","Libre"]
  },
  "days": ["Sábado","Domingo"],
  "fields": { "circuit": true, "discount": true }
}'::jsonb
where slug = 'concurso-salto';
