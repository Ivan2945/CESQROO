# Multi-Circuit Plan — cesqroo-portal

How to split the portal into per-circuit public sites + a shared admin, sharing a rider/horse/club pool by default but able to isolate (e.g. a future Puebla circuit), and how championship points work per circuit.

Grounded in the **live schema** (project `mgynqookxoaluoanolew`, read June 16 2026). Supersedes the earlier `Web App/MIGRATION-PLAN.md`, which was written against a stale prototype and should be ignored.

---

## 1. What you already have

The portal is more built-out than a greenfield plan would assume. Two identity tiers plus an event/results layer:

**Master catalog (permanent, club-owned)** — `clubs` → `riders` / `horses` (with `rider_horses` binomios), plus `coaches`, `grooms`, `horse_tests` (+archive/ocr), `payments`, `profiles`, `club_memberships`, and billing views (`v_club_balance`, …). In your wording this is the **circuit** catalog: registered championship competitors, where points accrue.

**Show catalog (per-show entrants)** — `show_clubs` / `show_riders` / `show_horses`. Everyone who signs up for an event, championship or not. Each links back to the master via `circuit_club_id` / `circuit_rider_id` / `circuit_horse_id` when that entrant is a registered circuit competitor.

**Event layer** — `events` (name, slug, dates, `is_open`, `config`, `day_state`) → `event_submissions` → `event_entries` (FKs to `show_*`, name snapshots, height, section, `days[]`, `circuit`/`discount` flags, `is_extemp`) → `event_results` (per round r1/r2 faults/time/status, `client_updated_at` for offline sync). `event_class_setup` holds per-class format/params/start order.

The scoring engine in `src/lib/scoring/points.ts` already computes per-class section points.

> Terminology trap: your DB already uses **"circuit"** for the master catalog. So the new competition-grouping layer (CESQROO, Copa Refugio) is named **series**, never "circuit", to avoid colliding with the existing `circuit_*_id` columns.

---

## 2. Target model

Two new concepts layered on top — nothing existing is rebuilt:

```
Region            ← identity isolation boundary (scopes the master + show catalogs)
  └─ Series        ← a championship: subdomain + branding + standings rules
       └─ Event    ← unchanged; gains series_id
            └─ event_entries → event_results   (unchanged)
```

