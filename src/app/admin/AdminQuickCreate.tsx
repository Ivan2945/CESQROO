"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";

import { useFormStatus } from "react-dom";
import type { ActionResult } from "./actionTypes";

type Club = { id: string; name: string | null };
type Panel = "club" | "rider" | "horse" | "test";


function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{ padding: 10, opacity: pending ? 0.6 : 1 }}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function Message({ state }: { state: ActionResult<any> }) {
  if (!state) return null;
  return (
    <p style={{ margin: 0, opacity: 0.85 }}>
      {state.ok ? "✅ " : "⚠️ "}
      {state.message}
    </p>
  );
}

export default function AdminQuickCreate({
  clubs,
  createClubAction,
  createRiderAction,
  createHorseAction,
  createHorseTestAction,
}: {
  clubs: Club[];
  createClubAction: (
    prevState: ActionResult<{ id: string; name: string; slug: string | null }>,
    formData: FormData
  ) => Promise<ActionResult<{ id: string; name: string; slug: string | null }>>;
 createRiderAction: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
createHorseAction: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
createHorseTestAction: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;

}) {

  const [open, setOpen] = useState<Panel | null>(null);

  // Shared club selection for the "test" panel to load horses
  const [testClubId, setTestClubId] = useState<string>("");
  const [horses, setHorses] = useState<Array<{ id: string; name: string | null }>>([]);
  const [horsesLoading, setHorsesLoading] = useState(false);

  const buttonStyle: React.CSSProperties = useMemo(
    () => ({
      padding: "10px 12px",
      border: "1px solid #ddd",
      borderRadius: 10,
      cursor: "pointer",
      fontWeight: 600,
    }),
    []
  );

  const cardStyle: React.CSSProperties = useMemo(
    () => ({
      marginTop: 12,
      padding: 12,
      border: "1px solid #eee",
      borderRadius: 10,
      maxWidth: 560,
    }),
    []
  );

  const inputStyle: React.CSSProperties = useMemo(
    () => ({ display: "block", width: "100%", padding: 8 }),
    []
  );

  function toggle(key: Panel) {
    setOpen((prev) => (prev === key ? null : key));
  }

  function ClubSelect({
    name = "club_id",
    value,
    onChange,
  }: {
    name?: string;
    value?: string;
    onChange?: (v: string) => void;
  }) {
    return (
      <label>
        Club
        <select
          name={name}
          required
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          style={inputStyle}
        >
          <option value="" disabled>
            Select club…
          </option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? c.id}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // Load horses for test dropdown whenever testClubId changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!testClubId) {
        setHorses([]);
        return;
      }

      setHorsesLoading(true);
      try {
        const res = await fetch(`/api/admin/horses?club_id=${encodeURIComponent(testClubId)}`);
        const json = (await res.json()) as { ok: boolean; horses?: any[]; message?: string };

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setHorses([]);
          return;
        }
        setHorses(json.horses ?? []);
      } finally {
        if (!cancelled) setHorsesLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [testClubId]);

  // Hook up useActionState for each form so we can show success/errors
  const [clubState, clubFormAction] = useActionState(createClubAction, null);
  const [riderState, riderFormAction] = useActionState(createRiderAction, null);
  const [horseState, horseFormAction] = useActionState(createHorseAction, null);
  const [testState, testFormAction] = useActionState(createHorseTestAction, null);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={buttonStyle} onClick={() => toggle("club")}>
          + Add Club
        </button>
        <button type="button" style={buttonStyle} onClick={() => toggle("rider")}>
          + Add Rider
        </button>
        <button type="button" style={buttonStyle} onClick={() => toggle("horse")}>
          + Add Horse
        </button>
        <button type="button" style={buttonStyle} onClick={() => toggle("test")}>
          + Add Test
        </button>
      </div>

      {/* Add Club */}
      {open === "club" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Add Club</h3>

          <form action={clubFormAction} style={{ display: "grid", gap: 10 }}>
            <label>
              Name
              <input name="name" required style={inputStyle} />
            </label>

            <SubmitButton>Create Club</SubmitButton>
            <Message state={clubState} />
          </form>
        </div>
      )}

      {/* Add Rider */}
      {open === "rider" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Add Rider</h3>

          <form action={riderFormAction} style={{ display: "grid", gap: 10 }}>
            <ClubSelect />

            <label>
              First name
              <input name="first_name" required style={inputStyle} />
            </label>

            <label>
              Last name
              <input name="last_name" required style={inputStyle} />
            </label>

            <label>
              Email
              <input name="email" type="email" style={inputStyle} />
            </label>

            <label>
              Phone
              <input name="phone" style={inputStyle} />
            </label>

            <label>
              Notes
              <textarea name="notes" rows={4} style={inputStyle} />
            </label>

            <SubmitButton>Create Rider</SubmitButton>
            <Message state={riderState} />
          </form>
        </div>
      )}

      {/* Add Horse */}
      {open === "horse" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Add Horse</h3>

          <form action={horseFormAction} style={{ display: "grid", gap: 10 }}>
            <ClubSelect />

            <label>
              Name
              <input name="name" required style={inputStyle} />
            </label>

            <label>
              Sex
              <input name="sex" placeholder="M/F/Gelding/etc" style={inputStyle} />
            </label>

            <label>
              Birth year
              <input
                name="birth_year"
                type="number"
                min={1900}
                max={new Date().getFullYear()}
                style={inputStyle}
              />
            </label>

            <label>
              Microchip
              <input name="microchip" style={inputStyle} />
            </label>

            <label>
              Notes
              <textarea name="notes" rows={4} style={inputStyle} />
            </label>

            <SubmitButton>Create Horse</SubmitButton>
            <Message state={horseState} />
          </form>
        </div>
      )}

      {/* Add Test */}
      {open === "test" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Add Medical Test</h3>

          <form action={testFormAction} style={{ display: "grid", gap: 10 }}>
            <ClubSelect
              value={testClubId}
              onChange={(v) => {
                setTestClubId(v);
              }}
            />

            <label>
              Horse
              <select name="horse_id" required defaultValue="" style={inputStyle} disabled={!testClubId}>
                <option value="" disabled>
                  {testClubId
                    ? horsesLoading
                      ? "Loading horses…"
                      : "Select horse…"
                    : "Select a club first…"}
                </option>
                {horses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name ?? h.id}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Test type
              <input name="test_type" defaultValue="Mandatory 6-month test" style={inputStyle} />
            </label>

            <label>
              Reg number (optional)
              <input name="reg_number" style={inputStyle} />
            </label>

            <label>
              Test date
              <input name="test_date" type="date" required style={inputStyle} />
            </label>

            <SubmitButton>Add Test</SubmitButton>
            <Message state={testState} />

            <p style={{ margin: 0, opacity: 0.7 }}>
              Expiration is auto set to <b>test date + 180 days</b>.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
