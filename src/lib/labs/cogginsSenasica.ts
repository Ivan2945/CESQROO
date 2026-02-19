/* =========================================================
   SENASICA COGGINS (AIE) PARSER + MATCHER + UPSERT
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
   HORSE BLOCK PARSING
   ========================================================= */

export function parseSenasicaCoggins(text: string) {
  if (!text) return [];

  // Split on each horse identification block
  const parts = text.split(/Identificaci[oó]n\.\-/i).slice(1);

  const results = parts.map((p) => {
    // Horse name is first token until comma or newline
    const nameRaw =
      (p.match(/^\s*([^\n,]+)/) || [])[1]?.trim() || null;

    // First 15-digit number in block (microchip)
    const chip = (p.match(/\b\d{15}\b/) || [])[0] || null;

    // Result (NEGATIVO / POSITIVO)
    const result =
      (p.match(/\b(NEGATIVO|POSITIVO)\b/i) || [])[1]?.toUpperCase() || null;

    return {
      chip,
      name: nameRaw,
      name_norm: nameRaw ? normalizeName(nameRaw) : null,
      result,
      test_type: "AIE",
    };
  });

  return results;
}

/* =========================================================
   MATCHING + UPSERT
   ========================================================= */

export async function matchAndUpsertCoggins(params: {
  supabase: any;
  parsed: ReturnType<typeof parseSenasicaCoggins>;
  testDate: string | null;
}) {
  const { supabase, parsed, testDate } = params;

  const manual_check: any[] = [];
  const rowsToUpsert: any[] = [];

  if (!parsed.length) {
    return { parsed: 0, matched: 0, manual_check };
  }

  /* ---------------------------------------------------------
     CHIP MATCHING (bulk query)
     --------------------------------------------------------- */

  const chips = [
    ...new Set(parsed.map((x) => x.chip).filter(Boolean)),
  ] as string[];

  const chipMatches =
    chips.length > 0
      ? (
          await supabase
            .from("horses")
            .select("id,microchip,name")
            .in("microchip", chips)
        ).data ?? []
      : [];

  const horseByChip = new Map(
    chipMatches.map((h: any) => [h.microchip, h])
  );

  /* ---------------------------------------------------------
     NAME MATCHING (fallback)
     --------------------------------------------------------- */

  const horsesAll =
    (await supabase.from("horses").select("id,name")).data ?? [];

  const horsesByNameNorm = new Map<string, any[]>();

  for (const h of horsesAll) {
    const nn = normalizeName(h.name);
    horsesByNameNorm.set(nn, [
      ...(horsesByNameNorm.get(nn) || []),
      h,
    ]);
  }

  /* ---------------------------------------------------------
     MATCH LOGIC
     --------------------------------------------------------- */

  for (const item of parsed) {
    let horse: any | null = null;

    // 1) Try chip
    if (item.chip) {
      horse = horseByChip.get(item.chip) || null;

      if (!horse) {
        manual_check.push({
          reason: "chip_not_found",
          chip: item.chip,
          name: item.name,
          result: item.result,
        });
        continue;
      }
    }

    // 2) Fallback to name
    else if (item.name_norm) {
      const candidates =
        horsesByNameNorm.get(item.name_norm) || [];

      if (candidates.length === 1) {
        horse = candidates[0];
      } else {
        manual_check.push({
          reason:
            candidates.length > 1
              ? "ambiguous_name"
              : "name_not_found",
          chip: null,
          name: item.name,
          result: item.result,
          candidates: candidates.map((c) => ({
            id: c.id,
            name: c.name,
          })),
        });
        continue;
      }
    }

    // 3) Nothing usable
    else {
      manual_check.push({
        reason: "no_chip_no_name",
      });
      continue;
    }

    /* ---------------------------------------------------------
       PREPARE UPSERT
       --------------------------------------------------------- */

    rowsToUpsert.push({
      horse_id: horse.id,
      test_type: "AIE",
      test_date: testDate,
      result: item.result,
    });
  }

  /* ---------------------------------------------------------
     UPSERT
     --------------------------------------------------------- */

  if (rowsToUpsert.length) {
    await supabase
      .from("horse_tests")
      .upsert(rowsToUpsert, {
        onConflict: "horse_id,test_type,test_date",
      });
  }

  return {
    parsed: parsed.length,
    matched: rowsToUpsert.length,
    manual_check,
  };
}