- **Region** scopes *identity* — `riders` / `horses` / `clubs` (+ dependents, + `show_*`). CESQROO and Copa Refugio both sit in Region **Centro** and therefore share one pool (exactly today's behaviour). A future **Puebla** region is a separate `region_id`, so a same-named "Juan Pérez / Trueno" there is a distinct identity and never mixes into Centro's public views. Because it's one DB with a column, merging/splitting regions later is a data migration, not a rebuild.
- **Series** is the championship — CESQROO, Copa Refugio — and is what a public subdomain maps to and what owns standings. A series belongs to a region.

| Your term | In the schema |
|---|---|
| Region (Centro / Puebla) | new `regions` + `region_id` on catalogs |
| Circuit / championship (CESQROO, Copa Refugio) | new `series` + `events.series_id` |
| Registered circuit rider | existing master `riders` row (via `show_riders.circuit_rider_id`) |
| Show entrant | existing `show_riders` / `event_entries` |

---

## 3. What happens to existing data

Additive only — every row keeps its primary key:

- **events** (incl. the show you ran this weekend and the Copa Refugio fechas): kept, gain `series_id`.
- **event_submissions / event_entries**: untouched.
- **event_results** (your live scoring): **untouched** — keyed by `entry_id`/`event_id`, which don't change.
- **Master + show catalogs**: gain `region_id`, all backfilled to **Centro**. No rows move.
- **`merge_*` functions, billing views, RLS**: unaffected by added columns.

Nothing is dropped. The migration labels your data; it doesn't move or delete it.

---

## 4. Championship points (per-series standings)

Standings are **computed on demand** from `event_results` (no stored totals), grouped by series. The base per-class math is already in `src/lib/scoring/points.ts` and is unchanged:

- **≤20 starters:** 1st = 21, 2nd = 19, then −1/place (3rd = 18 … 20th = 1, 21st = 0).
- **>20 starters:** 1st = `starters + 1`; place *r* ≥ 2 = `starters + 1 − r`.
- **Ties** share the average of their places. **Starters** = all except NP (EL/RT count; FC/T and non-placers score 0).
- Points are on the **section placing**; a series total is the **sum of all participations** (no drops).

What's **per-series** (stored in `series.standings_config`):

| Rule | CESQROO | Copa Refugio |
|---|---|---|
| Eligibility | Registered riders only | All entries in Abierta |
| Scoring basis | **Registered ranking** (re-rank registered, award on that) | **Class ranking** (placing in the full section) |
| Championship grouping | One per height, Abierta section (→ Libre if no Abierta) | Same |
| Per-day cap | **First class of the day** (chronologically) | **None** |
| Roll-up | Sum all participations | Sum all participations |

Two standings *scopes*, same engine, different grouping:

- **Mini-series** (per show, Saturday + Sunday combined) — needed to hand out **Sunday awards**. Not published publicly; just computed.
- **Season** (across all fechas of a series) — same computation at a wider scope, for later.

### Engine work this implies

`points.ts` already covers **class ranking** + the scale + ties + the >20 rule. To support the above we add:

1. **Registered-ranking basis** (CESQROO): before scoring a section, filter to registered binomios, recompute placings among them, then award. New variant alongside the existing `sectionPoints`.
2. **Per-day cap** (CESQROO = first class of the day): when aggregating, for each binomio per day keep only their first class's points. Driven by `standings_config.per_day_cap`.
3. **Series aggregation** wrappers: group the existing per-class maps by (series, height, section) at mini-series (one event, both days) and season (all events) scope.

All of this reads existing `event_results` — no schema dependency beyond `events.series_id`.

---

## 5. The migration

The runnable SQL is in **`supabase/multi_circuit.sql`** — additive and re-runnable (create-if-not-exists, add-column-if-not-exists, on-conflict-do-nothing, null-guarded backfills, wrapped in a transaction). It:

1. Creates `regions`, seeds **Centro**.
2. Creates `series`, seeds **CESQROO** and **Copa Refugio** under Centro with the `standings_config` above.
3. Adds `region_id` to `clubs/riders/horses/coaches/grooms/show_clubs/show_riders/show_horses` and backfills all to Centro.
4. Adds `events.series_id` and assigns events by a name heuristic (`%refugio%` → Copa Refugio, else CESQROO).
5. Adds supporting indexes.

### Confirm before relying on it

**Event → series assignment is a heuristic.** Review it first — list your events and their guessed series:

```sql
select e.name, e.slug, s.name as series
from public.events e
left join public.series s on s.id = e.series_id
order by e.created_at;
```

Fix any misassigned event by hand (reversible — it's just a column):

```sql
update public.events set series_id = (select id from public.series where slug = 'cesqroo')
where slug = '<the-event-slug>';
```

In particular, confirm which series **the show you ran this weekend** belongs to.

### Run it safely

Run on a **Supabase branch or a backup first**, verify with the SELECT above and a few spot checks, then apply to production. It's wrapped in `begin/commit`, so a failure rolls back cleanly.

---

## 6. Subdomains

You already serve `cesqroo.lacompe.digital`. Map each series to its subdomain via `series.subdomain`, resolved in middleware (host → series → region), and scope public queries by that series/region. `app.lacompe.digital` stays the shared admin across all regions (you already have an `admin/` section and `profiles.role`). `series.branding` lets each public site skin itself without a code fork. A future `puebla.lacompe.digital` is just another series row in a new region.

---

## 7. Suggested order

1. **Migration** (`multi_circuit.sql`) on a branch → verify event→series → apply. *(Structural, low risk.)*
2. **Subdomain routing** for `coparefugio.` + series branding.
3. **Standings engine**: registered-ranking basis + per-day cap + mini-series aggregation → Sunday awards for CESQROO/Copa Refugio.
4. **Season standings** view across fechas (same engine).
5. Later: a real Puebla region when you run that circuit.
