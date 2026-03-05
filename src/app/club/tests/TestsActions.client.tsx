"use client";

import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseBrowser";

type ClubRow = { id: string; name: string };

type ProfileLite = {
  role: string; // "admin" | "club_admin" | ...
};

type HorseRow = {
  id: string;
  name: string;
  microchip: string | null;
  status: string | null;
};

type PreviewRow = {
  id: string;
  batch_id: string;
  storage_path: string;
  raw_horse_name: string | null;
  chip: string | null;
  reg_number: string | null; // ✅ ADD THIS
  result: string | null;
  test_type: string | null;
  test_date: string | null;
  horse_id: string | null;
  match_kind: string | null;
  candidates: any;
  committed_at: string | null;
};

export default function TestsActions(props: {
  horses: HorseRow[];
  profile: ProfileLite;
  clubs?: ClubRow[]; // server-provided for admin dropdown
}) {
  const { horses, profile, clubs = [] } = props;

  const isAdmin = profile?.role === "admin";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [batchDate, setBatchDate] = useState<string>("");
  const [manualMatches, setManualMatches] = useState<Record<string, string>>({});



function setManual(rowId: string, horseId: string) {
  setManualMatches((m) => ({ ...m, [rowId]: horseId }));
}

  async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const token = data.session?.access_token;
    if (!token) throw new Error("Not authenticated (missing session access token).");
    return token;
  }

  function requireAdminClubSelected() {
    if (isAdmin && !selectedClubId) {
      throw new Error("Please select a club first.");
    }
  }


 async function uploadPdf(): Promise<string> {
  if (!file) throw new Error("Please choose a PDF first.");

  const token = await getAccessToken();

  const form = new FormData();
  form.append("file", file);
  form.append("filename", file.name);

  const res = await fetch("/api/labs/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const out = await res.json();
  if (!res.ok) throw new Error(out?.error ?? "Upload failed.");
  if (!out?.storage_path) throw new Error("Upload succeeded but storage_path missing.");

  return out.storage_path;
}

  async function runPreview(sp: string) {
    requireAdminClubSelected();

    const token = await getAccessToken();

    const res = await fetch("/api/labs/preview-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        storage_path: sp,
        ...(isAdmin ? { club_id: selectedClubId } : {}),
      }),
    });

    const out = await res.json();
    if (!res.ok) throw new Error(out?.error ?? "Preview failed.");

    // Expecting preview-upload to return batch_id, plus rows/preview
    const bid: string | null =
      (typeof out?.batch_id === "string" && out.batch_id) ||
      (typeof out?.batchId === "string" && out.batchId) ||
      null;

    const rows: PreviewRow[] = (out?.rows ?? out?.preview ?? []) as PreviewRow[];

    setBatchId(bid);
    setPreview(rows);
    setManualMatches({});

    return out;
  }

  async function commitPreview(bid: string) {
    requireAdminClubSelected();

    const token = await getAccessToken();

    const res = await fetch("/api/labs/commit-preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
  	batch_id: bid,
 	overrides: manualMatches,
  	...(isAdmin ? { club_id: selectedClubId } : {}),
	}),
    });

    const out = await res.json();
    if (!res.ok) throw new Error(out?.error ?? "Commit failed.");

    return out;
  }

  async function onUploadAndPreview() {
    try {
      setBusy(true);
      setError(null);

      requireAdminClubSelected();

      const sp = await uploadPdf();
      setStoragePath(sp);

      await runPreview(sp);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    try {
      setBusy(true);
      setError(null);

      requireAdminClubSelected();

      if (!batchId) throw new Error("Missing batch id. Run Preview first.");

      const out = await commitPreview(batchId);

      alert(`Committed. Parsed: ${out?.parsed ?? "?"}, Matched: ${out?.matched ?? "?"}`);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

async function applyMissingDateToBatch(dateISO: string) {
  if (!batchId) throw new Error("Missing batch id.");
  if (!dateISO) throw new Error("Please choose a date first.");

  const token = await getAccessToken();

  const res = await fetch("/api/labs/preview-upload", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      batchId,
      applyMissingDate: dateISO,
      scope: "all",
    }),
  });

  const out = await res.json();
  if (!res.ok) throw new Error(out?.error ?? "Failed to apply date.");

  setPreview((prev) =>
    prev.map((r) => (r.test_date ? r : { ...r, test_date: dateISO }))
  );
}

  return (
    <section style={{ marginTop: 12, padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12 }}>
      <h3 style={{ marginTop: 0 }}>Import SENASICA Tests (PDF)</h3>

      {/* Admin-only club selector */}
      {isAdmin && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Club (admin only)</div>
          <select
            value={selectedClubId}
            onChange={(e) => setSelectedClubId(e.target.value)}
            disabled={busy}
            style={{ padding: 8, borderRadius: 8, width: "100%" }}
          >
            <option value="">Select a club…</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!clubs.length ? (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
              No clubs loaded (admin). If this is unexpected, confirm the server page is fetching clubs.
            </div>
          ) : null}
        </div>
      )}

      {/* File input */}
      <div style={{ display: "grid", gap: 8 }}>
        <input
          type="file"
          accept="application/pdf"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
       
