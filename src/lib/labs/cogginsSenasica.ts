/* =========================================================
   SENASICA COGGINS (AIE) PARSER + MATCHER + UPSERT (UPDATED)
   - Adds Clave Interna (10 digits)
   - Cleans microchips/names
   - Club-scoped matching
   - Optionally backfills horses.microchip if empty
   ========================================================= */

function normalizeName(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// Keep only digits
function digitsOnly(s: string) {
  return (s || "").replace(/\D+/g, "");
}

// Extract a 15-digit microchip from a block, tolerant of spaces/hyphens
function extractMicrochip15(block: string): string | null {
  // First try strict 15 digits token
  const strict = block.match(/\b\d{15}\b/);
  if (strict?.[0]) return strict[0];

  // Fallback: find sequences with spaces/hyphens etc, then strip to digits
  // and accept if any 15-digit appears.
  const loose = block.match(/(?:\d[\s-]?){15,}/g);
  if (!loose) return null;

  for (const cand of loose) {
    const d = digitsOnly(cand);
    if (d.length >= 15) {
      // take the first 15 digits (common OCR behavior)
      const first15 = d.slice(0, 15);
      if (/^\d{15}$/.test(first15)) return first15;
    }
  }
  return null;
}

// Extract 10-digit "Clave Interna" after the label, tolerant of spaces
function extractClaveInterna10(block: string): string | null {
  // Try a fairly strict pattern first
  const m1 = block.match(/Clave\s+Interna\s*[:\-]?\s*(\d{10})/i);
  if (m1?.[1]) return m1[1];

  // Loose: capture up to ~25 chars after label, then strip digits and take first 10
  const m2 = block.match(/Clave\s+Interna\s*[:\-]?\s*([0-9\s\-]{10,30})/i);
  if (m2?.[1]) {
    const d = digitsOnly(m2[1]);
    const first10 = d.slice(0, 10);
    if (/^\d{10}$/.test(first10)) return first10;
  }

  // Ultra-loose: scan nearby text after label (in case OCR inserts noise)
  const idx = block.search(/Clave\s+Interna/i);
  if (idx >= 0) {
    const window = block.slice(idx, idx + 120);
    const d = digitsOnly(window);
    const first10 = d.slice(0, 10);
    if (/^\d{10}$/.test(first10)) return first10;
  }

  return null;
}

/* =========================================================
   DATE EXTRACTION (Fecha de resultado)
   ========================================================= */
function monthToNumberSpanish(month: string) {
  const m = month
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const map: Record<string, string> = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };

  return map[m] || null;
}

export function extractFechaResultadoYYYYMMDD(text: string): string | null {
  const re =
    /Fecha\s+de\s+resultado\s*:\s*([A-Za-zÁÉÍÓÚÜáéíóúü]+)\s+(\d{1,2})(?:,)?\s+(\d{4})/i;

  const m = text.match(re);
  if (!m) return null;

  const monthWord = m[1];
  const day = m[2].padStart(2, "0");
  const year = m[3];

  const mm = monthToNumberSpanish(monthWord);
  if (!mm) return null;

  return `${year}-${mm}-${day}`;
}

/* =========================================================
   HORSE BLOCK PARSING (supports both formats)
   ========================================================= */
export function parseSenasicaCoggins(text: string) {
  if (!text) return [];

  // Match BOTH variants:
  // 1) Identificación.-   (with/without accent)
  // 2) IDENTIFICACION:    (all caps, colon)
  const headerRe = /Identificaci[oó]n\.\-|IDENTIFICACION\s*:/gi;

  const matches = Array.from(text.matchAll(headerRe));
  if (!matches.length) return [];

  const results: Array<{
    chip: string | null; // 15-digit microchip (digits only)
    clave_interna: string | null; // 10-digit
    name: string | null; // cleaned display-ish
    name_norm: string | null; // normalized for matching
    result: string | null; // NEGATIVO/POSITIVO
    test_type: "AIE";
  }> = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const header = m[0];
    const start = (m.index ?? 0) + header.length;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;

    const block = text.slice(start, end);

    // Name extraction depends on which header we matched
    let nameRaw: string | null = null;

    // Variant B: IDENTIFICACION: horsename;
    if (/^IDENTIFICACION\s*:/i.test(header)) {
      nameRaw =
        (block.match(/^\s*([^;\n]+?)\s*;/) || [])[1]?.trim() || null;
    } else {
      // Variant A: Identificación.-  (original approach)
      nameRaw = (block.match(/^\s*([^\n,]+)/) || [])[1]?.trim() || null;
    }

    const nameClean = nameRaw ? cleanSpaces(nameRaw) : null;

    // Microchip (15 digits)
    const chip = extractMicrochip15(block);

    // Clave Interna (10 digits)
    const clave_interna = extractClaveInterna10(block);

    // Result (NEGATIVO / POSITIVO)
    const result =
      (block.match(/\b(NEGATIVO|POSITIVO)\b/i) || [])[1]?.toUpperCase() || null;

    results.push({
      chip,
      clave_interna,
      name: nameClean,
      name_norm: nameClean ? normalizeName(nameClean) : null,
      result,
      test_type: "AIE",
    });
  }

  return results;
}

/* =========================================================
   MATCHING + UPSERT (club-scoped + optional chip backfill)
   ========================================================= */
