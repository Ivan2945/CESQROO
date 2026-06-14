import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeConfig } from "@/lib/events/config";
import { computeStatement, npDaysFromResults, type BillingEntry } from "@/lib/events/billing";
import { buildStatementsPdf, type StatementClub } from "@/lib/events/exportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isAdminUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return !!isAdmin;
}

function safeFilename(s: string) {
  return s.replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim() || "estado-de-cuenta";
}

type SubRow = {
  id: string;
  club_name: string;
  representative: string | null;
  coach: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type EntryRow = BillingEntry & {
  id: string;
  submission_id: string;
  horse_name: string;
  discount: boolean;
  status: string | null;
  is_extemp: boolean | null;
};

// GET /api/events/[slug]/billing-pdf[?submission=<id>]  (admin only)
// No submission param -> all clubs, one page each.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdminUser())) {
    return Response.json({ error: "Solo un administrador puede exportar." }, { status: 403 });
  }
  const { slug } = await params;
  const submissionId = new URL(req.url).searchParams.get("submission");

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, name, config, saturday_date, sunday_date, pdf_logo")
    .eq("slug", slug)
    .single();
  if (!event) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
  const config = normalizeConfig(event.config);

  // Header date line, e.g. "13 - 14 de Junio de 2026".
  const part = (dstr: string) => {
    const dt = new Date(dstr + "T00:00:00");
    const month = dt.toLocaleDateString("es-MX", { month: "long" });
    return { day: dt.getDate(), month: month.charAt(0).toUpperCase() + month.slice(1), year: dt.getFullYear() };
  };
  const datesText = (() => {
    const sat = event.saturday_date as string | null;
    const sun = event.sunday_date as string | null;
    try {
      if (sat && sun) {
        const a = part(sat);
        const b = part(sun);
        if (a.month === b.month && a.year === b.year) return `${a.day} - ${b.day} de ${a.month} de ${a.year}`;
        if (a.year === b.year) return `${a.day} de ${a.month} - ${b.day} de ${b.month} de ${a.year}`;
        return `${a.day} de ${a.month} de ${a.year} - ${b.day} de ${b.month} de ${b.year}`;
      }
      const one = sat || sun;
      if (!one) return "";
      const a = part(one);
      return `${a.day} de ${a.month} de ${a.year}`;
    } catch {
      return "";
    }
  })();

  let subQuery = supabaseAdmin
    .from("event_submissions")
    .select("id, club_name, representative, coach, phone, email, created_at")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false });
  if (submissionId) subQuery = subQuery.eq("id", submissionId);
  const { data: subs } = await subQuery;
  const submissions = (subs as SubRow[]) ?? [];
  if (submissions.length === 0) {
    return Response.json({ error: "No hay inscripciones para exportar." }, { status: 404 });
  }

  const subIds = submissions.map((s) => s.id);
  const { data: ent } = await supabaseAdmin
    .from("event_entries")
    .select("id, submission_id, rider_id, rider_name, horse_name, height, section, days, circuit, discount, status, is_extemp")
    .in("submission_id", subIds)
    .order("created_at", { ascending: true });
  const entries = (ent as EntryRow[]) ?? [];

  // No-shows (NP) bill like a per-day cancellation.
  const { data: npRows } = await supabaseAdmin
    .from("event_results")
    .select("entry_id, day, r1_status")
    .eq("event_id", event.id)
    .eq("r1_status", "NP");
  const npDaysByEntry = npDaysFromResults(npRows);

  const bySub = new Map<string, EntryRow[]>();
  entries.forEach((e) => {
    const arr = bySub.get(e.submission_id) ?? [];
    arr.push(e);
    bySub.set(e.submission_id, arr);
  });

  const clubs: StatementClub[] = submissions.map((s) => {
    const rows = bySub.get(s.id) ?? [];
    const contact = [
      s.representative && `Rep: ${s.representative}`,
      s.coach && `Coach: ${s.coach}`,
      s.phone,
      s.email,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      clubName: (s.club_name ?? "").toUpperCase(),
      contact,
      rows: rows.map((r) => ({
        rider: (r.rider_name ?? "").toUpperCase(),
        horse: (r.horse_name ?? "").toUpperCase(),
        height: r.height,
        section: r.section,
        days: r.days,
        circuit: r.circuit,
        discount: r.discount,
        status: r.status,
        is_extemp: r.is_extemp,
      })),
      stmt: computeStatement(rows, config, npDaysByEntry),
    };
  });

  const pdf = await buildStatementsPdf({
    eventName: event.name,
    title: config.header.title || event.name,
    subtitle: config.header.subtitle || "",
    datesText,
    logo: event.pdf_logo ?? null,
    clubs,
  });

  const namePart = submissionId && submissions.length === 1 ? submissions[0].club_name : "Todos los clubes";
  const filename = `Estado de Cuenta - ${safeFilename(event.name)} - ${safeFilename(namePart)}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
