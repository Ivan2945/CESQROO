import { supabaseAdmin } from "@/lib/supabase/admin";
import { npDaysFromResults } from "@/lib/events/billing";

type CountEntry = { id: string; event_id: string; height: string; days: string[] | null; status: string | null };
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

export async function participationCounts(eventIds: string[], clubId?: string | null): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!eventIds.length) return counts;

  const entries = await fetchAll<CountEntry>((from, to) => {
    let q = supabaseAdmin
      .from("event_entries")
      .select("id, event_id, height, days, status")
      .in("event_id", eventIds)
      .order("id")
      .range(from, to);
    if (clubId) q = q.eq("club_id", clubId);
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

  for (const e of entries) {
    if ((e.status ?? "active") === "cancelled") continue;
    const days = Array.isArray(e.days) && e.days.length ? e.days : [""];
    const np = npDays.get(e.id);
    const n = days.filter((d) => !(np?.has(d) ?? false)).length;
    counts.set(e.event_id, (counts.get(e.event_id) ?? 0) + n);
  }
  return counts;
}