export async function matchAndUpsertCoggins(params: {
  supabase: any;
  clubId: string; // IMPORTANT: enforce club scope
  parsed: ReturnType<typeof parseSenasicaCoggins>;
  testDate: string | null;
  // If true, update horses.microchip ONLY when empty/null
  backfillHorseChipIfEmpty?: boolean;
  // If your horse_tests table has a column for clave interna / reg number,
  // set this to the column name you want to write into.
  // Example: "clave_interna" or "reg_number"
  horseTestsClaveInternaColumn?: string;
}) {
  const {
    supabase,
    clubId,
    parsed,
    testDate,
    backfillHorseChipIfEmpty = true,
    horseTestsClaveInternaColumn = "clave_interna",
  } = params;

  const manual_check: any[] = [];
  const rowsToUpsert: any[] = [];

  if (!parsed.length) {
    return { parsed: 0, matched: 0, manual_check };
  }

  /* ---------------------------------------------------------
     CHIP MATCHING (bulk query) — CLUB SCOPED
     --------------------------------------------------------- */
  const chips = [...new Set(parsed.map((x) => x.chip).filter(Boolean))] as string[];

  const chipMatches =
    chips.length > 0
      ? (
          await supabase
            .from("horses")
            .select("id, microchip, name")
            .eq("club_id", clubId)
            .in("microchip", chips)
        ).data ?? []
      : [];

  const horseByChip = new Map<string, any>(chipMatches.map((h: any) => [h.microchip, h]));

  /* ---------------------------------------------------------
     NAME MATCHING (fallback) — CLUB SCOPED
     --------------------------------------------------------- */
  const horsesAll =
    (await supabase.from("horses").select("id,name,microchip").eq("club_id", clubId))
      .data ?? [];

  const horsesByNameNorm = new Map<string, any[]>();
  for (const h of horsesAll) {
    const nn = normalizeName(h.name);
    horsesByNameNorm.set(nn, [...(horsesByNameNorm.get(nn) || []), h]);
  }

  /* ---------------------------------------------------------
     MATCH LOGIC
     --------------------------------------------------------- */
  const horsesToChipBackfill: Array<{ horse_id: string; chip: string }> = [];

  for (const item of parsed) {
    let horse: any | null = null;

    // 1) Try chip
    if (item.chip) {
      horse = horseByChip.get(item.chip) || null;

      if (!horse) {
        manual_check.push({
          reason: "chip_not_found",
          chip: item.chip,
          clave_interna: item.clave_interna,
          name: item.name,
          result: item.result,
        });
        continue;
      }
    }
    // 2) Fallback to name
    else if (item.name_norm) {
      const candidates = horsesByNameNorm.get(item.name_norm) || [];

      if (candidates.length === 1) {
        horse = candidates[0];
      } else {
        manual_check.push({
          reason: candidates.length > 1 ? "ambiguous_name" : "name_not_found",
          chip: null,
          clave_interna: item.clave_interna,
          name: item.name,
          result: item.result,
          candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
        });
        continue;
      }
    }
    // 3) Nothing usable
    else {
      manual_check.push({
        reason: "no_chip_no_name",
        clave_interna: item.clave_interna,
      });
      continue;
    }

    // Optional: if we matched by NAME (or even by chip) and OCR has a chip,
    // backfill horses.microchip ONLY if empty/null.
    if (backfillHorseChipIfEmpty && item.chip) {
      const existing = (horse.microchip ?? "").toString().trim();
      if (!existing) {
        horsesToChipBackfill.push({ horse_id: horse.id, chip: item.chip });
      }
    }

    /* ---------------------------------------------------------
       PREPARE UPSERT (horse_tests)
       --------------------------------------------------------- */
    const row: any = {
      horse_id: horse.id,
      test_type: "AIE",
      test_date: testDate,
      result: item.result,
    };

    // Pass Clave Interna along if present (column name configurable)
    if (item.clave_interna && horseTestsClaveInternaColumn) {
      row[horseTestsClaveInternaColumn] = item.clave_interna;
    }

    rowsToUpsert.push(row);
  }

  /* ---------------------------------------------------------
     APPLY CHIP BACKFILL (only empty/null)
     --------------------------------------------------------- */
  if (horsesToChipBackfill.length) {
    // Dedupe by horse_id (keep first)
    const byHorse = new Map<string, string>();
    for (const x of horsesToChipBackfill) {
      if (!byHorse.has(x.horse_id)) byHorse.set(x.horse_id, x.chip);
    }

    // Update one-by-one (safe + clear). If you want, we can batch with RPC later.
    for (const [horse_id, chip] of byHorse.entries()) {
      await supabase
        .from("horses")
        .update({ microchip: chip })
        .eq("id", horse_id)
        .eq("club_id", clubId)
        .or("microchip.is.null,microchip.eq."); // ensures still empty at update time
    }
  }

  /* ---------------------------------------------------------
     UPSERT horse_tests
     --------------------------------------------------------- */
  if (rowsToUpsert.length) {
    await supabase.from("horse_tests").upsert(rowsToUpsert, {
      onConflict: "horse_id,test_type,test_date",
    });
  }

  return {
    parsed: parsed.length,
    matched: rowsToUpsert.length,
    manual_check,
  };
}