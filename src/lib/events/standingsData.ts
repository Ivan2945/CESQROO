// Server-side bridge: load an event's classes/results from Supabase, attach the
// per-binomio registration flag + a stable binomio key, resolve the series'
// standings rules for a given SCOPE, and run the pure standings engine.
//
//   scope "mini_series" : one event, both days  -> Sunday awards
//   scope "season"      : every event in a series -> season title
//
// A series' standings_config holds shared sections + a rule per scope, e.g.
//   { sections:["Abierta","Especial"], section_fallback:["Libre"],
//     scopes:{ mini_series:{basis:"class",per_day_cap:"first_class"},
//              season:{basis:"registered",per_day_cap:"first_class"} } }

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { classFormatFromSetup, defaultFormatForHeight, formatHasSecondRound } from "@/lib/scoring/portal";
import { parseFaultShorthand, hasFallMarker } from "@/lib/scoring/faults";
import {
  computeStandings,
  type ClassForStandings,
  type StandingsRule,
  type StandingEntryInput,
  type Championship,
} from "@/lib/scoring/standings";
import type { Status } from "@/lib/scoring/types";

const num = (v: number | null | undefined) => (v == null ? null : Number(v));

export type Scope = "mini_series" | "season";

type ScopeRule = { basis: StandingsRule["basis"]; eligibility?: StandingsRule["eligibility"]; per_day_cap: StandingsRule["per_day_cap"] };
type SeriesStandingsConfig = {
  sections?: string[];
  section_fallback?: string[];
  rider_points_heights?: string[]; // heights whose Abierta scores by rider
  rider_points_section?: string;
  scopes?: Partial<Record<Scope, ScopeRule>>;
};

// Defaults when an event has no series yet (e.g. before the migration runs):
// class basis, Abierta+Especial separate, Libre fallback, no cap.
const DEFAULT_SECTIONS = ["Abierta", "Especial"];
const DEFAULT_FALLBACK = ["Libre"];
function resolveRule(cfg: SeriesStandingsConfig | null | undefined, scope: Scope): StandingsRule {
  const s = cfg?.scopes?.[scope];
  return {
    basis: s?.basis ?? "class",
    eligibility: s?.eligibility ?? "all",
    per_day_cap: s?.per_day_cap ?? "none",
    sections: cfg?.sections ?? DEFAULT_SECTIONS,
    section_fallback: cfg?.section_fallback ?? DEFAULT_FALLBACK,
    rider_points_heights: cfg?.rider_points_heights ?? [],
    rider_points_section: cfg?.rider_points_section ?? "Abierta",
  };
}

// Per-EVENT override (stored on event.config.standings). Lets an admin pick the
// method per scope, or turn a scope off. A standalone show = both scopes off.
export type EventScopeOverride = { enabled?: boolean; basis?: StandingsRule["basis"]; eligibility?: StandingsRule["eligibility"]; per_day_cap?: StandingsRule["per_day_cap"] };
export type EventStandingsCfg = { mini_series?: EventScopeOverride; season?: EventScopeOverride; rider_points_heights?: string[] };

// Effective rule + whether the scope is active for this event:
// event override beats series default; a scope is on if the event enables it,
// or (unset) if the series defines that scope.
function effectiveRule(
  seriesCfg: SeriesStandingsConfig | null,
  eventCfg: EventStandingsCfg | undefined,
  scope: Scope
): { rule: StandingsRule; enabled: boolean } {
  const base = resolveRule(seriesCfg, scope);
  const ov = eventCfg?.[scope];
  return {
    rule: {
      ...base,
      basis: ov?.basis ?? base.basis,
      eligibility: ov?.eligibility ?? base.eligibility,
      per_day_cap: ov?.per_day_cap ?? base.per_day_cap,
      rider_points_heights: eventCfg?.rider_points_heights ?? base.rider_points_heights,
    },
    enabled: ov?.enabled ?? seriesCfg?.scopes?.[scope] != null,
  };
}

export type EventStandings = {
  title: string;
  seriesName: string | null;
  scope: Scope;
  rule: StandingsRule;
  enabled: boolean; // false = this show doesn't award points for this scope
  championships: Championship[];
};

type ResultRow = {
  entry_id: string;
  height: string;
  day: string;
  r1_faults: string | null;
  r1_time: number | null;
  r1_status: string | null;
  r2_faults: string | null;
  r2_time: number | null;
  r2_status: string | null;
};

const hasResult = (r: ResultRow | undefined): r is ResultRow =>
  !!r && (r.r1_time != null || (!!r.r1_faults && r.r1_faults !== "") || (!!r.r1_status && r.r1_status !== "OK"));

// series table may not exist pre-migration -> fall back to defaults.
async function resolveSeries(seriesId: string | null | undefined): Promise<{ name: string | null; cfg: SeriesStandingsConfig | null }> {
  if (!seriesId) return { name: null, cfg: null };
  const { data, error } = await supabaseAdmin.from("series").select("name, standings_config").eq("id", seriesId).maybeSingle();
  if (error || !data) return { name: null, cfg: null };
  return { name: data.name as string, cfg: (data.standings_config as SeriesStandingsConfig) ?? null };
}

