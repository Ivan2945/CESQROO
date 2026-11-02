import { supabaseAdmin } from "@/lib/supabase/admin";
import { showClubIdsForClub } from "@/lib/auth/eventAccess";
import { npDaysFromResults } from "@/lib/events/billing";
import { summarizeCounts, type CountItem, type CountSummary } from "@/lib/events/uniqueCounts";

type CountEntry = {
  id: string;
  event_id: string;
  height: string;
  days: string[] | null;
  status: string | null;
  rider_id: string | null;
  rider_name: string | null;
  horse_id: string | null;
  horse_name: string | null;
};
type NpRow = { entry_id: string; height: string; day: string; r1_status: string | null };

const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function participationCounts(eventIds: string[], clubId?: string | null): Promise<Map<string, CountSummary>> {
  const counts = new Map<string, CountSummary>();
  if (!eventIds.length) return counts;

  const clubIds = clubId ? await showClubIdsForClub(clubId) : null;
  const entries = await fetchAll<CountEntry>((from, to) => {
    let q = supabaseAdmin
      .from("event_entries")
      .select("id, event_id, height, days, status, rider_id, rider_name, horse_id, horse_name")
      .in("event_id", eventIds)
      .order("id")
      .range(from, to);
    if (clubIds) q = q.in("club_id", clubIds);
    return q;
  });

  const npRaw = entries.length
    ? await fetchAll<NpRow>((from, to) =>
        supabaseAdmin
          .from("event_results")
          .select("entry_id, height, day, r1_status")
          .in("event_id", eventIds)
          .eq("r1_status", "NP")
          .order("entry_id")
          .range(from, to)
      )
    : [];
  const heightById = new Map(entries.map((e) => [e.id, e.height]));
  const npDays = npDaysFromResults(npRaw.filter((r) => r.height === heightById.get(r.entry_id)));

  const items = new Map<string, CountItem[]>();
  for (const e of entries) {
    if ((e.status ?? "active") === "cancelled") continue;
    const days = Array.isArray(e.days) && e.days.length ? e.days : [""];
    const np = npDays.get(e.id);
    const starts = days.filter((d) => !(np?.has(d) ?? false)).length;
    const arr = items.get(e.event_id) ?? [];
    arr.push({ riderId: e.rider_id, riderName: e.rider_name, horseId: e.horse_id, horseName: e.horse_name, starts });
    items.set(e.event_id, arr);
  }
  for (const [eventId, arr] of items) counts.set(eventId, summarizeCounts(arr));
  return counts;
}
