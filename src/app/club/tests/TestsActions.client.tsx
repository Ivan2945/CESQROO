// src/app/club/tests/TestsActions.client.tsx
"use client";

import { useMemo, useState } from "react";

type Candidate = { id: string; name: string };
type HorseOption = { id: string; name: string; microchip?: string | null; status?: string | null };

type PreviewItem =
  | {
      kind: "matched";
      horse_id: string;
      horse_name: string;
      chip?: string | null;
      name?: string | null;
      result?: string | null;
    }
  | {
      kind: "ambiguous";
      chip?: string | null;
      name?: string | null;
      result?: string | null;
      candidates: Candidate[];
    }
  | {
      kind: "unmatched";
      reason: string;
      chip?: string | null;
      name?: string | null;
      result?: string | null;
    };

type PreviewResponse = {
  storage_path: string;
  testDate: string | null;
  items: PreviewItem[];
};

export default function TestsActions({ horses }: { horses: HorseOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [approvedMatched, setApprovedMatched] = useState<Record<number, boolean>>({});
  const [ambiguousSelection, setAmbiguousSelection] = useState<Record<number, string>>({});

  // Quick Add state
  const [quickHorseId, setQuickHorseId] = useState("");
  const [quickType, setQuickType] = useState("AIE");
  const [quickDate, setQuickDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quickResult, setQuickResult] = useState<string>("NEGATIVO");
  const [quickReg, setQuickReg] = useState<string>("");

  const grouped = useMemo(() => {
    const items = preview?.items ?? [];
    return {
      matched: items.map((it, idx) => ({ it, idx })).filter((x) => x.it.kind === "matched"),
      ambiguous: items.map((it, idx) => ({ it, idx })).filter((x) => x.it.kind === "ambiguous"),
      unmatched: items.map((it, idx) => ({ it, idx })).filter((x) => x.it.kind === "unmatched"),
    };
  }, [preview]);

  async function uploadPdf(): Promise<string> {
    const fd = new FormData();
    fd.append("file", file!);

    const up = await fetch("/api/labs/upload", { method: "POST", body: fd });
    const upJson = await up.json();
    if (!up.ok) throw new Error(upJson.error || "Upload failed");
    return upJson.storage_path as string;
  }

  async function runPreview(storage_path: string) {
    const res = await fetch("/api/labs/preview-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storage_path }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Preview failed");
    return json as PreviewResponse;
  }

  async function onUploadAndPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setBusy(true);
    setError(null);
    setPreview(null);
    setApprovedMatched({});
    setAmbiguousSelection({});

    try {
      const storage_path = await uploadPdf();
      const p = await runPreview(storage_path);
      setPreview(p);

      // default approve all matched
      const defaults: Record<number, boolean> = {};
      p.items.forEach((it, idx) => {
        if (it.kind === "matched") defaults[idx] = true;
      });
      setApprovedMatched(defaults);
    } catch (err: any) {
      setError(err.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!preview) return;

    setBusy(true);
    setError(null);

    try {
      const approvals: Array<{ horse_id: string; result?: string | null }> = [];

      preview.items.forEach((it, idx) => {
        if (it.kind === "matched") {
          if (approvedMatched[idx]) approvals.push({ horse_id: it.horse_id, result: it.result });
        } else if (it.kind === "ambiguous") {
          const chosen = ambiguousSelection[idx];
          if (chosen) approvals.push({ horse_id: chosen, result: it.result });
        }
      });

      const res = await fetch("/api/labs/commit-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: preview.storage_path,
          testDate: preview.testDate,
          test_type: "AIE",
          approvals,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Commit failed");

      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function onQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickHorseId || !quickDate) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/tests/manual-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horse_id: quickHorseId,
          test_type: quickType,
          test_date: quickDate,
          result: quickResult || null,
          reg_number: quickReg.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Manual add failed");

      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const canCommit = useMemo(() => {
    if (!preview) return false;
    const hasAnyApprovedMatched = Object.values(approvedMatched).some(Boolean);
    const hasAnyAmbigSelected = Object.values(ambiguousSelection).some(Boolean);
    return hasAnyApprovedMatched || hasAnyAmbigSelected;
  }, [preview, approvedMatched, ambiguousSelection]);

  return (
    <section style={{ marginTop: 14, padding: 12, border: "1px solid #e8e8e8", borderRadius: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <form onSubmit={onUploadAndPreview} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

          <button
            type="submit"
            disabled={!file || busy}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: busy ? "#f5f5f5" : "white",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {busy ? "Working..." : "Upload PDF (Preview)"}
          </button>
        </form>

        <div style={{ opacity: 0.7 }}>
          Upload supports scanned PDFs (OCR). Matches by chip, falls back to name.
        </div>
      </div>

      {/* Quick Add */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
        <h4 style={{ margin: "0 0 8px 0" }}>Quick add test</h4>

        <form
          onSubmit={onQuickAdd}
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "1.6fr 0.8fr 0.9fr 0.9fr 1fr",
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span>Horse</span>
            <select value={quickHorseId} onChange={(e) => setQuickHorseId(e.target.value)} required style={{ padding: 8 }}>
              <option value="">Select horse…</option>
              {horses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.microchip ? ` • ${h.microchip}` : ""}
                  {h.status ? ` (${h.status})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Type</span>
            <select value={quickType} onChange={(e) => setQuickType(e.target.value)} style={{ padding: 8 }}>
              <option value="AIE">AIE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Date</span>
            <input type="date" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} required style={{ padding: 8 }} />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Result</span>
            <select value={quickResult} onChange={(e) => setQuickResult(e.target.value)} style={{ padding: 8 }}>
              <option value="">—</option>
              <option value="NEGATIVO">NEGATIVO</option>
              <option value="POSITIVO">POSITIVO</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Reg #</span>
            <input value={quickReg} onChange={(e) => setQuickReg(e.target.value)} placeholder="optional" style={{ padding: 8 }} />
          </label>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="submit"
              disabled={busy || !quickHorseId || !quickDate}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: busy ? "#f5f5f5" : "white",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 800,
              }}
            >
              {busy ? "Saving..." : "Save test"}
            </button>

            <span style={{ opacity: 0.7 }}>Older dates than current will be ignored.</span>
          </div>
        </form>
      </div>

      {error ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid rgba(255,0,0,0.25)", borderRadius: 10 }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      {preview ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
            <div>
              <b>Detected test date:</b> {preview.testDate ?? "(not found)"}
            </div>
            <div style={{ opacity: 0.75, marginTop: 4 }}>
              <code>{preview.storage_path}</code>
            </div>
          </div>

          <h4 style={{ marginTop: 12, marginBottom: 6 }}>Matched</h4>
          {grouped.matched.length ? (
            <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Approve</th>
                  <th>Horse</th>
                  <th>Chip</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {grouped.matched.map(({ it, idx }) => {
                  const m = it as Extract<PreviewItem, { kind: "matched" }>;
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f3f3" }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!approvedMatched[idx]}
                          onChange={(e) => setApprovedMatched((p) => ({ ...p, [idx]: e.target.checked }))}
                        />
                      </td>
                      <td>{m.horse_name}</td>
                      <td>
                        <code>{m.chip ?? "-"}</code>
                      </td>
                      <td>
                        <code>{m.result ?? "-"}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ opacity: 0.75 }}>No matched items.</div>
          )}

          <h4 style={{ marginTop: 12, marginBottom: 6 }}>Ambiguous</h4>
          {grouped.ambiguous.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {grouped.ambiguous.map(({ it, idx }) => {
                const a = it as Extract<PreviewItem, { kind: "ambiguous" }>;
                return (
                  <div key={idx} style={{ padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
                    <div style={{ marginBottom: 6 }}>
                      <b>PDF name:</b> <code>{a.name ?? "(none)"}</code>{" "}
                      {a.chip ? (
                        <>
                          • <b>chip:</b> <code>{a.chip}</code>
                        </>
                      ) : null}{" "}
                      {a.result ? (
                        <>
                          • <b>result:</b> <code>{a.result}</code>
                        </>
                      ) : null}
                    </div>

                    <select
                      value={ambiguousSelection[idx] ?? ""}
                      onChange={(e) => setAmbiguousSelection((p) => ({ ...p, [idx]: e.target.value }))}
                    >
                      <option value="">Select horse…</option>
                      {a.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ opacity: 0.75 }}>No ambiguous items.</div>
          )}

          <h4 style={{ marginTop: 12, marginBottom: 6 }}>Unmatched</h4>
          {grouped.unmatched.length ? (
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {grouped.unmatched.map(({ it, idx }) => {
                const u = it as Extract<PreviewItem, { kind: "unmatched" }>;
                return (
                  <li key={idx} style={{ marginBottom: 6 }}>
                    <b>{u.reason}</b>{" "}
                    {u.name ? (
                      <>
                        • name: <code>{u.name}</code>
                      </>
                    ) : null}{" "}
                    {u.chip ? (
                      <>
                        • chip: <code>{u.chip}</code>
                      </>
                    ) : null}{" "}
                    {u.result ? (
                      <>
                        • result: <code>{u.result}</code>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div style={{ opacity: 0.75 }}>No unmatched items.</div>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              onClick={onCommit}
              disabled={!canCommit || busy}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: busy ? "#f5f5f5" : "white",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 900,
              }}
            >
              {busy ? "Saving..." : "Commit approved tests"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