async function loadClasses(eventIds: string[]): Promise<ClassForStandings[]> {
  if (!eventIds.length) return [];

  const [{ data: ent }, { data: setups }, { data: results }] = await Promise.all([
    supabaseAdmin
      .from("event_entries")
      .select("id, event_id, rider_id, horse_id, rider_name, horse_name, height, section, days, status, club_id, circuit")
      .in("event_id", eventIds),
    supabaseAdmin.from("event_class_setup").select("event_id, height, day, format, params, start_order").in("event_id", eventIds),
    supabaseAdmin
      .from("event_results")
      .select("entry_id, event_id, height, day, r1_faults, r1_time, r1_status, r2_faults, r2_time, r2_status")
      .in("event_id", eventIds),
  ]);

  const { data: evRows } = await supabaseAdmin.from("events").select("id, config").in("id", eventIds);
  const evConfig = new Map((evRows ?? []).map((e) => [e.id, normalizeConfig(e.config)]));

  const entries = (ent ?? []).filter((e) => (e.status ?? "active") !== "cancelled");

  const clubIds = [...new Set(entries.map((e) => e.club_id).filter(Boolean))] as string[];
  const { data: clubRows } = clubIds.length
    ? await supabaseAdmin.from("show_clubs").select("id, name").in("id", clubIds)
    : { data: [] as { id: string; name: string }[] };
  const clubName = new Map((clubRows ?? []).map((c) => [c.id, c.name]));

  const setupOf = (eid: string, h: string, d: string) => (setups ?? []).find((s) => s.event_id === eid && s.height === h && s.day === d);
  const resByKey = new Map((results ?? []).map((r) => [`${r.entry_id}|${r.height}|${r.day}`, r as ResultRow]));

  const classes: ClassForStandings[] = [];
  for (const eid of eventIds) {
    const cfg = evConfig.get(eid);
    if (!cfg) continue;
    // Chronological class order within a day ≈ its height's position in the
    // configured heights list (low → high). Adjust if a day runs heights in a
    // different order.
    const heightOrder = (h: string) => {
      const i = cfg.heights.indexOf(h);
      return i < 0 ? 999 : i;
    };
    const evEntries = entries.filter((e) => e.event_id === eid);

    for (const day of cfg.days) {
      for (const height of cfg.heights) {
        const inClass = evEntries.filter((e) => e.height === height && (Array.isArray(e.days) ? e.days : []).includes(day));
        if (!inClass.length) continue;

        const setup = setupOf(eid, height, day);
        const fmtKind = setup?.format || defaultFormatForHeight(height);
        const fmt = classFormatFromSetup(fmtKind, (setup?.params ?? {}) as Record<string, number>);
        const hasR2 = formatHasSecondRound(fmtKind);

        // Running order within the class -> "first horse" tie-break for the cap.
        const startNoOf = new Map<string, number>();
        for (const o of (setup?.start_order ?? []) as { entry_id: string; no: number | string }[]) {
          const n = typeof o.no === "number" ? o.no : parseInt(String(o.no), 10);
          if (!Number.isNaN(n)) startNoOf.set(o.entry_id, n);
        }

        const inputs: StandingEntryInput[] = [];
        for (const e of inClass) {
          const r = resByKey.get(`${e.id}|${height}|${day}`);
          if (!hasResult(r)) continue;
          inputs.push({
            id: e.id,
            section: e.section || "—",
            r1: {
              faults: parseFaultShorthand(r.r1_faults),
              timeSec: r.r1_status === "NP" ? null : num(r.r1_time),
              fell: hasFallMarker(r.r1_faults),
              status: (r.r1_status || "OK") as Status,
            },
            r2: hasR2
              ? { faults: parseFaultShorthand(r.r2_faults), timeSec: num(r.r2_time), fell: hasFallMarker(r.r2_faults), status: (r.r2_status || "OK") as Status }
              : null,
            binomioKey: `${e.rider_id ?? `name:${e.rider_name}`}::${e.horse_id ?? `name:${e.horse_name}`}`,
            riderKey: `${e.rider_id ?? `name:${e.rider_name}`}`,
            startNo: startNoOf.get(e.id),
            circuit: !!e.circuit,
            rider: e.rider_name,
            horse: e.horse_name,
            club: e.club_id ? clubName.get(e.club_id) || "" : "",
          });
        }
        if (!inputs.length) continue;
        classes.push({ eventId: eid, height, day, order: heightOrder(height), format: fmt, entries: inputs });
      }
    }
  }
  return classes;
}

// MINI-SERIES: a single event's two days combined (default), or any scope.
export async function getEventStandings(eventId: string, scope: Scope = "mini_series"): Promise<EventStandings> {
  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", eventId).single();
  if (!event) throw new Error("Evento no encontrado.");

  const { name: seriesName, cfg } = await resolveSeries((event as { series_id?: string }).series_id);
  const eventCfg = ((event.config ?? {}) as { standings?: EventStandingsCfg }).standings;
  const { rule, enabled } = effectiveRule(cfg, eventCfg, scope);
  const classes = enabled ? await loadClasses([eventId]) : [];
  return { title: event.name as string, seriesName, scope, rule, enabled, championships: enabled ? computeStandings(classes, rule) : [] };
}

// SEASON: every event in a series, under the season rule — excluding events that
// opted out of that scope (event.config.standings[scope].enabled === false).
export async function getSeriesStandings(seriesId: string, scope: Scope = "season"): Promise<EventStandings> {
  const { name: seriesName, cfg } = await resolveSeries(seriesId);
  const rule = resolveRule(cfg, scope);
  const enabled = cfg?.scopes?.[scope] != null;
  const { data: evs } = await supabaseAdmin.from("events").select("id, config").eq("series_id", seriesId);
  const includeIds = (evs ?? [])
    .filter((e) => (((e.config ?? {}) as { standings?: EventStandingsCfg }).standings?.[scope]?.enabled ?? true) !== false)
    .map((e) => e.id);
  const classes = enabled ? await loadClasses(includeIds) : [];
  return { title: seriesName ?? "Serie", seriesName, scope, rule, enabled, championships: enabled ? computeStandings(classes, rule) : [] };
}
