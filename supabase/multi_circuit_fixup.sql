-- =====================================================================
--  Multi-circuit FIX-UP — run once if you applied the earlier version of
--  multi_circuit.sql (which seeded an older standings_config shape and had
--  no RLS on regions/series). Safe + idempotent.
-- =====================================================================
begin;

-- 1) RLS to match the event tables (enabled, no public policies; all access
--    is server-side via the service-role key).
alter table public.regions enable row level security;
alter table public.series  enable row level security;

-- 2) Update the seeded series to the CURRENT standings_config shape the engine
--    reads: shared sections + per-scope rule + rider-scored heights.
update public.series set standings_config = '{
  "sections": ["Abierta", "Especial"],
  "section_fallback": ["Libre"],
  "rider_points_heights": ["40cm", "60cm", "75cm"],
  "rider_points_section": "Abierta",
  "scopes": {
    "mini_series": { "basis": "class",      "per_day_cap": "first_class" },
    "season":      { "basis": "registered", "per_day_cap": "first_class" }
  }
}'::jsonb
where slug = 'cesqroo';

update public.series set standings_config = '{
  "sections": ["Abierta", "Especial"],
  "section_fallback": ["Libre"],
  "scopes": {
    "mini_series": { "basis": "class", "per_day_cap": "none" },
    "season":      { "basis": "class", "per_day_cap": "none" }
  }
}'::jsonb
where slug = 'coparefugio';

commit;

-- 3) REVIEW the event → series assignment (correct any by hand):
--    select e.name, e.slug, s.name as series
--    from public.events e left join public.series s on s.id = e.series_id
--    order by e.created_at;