<button
  type="button"
  onClick={onUploadAndPreview}
  disabled={busy || !file || (isAdmin && !selectedClubId)}
  style={{ padding: "8px 12px", borderRadius: 10 }}
>
  {busy ? "Working…" : "Upload + Preview"}
</button>

<button
  type="button"
  onClick={onCommit}
  disabled={busy || !batchId || (isAdmin && !selectedClubId)}
  style={{ padding: "8px 12px", borderRadius: 10 }}
>
  Commit
</button>

</div>

        {/* Status */}
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          <div>
            <b>Horses loaded:</b> {horses.length}
          </div>
          <div>
            <b>Storage path:</b> {storagePath ?? "-"}
          </div>
          <div>
            <b>Batch id:</b> {batchId ?? "-"}
          </div>
          <div>
            <b>Preview rows:</b> {preview.length}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: 10, border: "1px solid rgba(255,0,0,0.45)", borderRadius: 10 }}>
            <b>Error:</b> {error}
          </div>
        )}
{/* Batch date tools */}
{preview.length > 0 && (
  <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 10 }}>
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Batch test date (apply to missing rows)
      </div>

      <input
        type="date"
        value={batchDate}
        onChange={(e) => setBatchDate(e.target.value)}
        disabled={busy}
        style={{ padding: 8, borderRadius: 8 }}
      />
    </div>

    <button
      type="button"
      disabled={busy || !batchId || !batchDate}
      onClick={async () => {
        try {
          setBusy(true);
          setError(null);
          await applyMissingDateToBatch(batchDate);
        } catch (e: any) {
          setError(e?.message ?? "Unknown error");
        } finally {
          setBusy(false);
        }
      }}
      style={{ padding: "8px 12px", borderRadius: 10 }}
    >
      Apply date to missing
    </button>

    <div style={{ fontSize: 12, opacity: 0.75 }}>
      {preview.filter((r) => !r.test_date).length} row(s) missing date
    </div>
  </div>
)}
        {/* Preview table (lightweight) */}
        {preview.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%", marginTop: 6 }}>
              <thead>
  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
    <th>Horse (raw)</th>
    <th>Chip</th>
    <th>Reg #</th>
    <th>Date</th>
    <th>Match</th>
    <th>Horse ID / Manual</th>
  </tr>
</thead>
              <tbody>
  {preview.slice(0, 200).map((r) => (
    <tr key={r.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
  <td>{r.raw_horse_name ?? ""}</td>

  <td>{r.chip ?? ""}</td>

  <td>{r.reg_number ?? ""}</td>

  <td>{r.test_date ?? ""}</td>

  <td>{r.match_kind ?? (r.horse_id ? "matched" : "unmatched")}</td>

  <td>
    {r.horse_id ? (
      r.horse_id
    ) : (
      <select
        value={manualMatches[r.id] ?? ""}
        onChange={(e) => setManual(r.id, e.target.value)}
        disabled={busy}
        style={{ padding: 6, borderRadius: 8, width: "100%" }}
      >
        <option value="">— manual match —</option>

        {horses.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
            {h.microchip ? ` (${h.microchip})` : ""}
          </option>
        ))}
      </select>
    )}
  </td>
</tr>
  ))}
</tbody>
            </table>

            {preview.length > 200 ? (
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Showing first 200 rows…</div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}