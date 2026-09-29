"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EventConfig, EventStandingsConfig } from "@/lib/events/config";
import { saveEventConfigAction } from "./actions";

type ScopeMode = "inherit" | "on" | "off";

const card = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";
const input =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const h2 = "text-base font-semibold text-slate-900";

// Editable ordered list of strings (used for heights, sections, days).
function ListEditor({
  title,
  hint,
  items,
  onChange,
}: {
  title: string;
  hint?: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return (
    <div>
      <h3 className={h2}>{title}</h3>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <div key={it} className="flex items-center gap-2">
            <span className="flex-1 rounded-md bg-slate-50 px-3 py-1.5 text-sm text-slate-800">{it}</span>
            <button type="button" onClick={() => move(i, -1)} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">↑</button>
            <button type="button" onClick={() => move(i, 1)} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">↓</button>
            <button type="button" onClick={() => remove(i)} className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Eliminar</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">Sin elementos.</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className={input + " flex-1"}
          value={draft}
          placeholder="Agregar…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add} className="rounded-lg bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100">
          Agregar
        </button>
      </div>
    </div>
  );
}

export default function ConfigEditor({
  eventId,
  eventSlug,
  initialName,
  initialIsOpen,
  initialSaturdayDate,
  initialSundayDate,
  initialPdfLogo,
  initialConfig,
  initialSeriesId,
  regions,
  series,
}: {
  eventId: string;
  eventSlug: string;
  initialName: string;
  initialIsOpen: boolean;
  initialSaturdayDate: string | null;
  initialSundayDate: string | null;
  initialPdfLogo: string | null;
  initialConfig: EventConfig;
  initialSeriesId: string | null;
  regions: { id: string; name: string }[];
  series: { id: string; name: string; region_id: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [saturdayDate, setSaturdayDate] = useState(initialSaturdayDate ?? "");
  const [sundayDate, setSundayDate] = useState(initialSundayDate ?? "");
  const [headerTitle, setHeaderTitle] = useState(initialConfig.header.title);
  const [headerSubtitle, setHeaderSubtitle] = useState(initialConfig.header.subtitle);
  const [pdfLogo, setPdfLogo] = useState(initialPdfLogo ?? "");
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [heights, setHeights] = useState<string[]>(initialConfig.heights);
  const [sections, setSections] = useState<string[]>(initialConfig.sections);
  const [days, setDays] = useState<string[]>(initialConfig.days);
  const [sectionsByHeight, setSectionsByHeight] = useState<Record<string, string[]>>(initialConfig.sectionsByHeight);
  const [sectionsByHeightDay, setSectionsByHeightDay] = useState<Record<string, Record<string, string[]>>>(initialConfig.sectionsByHeightDay);
  const [inactiveByDay, setInactiveByDay] = useState<Record<string, string[]>>(initialConfig.inactiveByDay);
  const [editDay, setEditDay] = useState<string>(initialConfig.days[0] ?? "");
  const [fields, setFields] = useState(initialConfig.fields);
  // Billing
  const [nominationFee, setNominationFee] = useState(String(initialConfig.pricing.nominationFee));
  const [entryFeeDefault, setEntryFeeDefault] = useState(String(initialConfig.pricing.entryFeeDefault));
  const [priceByHeight, setPriceByHeight] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const h of initialConfig.heights) {
      const v = initialConfig.pricing.entryFeeByHeight[h];
      o[h] = v != null ? String(v) : "";
    }
    return o;
  });
  const [nominationExempt, setNominationExempt] = useState<string[]>(initialConfig.pricing.nominationExempt);
  const [nominationBasis, setNominationBasis] = useState<"rider" | "pair">(initialConfig.pricing.nominationBasis);
  const [nominationExemptExcept, setNominationExemptExcept] = useState<Record<string, string[]>>(initialConfig.pricing.nominationExemptExcept);
  const [cancelMode, setCancelMode] = useState<"credit" | "fee" | "no_refund">(initialConfig.pricing.cancellation.mode);
  const [cancelFee, setCancelFee] = useState(String(initialConfig.pricing.cancellation.fee));
  const [discountMode, setDiscountMode] = useState<"percent" | "flat">(initialConfig.pricing.discount.mode);
  const [discountValue, setDiscountValue] = useState(String(initialConfig.pricing.discount.value));
  const [discountWaives, setDiscountWaives] = useState(initialConfig.pricing.discount.waivesNomination);
  const [extempSections, setExtempSections] = useState<string[]>(initialConfig.extempSections);
  // Region + circuit (series) assignment
  const initialRegionId = initialSeriesId ? series.find((s) => s.id === initialSeriesId)?.region_id ?? "" : "";
  const [regionId, setRegionId] = useState(initialRegionId);
  const [seriesId, setSeriesId] = useState(initialSeriesId ?? "");
  const seriesInRegion = series.filter((s) => s.region_id === regionId);
  function onRegionChange(id: string) {
    setRegionId(id);
    if (!series.some((s) => s.id === seriesId && s.region_id === id)) setSeriesId("");
  }
  // Standings (championship points) — per-event override
  const initSt = initialConfig.standings;
  const modeOf = (s?: { enabled?: boolean }): ScopeMode => (s?.enabled === true ? "on" : s?.enabled === false ? "off" : "inherit");
  const [miniMode, setMiniMode] = useState<ScopeMode>(modeOf(initSt?.mini_series));
  const [miniBasis, setMiniBasis] = useState<"class" | "registered">(initSt?.mini_series?.basis ?? "class");
  const [miniElig, setMiniElig] = useState<"all" | "circuit">(initSt?.mini_series?.eligibility ?? "all");
  const [miniCap, setMiniCap] = useState<"first_class" | "none">(initSt?.mini_series?.per_day_cap ?? "none");
  const [seasonMode, setSeasonMode] = useState<ScopeMode>(modeOf(initSt?.season));
  const [seasonBasis, setSeasonBasis] = useState<"class" | "registered">(initSt?.season?.basis ?? "registered");
  const [seasonElig, setSeasonElig] = useState<"all" | "circuit">(initSt?.season?.eligibility ?? "all");
  const [seasonCap, setSeasonCap] = useState<"first_class" | "none">(initSt?.season?.per_day_cap ?? "first_class");
  const [miniDays, setMiniDays] = useState<string[]>(initSt?.mini_series?.days ?? []);
  const [seasonDays, setSeasonDays] = useState<string[]>(initSt?.season?.days ?? []);
  const [riderOverride, setRiderOverride] = useState<boolean>(Array.isArray(initSt?.rider_points_heights));
  const [riderHeights, setRiderHeights] = useState<string[]>(initSt?.rider_points_heights ?? []);
  const toggleRiderHeight = (h: string) =>
    setRiderHeights((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const copyFeeToAll = () =>
    setPriceByHeight(() => Object.fromEntries(heights.map((h) => [h, entryFeeDefault])));
  const toggleExempt = (key: string) =>
    setNominationExempt((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const toggleExcept = (section: string, height: string) =>
    setNominationExemptExcept((prev) => {
      const cur = prev[section] ?? [];
      const next = cur.includes(height) ? cur.filter((h) => h !== height) : [...cur, height];
      const out = { ...prev };
      if (next.length) out[section] = next; else delete out[section];
      return out;
    });

  // Keep height/section keys in sync when those lists change
  function setHeightsSynced(next: string[]) {
    setHeights(next);
    setSectionsByHeight((prev) => {
      const out: Record<string, string[]> = {};
      for (const h of next) if (prev[h]) out[h] = prev[h];
      return out;
    });
  }
  function setSectionsSynced(next: string[]) {
    setSections(next);
    setSectionsByHeight((prev) => {
      const out: Record<string, string[]> = {};
      for (const h of Object.keys(prev)) {
        const kept = prev[h].filter((s) => next.includes(s));
        if (kept.length) out[h] = kept;
      }
      return out;
    });
    setSectionsByHeightDay((prev) => {
      const out: Record<string, Record<string, string[]>> = {};
      for (const d of Object.keys(prev)) {
        const perH: Record<string, string[]> = {};
        for (const h of Object.keys(prev[d])) {
          const kept = prev[d][h].filter((s) => next.includes(s));
          if (kept.length) perH[h] = kept;
        }
        if (Object.keys(perH).length) out[d] = perH;
      }
      return out;
    });
  }
  const isDayOverridden = (day: string, height: string) => Array.isArray(sectionsByHeightDay[day]?.[height]);
  function toggleDayOverride(day: string, height: string, on: boolean) {
    setSectionsByHeightDay((prev) => {
      const out = { ...prev };
      const perH = { ...(out[day] ?? {}) };
      if (on) perH[height] = [...(sectionsByHeight[height] ?? [])];
      else delete perH[height];
      if (Object.keys(perH).length) out[day] = perH;
      else delete out[day];
      return out;
    });
  }
  function toggleDaySection(day: string, height: string, section: string) {
    setSectionsByHeightDay((prev) => {
      const out = { ...prev };
      const perH = { ...(out[day] ?? {}) };
      const cur = perH[height] ?? [];
      const next = cur.includes(section) ? cur.filter((s) => s !== section) : [...cur, section];
      if (next.length) perH[height] = next;
      else delete perH[height];
      if (Object.keys(perH).length) out[day] = perH;
      else delete out[day];
      return out;
    });
  }
  // Column "Todos" for the per-day grid: set/clear a section for every active
  // prueba on that day, personalizing rows as needed.
  function setDaySectionForAll(day: string, section: string, check: boolean) {
    setSectionsByHeightDay((prev) => {
      const out = { ...prev };
      const perH = { ...(out[day] ?? {}) };
      for (const h of heights) {
        if (inactiveByDay[day]?.includes(h)) continue;
        const base = perH[h] !== undefined ? perH[h] : [...(sectionsByHeight[h] ?? [])];
        const next = check ? (base.includes(section) ? base : [...base, section]) : base.filter((s) => s !== section);
        if (next.length) perH[h] = next;
        else delete perH[h];
      }
      if (Object.keys(perH).length) out[day] = perH;
      else delete out[day];
      return out;
    });
  }
  const sectionsForHeightDayLocal = (day: string, height: string) => {
    const ov = sectionsByHeightDay[day]?.[height];
    return Array.isArray(ov) && ov.length ? ov : sectionsByHeight[height] ?? [];
  };
  const isActiveDay = (day: string, height: string) => !(inactiveByDay[day]?.includes(height) ?? false);
  function toggleActiveDay(day: string, height: string, active: boolean) {
    setInactiveByDay((prev) => {
      const out = { ...prev };
      const cur = out[day] ?? [];
      if (active) {
        const next = cur.filter((h) => h !== height);
        if (next.length) out[day] = next;
        else delete out[day];
      } else if (!cur.includes(height)) {
        out[day] = [...cur, height];
      }
      return out;
    });
  }
  const toggleSeriesDay = (scope: "mini" | "season", day: string) => {
    const setter = scope === "mini" ? setMiniDays : setSeasonDays;
    setter((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };
  function toggleHeightSection(height: string, section: string) {
    setSectionsByHeight((prev) => {
      const current = prev[height] ?? [];
      const nextArr = current.includes(section) ? current.filter((s) => s !== section) : [...current, section];
      const out = { ...prev };
      if (nextArr.length === 0) delete out[height];
      else out[height] = nextArr;
      return out;
    });
  }
  // Check/uncheck a section for every height at once (the column "Todos").
  function setSectionForAll(section: string, check: boolean) {
    setSectionsByHeight((prev) => {
      const out: Record<string, string[]> = { ...prev };
      for (const h of heights) {
        const cur = out[h] ?? [];
        if (check) {
          if (!cur.includes(section)) out[h] = [...cur, section];
        } else {
          const next = cur.filter((s) => s !== section);
          if (next.length) out[h] = next;
          else delete out[h];
        }
      }
      return out;
    });
  }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoErr(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setLogoErr("Use una imagen PNG o JPG.");
      return;
    }
    if (file.size > 1_500_000) {
      setLogoErr("La imagen es muy grande (máx ~1.5 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPdfLogo(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function buildStandings(): EventStandingsConfig | undefined {
    const out: EventStandingsConfig = {};
    const validMiniDays = miniDays.filter((d) => days.includes(d));
    const validSeasonDays = seasonDays.filter((d) => days.includes(d));
    if (miniMode !== "inherit") out.mini_series = miniMode === "on" ? { enabled: true, basis: miniBasis, eligibility: miniElig, per_day_cap: miniCap, ...(validMiniDays.length ? { days: validMiniDays } : {}) } : { enabled: false };
    if (seasonMode !== "inherit") out.season = seasonMode === "on" ? { enabled: true, basis: seasonBasis, eligibility: seasonElig, per_day_cap: seasonCap, ...(validSeasonDays.length ? { days: validSeasonDays } : {}) } : { enabled: false };
    if (riderOverride) out.rider_points_heights = riderHeights;
    return Object.keys(out).length ? out : undefined;
  }

  async function save() {
    setStatus(null);
    setSaving(true);
    const def = Number(entryFeeDefault) || 0;
    const entryFeeByHeight: Record<string, number> = {};
    for (const h of heights) {
      const v = Number(priceByHeight[h]);
      if (priceByHeight[h]?.trim() && Number.isFinite(v) && v !== def) entryFeeByHeight[h] = v;
    }
    const config: EventConfig = {
      heights,
      sections,
      sectionsByHeight,
      sectionsByHeightDay: Object.fromEntries(
        Object.entries(sectionsByHeightDay).filter(([d]) => days.includes(d)).map(([d, perH]) => [
          d,
          Object.fromEntries(Object.entries(perH).filter(([h]) => heights.includes(h) && perH[h].length)),
        ]).filter(([, perH]) => Object.keys(perH as Record<string, string[]>).length)
      ),
      inactiveByDay: Object.fromEntries(
        Object.entries(inactiveByDay)
          .filter(([d]) => days.includes(d))
          .map(([d, hs]) => [d, hs.filter((h) => heights.includes(h))])
          .filter(([, hs]) => (hs as string[]).length)
      ),
      days,
      fields,
      header: { title: headerTitle, subtitle: headerSubtitle },
      pricing: {
        nominationFee: Number(nominationFee) || 0,
        entryFeeDefault: def,
        entryFeeByHeight,
        nominationBasis,
        nominationExempt,
        // Keep exceptions only for sections that are still exempt sections.
        nominationExemptExcept: Object.fromEntries(
          Object.entries(nominationExemptExcept).filter(([s]) => nominationExempt.includes(s) && sections.includes(s))
        ),
        cancellation: { mode: cancelMode, fee: Number(cancelFee) || 0 },
        discount: { mode: discountMode, value: Number(discountValue) || 0, waivesNomination: discountWaives },
      },
      extempSections,
      standings: buildStandings(),
    };
    const res = await saveEventConfigAction(eventId, {
      name,
      isOpen,
      saturdayDate: saturdayDate || null,
      sundayDate: sundayDate || null,
      pdfLogo: pdfLogo || null,
      seriesId: seriesId || null,
      config,
    });
    setSaving(false);
    if (res && res.ok) {
      setStatus({ type: "ok", msg: res.message ?? "Guardado." });
      router.refresh();
    } else {
      setStatus({ type: "err", msg: res?.message ?? "No se pudo guardar." });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/admin/events/${eventId}`} className="text-sm text-blue-600 dark:text-blue-400">
          ← Volver al evento
        </Link>
        <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Configuración del evento</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Define qué campos y opciones aparecen en la hoja de inscripción pública.{" "}
          <span className="font-mono">/signup/{eventSlug}</span>
        </p>
      </div>

      {status && (
        <div
          className={
            "rounded-lg border px-4 py-3 text-sm font-semibold " +
            (status.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800")
          }
        >
          {status.msg}
        </div>
      )}

      {/* Event details */}
      <section className={card}>
        <h3 className={h2}>Evento</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Nombre</label>
            <input className={input + " w-full"} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" className="accent-blue-600" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
            Inscripciones abiertas
          </label>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Fecha de inicio</label>
            <input
              type="date"
              className={input + " w-full"}
              value={saturdayDate}
              onChange={(e) => setSaturdayDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Fecha de fin</label>
            <input
              type="date"
              className={input + " w-full"}
              value={sundayDate}
              onChange={(e) => setSundayDate(e.target.value)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Las fechas se muestran en la página pública de inscripciones. Déjelas en blanco si aún no las define.
        </p>
      </section>

      {/* Region + circuit assignment */}
      {regions.length > 0 && (
        <section className={card}>
          <h3 className={h2}>Región y Circuito</h3>
          <p className="mb-3 text-xs text-slate-500">
            Asigna este evento a una región y, si aplica, a un circuito (serie). El circuito define las reglas de puntos.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Región</label>
              <select className={input + " w-full"} value={regionId} onChange={(e) => onRegionChange(e.target.value)}>
                <option value="">— Seleccione —</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Circuito</label>
              <select
                className={input + " w-full"}
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value)}
                disabled={!regionId || seriesInRegion.length === 0}
              >
                <option value="">{!regionId ? "Elija región primero" : seriesInRegion.length ? "— Sin circuito —" : "No hay circuitos en esta región"}</option>
                {seriesInRegion.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

      {/* PDF header / branding */}
      <section className={card}>
        <h3 className={h2}>Encabezado del PDF</h3>
        <p className="mb-3 text-xs text-slate-500">
          Aparece arriba de cada hoja al exportar a PDF (logo, título y subtítulo). El nombre del evento y las fechas se
          muestran automáticamente.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Título (opcional)</label>
            <input
              className={input + " w-full"}
              value={headerTitle}
              placeholder={name || "Nombre del evento"}
              onChange={(e) => setHeaderTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Subtítulo (opcional)</label>
            <input
              className={input + " w-full"}
              value={headerSubtitle}
              placeholder="Ej. organizador / sede"
              onChange={(e) => setHeaderSubtitle(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Logo (PNG o JPG)</label>
            <div className="flex items-center gap-3">
              {pdfLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pdfLogo} alt="logo" className="h-12 w-auto rounded border border-slate-200" />
              ) : (
                <span className="text-xs text-slate-400">Sin logo</span>
              )}
              <input type="file" accept="image/png,image/jpeg" onChange={onLogoFile} className="text-sm" />
              {pdfLogo && (
                <button type="button" onClick={() => setPdfLogo("")} className="text-xs font-semibold text-red-600 hover:underline">
                  Quitar
                </button>
              )}
            </div>
            {logoErr && <p className="mt-1 text-xs text-red-600">{logoErr}</p>}
          </div>
        </div>
      </section>

      {/* Heights / Sections / Days */}
      <section className={card}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <ListEditor title="Alturas" items={heights} onChange={setHeightsSynced} />
          <ListEditor title="Secciones" items={sections} onChange={setSectionsSynced} />
          <ListEditor title="Días" hint="Ej. Viernes, Sábado, Domingo" items={days} onChange={setDays} />
        </div>
      </section>

      {/* Height -> Section rules */}
      <section className={card}>
        <h3 className={h2}>Secciones por altura</h3>
        <p className="mb-3 text-xs text-slate-500">
          Marque las secciones válidas para cada altura. Si no marca ninguna, la prueba no se ofrece (no se corre ningún día).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-900">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Altura</th>
                {sections.map((s) => {
                  const allChecked = heights.length > 0 && heights.every((h) => (sectionsByHeight[h] ?? []).includes(s));
                  return (
                    <th key={s} className="py-2 pr-3 align-bottom">
                      <div>{s}</div>
                      <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] font-normal normal-case text-slate-500">
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={allChecked}
                          onChange={(e) => setSectionForAll(s, e.target.checked)}
                        />
                        Todos
                      </label>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {heights.map((h) => {
                const allowed = sectionsByHeight[h];
                return (
                  <tr key={h} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium">{h}</td>
                    {sections.map((s) => {
                      const checked = !allowed || allowed.length === 0 ? false : allowed.includes(s);
                      return (
                        <td key={s} className="py-2 pr-3">
                          <input
                            type="checkbox"
                            className="accent-blue-600"
                            checked={checked}
                            onChange={() => toggleHeightSection(h, s)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-day section override */}
      {days.length > 1 && (
        <section className={card}>
          <h3 className={h2}>Secciones por día (opcional)</h3>
          <p className="mb-3 text-xs text-slate-500">
            Personalice las secciones de una altura para un día específico. Si no marca &quot;Personalizar&quot;, ese día usa las &quot;Secciones por altura&quot; de arriba.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setEditDay(d)}
                className={"rounded-full px-3 py-1 text-sm font-semibold " + (d === editDay ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700")}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Altura</th>
                  <th className="py-2 pr-3">Activa</th>
                  <th className="py-2 pr-3">Personalizar</th>
                  {sections.map((s) => {
                    const activeHeights = heights.filter((h) => isActiveDay(editDay, h));
                    const allChecked = activeHeights.length > 0 && activeHeights.every((h) => sectionsForHeightDayLocal(editDay, h).includes(s));
                    return (
                      <th key={s} className="py-2 pr-3 align-bottom">
                        <div>{s}</div>
                        <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] font-normal normal-case text-slate-500">
                          <input type="checkbox" className="accent-blue-600" checked={allChecked} onChange={(e) => setDaySectionForAll(editDay, s, e.target.checked)} />
                          Todos
                        </label>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {heights.map((h) => {
                  const active = isActiveDay(editDay, h);
                  const ov = isDayOverridden(editDay, h);
                  const general = sectionsByHeight[h]?.length ? sectionsByHeight[h] : sections;
                  const cur = sectionsByHeightDay[editDay]?.[h] ?? [];
                  return (
                    <tr key={h} className={"border-b border-slate-100 " + (active ? "" : "bg-slate-50 text-slate-400")}>
                      <td className="py-2 pr-3 font-medium">{h}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          className="accent-emerald-600"
                          checked={active}
                          onChange={(e) => toggleActiveDay(editDay, h, e.target.checked)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        {active ? (
                          <input
                            type="checkbox"
                            className="accent-blue-600"
                            checked={ov}
                            onChange={(e) => toggleDayOverride(editDay, h, e.target.checked)}
                          />
                        ) : (
                          <span className="text-[11px]">No se corre</span>
                        )}
                      </td>
                      {sections.map((s) => (
                        <td key={s} className="py-2 pr-3">
                          {!active ? (
                            <span className="text-[11px] text-slate-300">—</span>
                          ) : ov ? (
                            <input
                              type="checkbox"
                              className="accent-blue-600"
                              checked={cur.includes(s)}
                              onChange={() => toggleDaySection(editDay, h, s)}
                            />
                          ) : (
                            <span className="text-[11px] text-slate-400">{general.includes(s) ? "✓" : "·"}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Optional fields */}
      <section className={card}>
        <h3 className={h2}>Campos opcionales</h3>
        <div className="mt-3 flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              className="accent-emerald-600"
              checked={fields.circuit}
              onChange={(e) => setFields({ ...fields, circuit: e.target.checked })}
            />
            Inscrito en el circuito
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              className="accent-emerald-600"
              checked={fields.discount}
              onChange={(e) => setFields({ ...fields, discount: e.target.checked })}
            />
            Aplica descuento
          </label>
        </div>
      </section>

      {/* Billing */}
      <section className={card}>
        <h3 className={h2}>Costos e inscripción</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Cuota de inscripción por defecto (MXN)</label>
            <input
              type="number"
              className={input + " w-full"}
              value={entryFeeDefault}
              onChange={(e) => setEntryFeeDefault(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Se cobra por cada vez que el jinete entra a pista (por día/prueba).</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Cuota de nominación (MXN)</label>
            <input
              type="number"
              className={input + " w-full"}
              value={nominationFee}
              onChange={(e) => setNominationFee(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Una vez por jinete por evento. Los miembros del circuito están exentos.</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center gap-3">
            <h4 className="text-sm font-semibold text-slate-700">Precio por clase (opcional)</h4>
            <button type="button" onClick={copyFeeToAll} className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">
              Copiar cuota por defecto a todas
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-500">Déjelo en blanco para usar la cuota por defecto.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {heights.map((h) => (
              <label key={h} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="w-16 shrink-0">{h}</span>
                <input
                  type="number"
                  placeholder={entryFeeDefault}
                  className={input + " w-full"}
                  value={priceByHeight[h] ?? ""}
                  onChange={(e) => setPriceByHeight((prev) => ({ ...prev, [h]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-slate-700">¿Cómo se cobra la nominación?</h4>
          <p className="mb-2 text-xs text-slate-500">
            Por jinete: una nominación por jinete sin importar cuántos caballos monte. Por binomio: una nominación por
            cada combinación jinete–caballo (p. ej. Jaime Vázquez & Balou y Jaime Vázquez & Loretto = 2).
          </p>
          <select value={nominationBasis} onChange={(e) => setNominationBasis(e.target.value as "rider" | "pair")} className={input + " w-full max-w-xs"}>
            <option value="rider">Por jinete</option>
            <option value="pair">Por binomio (jinete + caballo)</option>
          </select>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-slate-700">Exenciones de nominación</h4>
          <p className="mb-2 text-xs text-slate-500">
            Un jinete queda exento si compite en cualquiera de estas alturas o secciones (además de los miembros del circuito).
          </p>
          <div className="flex flex-wrap gap-2">
            {[...heights, ...sections].map((key) => {
              const on = nominationExempt.includes(key);
              return (
                <label
                  key={key}
                  className={
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm " +
                    (on ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-600")
                  }
                >
                  <input type="checkbox" className="accent-amber-600" checked={on} onChange={() => toggleExempt(key)} />
                  {key}
                </label>
              );
            })}
          </div>
        </div>

        {/* Exceptions: an exempt SECTION still pays at these heights */}
        {sections.filter((s) => nominationExempt.includes(s)).length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <h4 className="text-sm font-semibold text-slate-700">Excepciones por altura</h4>
            <p className="mb-2 text-xs text-slate-500">
              Para una sección exenta, marca las alturas donde SÍ se cobra nominación (p. ej. “Libre” exenta salvo en
              1.10m y 1.20m).
            </p>
            <div className="space-y-3">
              {sections.filter((s) => nominationExempt.includes(s)).map((s) => (
                <div key={s}>
                  <div className="mb-1 text-sm font-semibold text-slate-800">{s} — paga en:</div>
                  <div className="flex flex-wrap gap-2">
                    {heights.map((h) => {
                      const on = (nominationExemptExcept[s] ?? []).includes(h);
                      return (
                        <label
                          key={h}
                          className={
                            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs " +
                            (on ? "border-rose-500 bg-rose-50 text-rose-700" : "border-slate-300 bg-white text-slate-600")
                          }
                        >
                          <input type="checkbox" className="accent-rose-600" checked={on} onChange={() => toggleExcept(s, h)} />
                          {h}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Cancelaciones</label>
            <select
              value={cancelMode}
              onChange={(e) => setCancelMode(e.target.value as "credit" | "fee" | "no_refund")}
              className={input + " w-full"}
            >
              <option value="credit">Crédito total (sin cargo)</option>
              <option value="fee">Cargo fijo por inicio cancelado</option>
              <option value="no_refund">Sin reembolso (cobra completo)</option>
            </select>
          </div>
          {cancelMode === "fee" && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Cargo por cancelación (MXN)</label>
              <input type="number" className={input + " w-full"} value={cancelFee} onChange={(e) => setCancelFee(e.target.value)} />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Descuento</label>
            <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as "percent" | "flat")} className={input + " w-full"}>
              <option value="percent">Porcentaje (%) sobre cuotas</option>
              <option value="flat">Monto fijo (MXN) por salida</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{discountMode === "percent" ? "Porcentaje (%)" : "Monto por salida (MXN)"}</label>
            <input type="number" className={input + " w-full"} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" className="accent-blue-600" checked={discountWaives} onChange={(e) => setDiscountWaives(e.target.checked)} />
              El descuento también exime la nominación
            </label>
          </div>
        </div>

        <div className="mt-4 max-w-xs">
          <ListEditor
            title="Secciones extemporáneas (solo admin)"
            hint="Ej. Training, FC — para altas tardías"
            items={extempSections}
            onChange={setExtempSections}
          />
        </div>
      </section>

      {/* Standings / championship points */}
      <section className={card}>
        <h3 className={h2}>Premiación / Puntos</h3>
        <p className="mb-4 text-xs text-slate-500">
          Cómo este evento otorga puntos. <b>Heredar</b> usa la configuración de la serie; <b>Desactivar</b> = show
          independiente sin puntos.
        </p>

        {/* Mini-serie */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-700">Mini-serie (premiación del concurso)</h4>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select value={miniMode} onChange={(e) => setMiniMode(e.target.value as ScopeMode)} className={input}>
              <option value="inherit">Heredar de la serie</option>
              <option value="on">Activar</option>
              <option value="off">Desactivar (sin puntos)</option>
            </select>
            {miniMode === "on" && (
              <>
                <select value={miniBasis} onChange={(e) => setMiniBasis(e.target.value as "class" | "registered")} className={input}>
                  <option value="class">Por clase (todos)</option>
                  <option value="registered">Registrados (re-ranqueo)</option>
                </select>
                <select value={miniElig} onChange={(e) => setMiniElig(e.target.value as "all" | "circuit")} className={input}>
                  <option value="all">Puntúan todos</option>
                  <option value="circuit">Solo inscritos al circuito</option>
                </select>
                <select value={miniCap} onChange={(e) => setMiniCap(e.target.value as "first_class" | "none")} className={input}>
                  <option value="none">Sin tope por día</option>
                  <option value="first_class">Tope: 1ª prueba del día</option>
                </select>
                <div className="flex w-full flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Días que cuentan:</span>
                  {days.map((d) => {
                    const on = miniDays.includes(d);
                    return (
                      <label key={d} className={"inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold " + (on ? "border-indigo-600 bg-indigo-50 text-indigo-800" : "border-slate-300 text-slate-600")}>
                        <input type="checkbox" className="accent-indigo-600" checked={on} onChange={() => toggleSeriesDay("mini", d)} />
                        {d}
                      </label>
                    );
                  })}
                  {miniDays.filter((d) => days.includes(d)).length === 0 && (
                    <span className="text-[11px] text-slate-400">(ninguno marcado = cuentan todos los días)</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Campeonato / temporada */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-700">Campeonato (temporada)</h4>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <select value={seasonMode} onChange={(e) => setSeasonMode(e.target.value as ScopeMode)} className={input}>
              <option value="inherit">Heredar de la serie</option>
              <option value="on">Activar</option>
              <option value="off">Desactivar (sin puntos)</option>
            </select>
            {seasonMode === "on" && (
              <>
                <select value={seasonBasis} onChange={(e) => setSeasonBasis(e.target.value as "class" | "registered")} className={input}>
                  <option value="class">Por clase (todos)</option>
                  <option value="registered">Registrados (re-ranqueo)</option>
                </select>
                <select value={seasonElig} onChange={(e) => setSeasonElig(e.target.value as "all" | "circuit")} className={input}>
                  <option value="all">Puntúan todos</option>
                  <option value="circuit">Solo inscritos al circuito</option>
                </select>
                <select value={seasonCap} onChange={(e) => setSeasonCap(e.target.value as "first_class" | "none")} className={input}>
                  <option value="none">Sin tope por día</option>
                  <option value="first_class">Tope: 1ª prueba del día</option>
                </select>
                <div className="flex w-full flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Días que cuentan:</span>
                  {days.map((d) => {
                    const on = seasonDays.includes(d);
                    return (
                      <label key={d} className={"inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold " + (on ? "border-indigo-600 bg-indigo-50 text-indigo-800" : "border-slate-300 text-slate-600")}>
                        <input type="checkbox" className="accent-indigo-600" checked={on} onChange={() => toggleSeriesDay("season", d)} />
                        {d}
                      </label>
                    );
                  })}
                  {seasonDays.filter((d) => days.includes(d)).length === 0 && (
                    <span className="text-[11px] text-slate-400">(ninguno marcado = cuentan todos los días)</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Rider-scored heights */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" className="accent-blue-600" checked={riderOverride} onChange={(e) => setRiderOverride(e.target.checked)} />
            Personalizar alturas con puntos por jinete (sección Abierta)
          </label>
          {riderOverride ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {heights.map((h) => {
                const on = riderHeights.includes(h);
                return (
                  <label
                    key={h}
                    className={
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm " +
                      (on ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-600")
                    }
                  >
                    <input type="checkbox" className="accent-amber-600" checked={on} onChange={() => toggleRiderHeight(h)} />
                    {h}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Si no se personaliza, se heredan las alturas de la serie (CESQROO: 40/60/75).</p>
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}
