"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/types/actions";

type Club = { id: string; name: string; slug: string | null };
type Panel = "club" | "rider" | "horse" | "test";

type Props = {
  clubs: Club[];
  createClubAction: (
    prevState: ActionResult<Club>,
    formData: FormData
  ) => Promise<ActionResult<Club>>;
  createRiderAction: (
    prevState: ActionResult<void>,
    formData: FormData
  ) => Promise<ActionResult<void>>;
  createHorseAction: (
    prevState: ActionResult<void>,
    formData: FormData
  ) => Promise<ActionResult<void>>;
  createHorseTestAction: (
    prevState: ActionResult<void>,
    formData: FormData
  ) => Promise<ActionResult<void>>;
};

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

function Message({ state }: { state: ActionResult<unknown> }) {
  if (!state) return null;
  return (
    <p style={{ margin: 0, opacity: 0.85 }}>
      {state.ok ? "✅ " : "⚠️ "}
      {state.message ?? (state.ok ? "Saved." : "Something went wrong.")}
    </p>
  );
}

export default function AdminQuickCreate({
  clubs,
  createClubAction,
  createRiderAction,
  createHorseAction,
  createHorseTestAction,
}: Props) {
  const [open, setOpen] = useState<Panel | null>(null);

  // Shared club selection for the "test" panel to load horses
  const [testClubId, setTestClubId] = useState<string>("");
  const [horses, setHorses] = useState<Array<{ id: string; name: string | null }>>(
    []
  );
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
              {c.name}
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
        const res = await fetch(
          `/api/admin/horses?club_id=${encodeURIComponent(testClubId)}`
        );
        const json = (await res.json()) as {
          ok: boolean;
          horses?: Array<{ id: string; name: string | null }>;
          message?: string;
        };

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
  const [clubState, clubFormAction] = useActionState<ActionResult<Club>, FormData>(
    createClubAction,
    null
  );
  const [riderState, riderFormAction] = useActionState<ActionResult<void>, FormData>(
    createRiderAction,
    null
  );
  const [horseState, horseFormAction] = useActionState<ActionResult<void>, FormData>(
    createHorseAction,
    null
  );
  const [testState, testFormAction] = useActionState<ActionResult<void>, FormData>(
    createHorseTestAction,
    null
  );

  return (
    <div style={{ marginTop: 12 }}>
      {/* Panel selector dropdown */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
    

        {/* Optional quick buttons */}
        <button type="button" style={buttonStyle} onClick={() => toggle("club")}>
          + Agregar Club
        </button>
        <button type="button" style={buttonStyle} onClick={() => toggle("rider")}>
          + Agregar Jinete
        </button>
        <button type="button" style={buttonStyle} onClick={() => toggle("horse")}>
          + Agregar Caballo
        </button>
        <button type="button" style={buttonStyle} onClick={() => toggle("test")}>
          + Agregar Coggins
        </button>

        {open && (
          <button type="button" style={{ ...buttonStyle, opacity: 0.85 }} onClick={() => setOpen(null)}>
            Close
          </button>
        )}
      </div>

      {/* Agregar Club */}
      {open === "club" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Agregar Club</h3>

          <form action={clubFormAction} style={{ display: "grid", gap: 10 }}>
            <label>
              Name
              <input name="name" required style={inputStyle} />
            </label>

            <SubmitButton>Crear Club</SubmitButton>
            <Message state={clubState} />
          </form>
        </div>
      )}

      {/* Agregar Jinete */}
      {open === "rider" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Agregar Jinete</h3>

          <form action={riderFormAction} style={{ display: "grid", gap: 10 }}>
            <ClubSelect />

            <label>
              Nombre
              <input name="first_name" required style={inputStyle} />
            </label>

            <label>
              Apellido
              <input name="last_name" required style={inputStyle} />
            </label>

            <label>
              Email
              <input name="email" type="email" style={inputStyle} />
            </label>

            <label>
              Telefono
              <input name="phone" style={inputStyle} />
            </label>

            <label>
              Notas
              <textarea name="notes" rows={4} style={inputStyle} />
            </label>

            <SubmitButton>Crear Jinete</SubmitButton>
            <Message state={riderState} />
          </form>
        </div>
      )}

      {/* Agregar Caballo */}
      {open === "horse" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Agregar Caballo</h3>

          <form action={horseFormAction} style={{ display: "grid", gap: 10 }}>
            <ClubSelect />

            <label>
              Nombre
              <input name="name" required style={inputStyle} />
            </label>

            <label>
              Sexo
              <input name="sex" placeholder="M/F/Gelding/etc" style={inputStyle} />
            </label>

            <label>
              Año de Nacimiento
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
              Notas
              <textarea name="notes" rows={4} style={inputStyle} />
            </label>

            <SubmitButton>Crear Caballo</SubmitButton>
            <Message state={horseState} />
          </form>
        </div>
      )}

      {/* Agregar Coggins */}
      {open === "test" && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Agregar Coggins</h3>

          <form action={testFormAction} style={{ display: "grid", gap: 10 }}>
            <ClubSelect value={testClubId} onChange={(v) => setTestClubId(v)} />

            <label>
              Caballo
              <select
                name="horse_id"
                required
                defaultValue=""
                style={inputStyle}
                disabled={!testClubId}
              >
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
              Tipo de Examen
              <input name="test_type" defaultValue="Mandatory 6-month test" style={inputStyle} />
            </label>

            <label>
              Folio Coggins
              <input name="reg_number" style={inputStyle} />
            </label>

            <label>
              Fecha Resultado
              <input name="test_date" type="date" required style={inputStyle} />
            </label>

            <SubmitButton>Agregar Coggins</SubmitButton>
            <Message state={testState} />

            <p style={{ margin: 0, opacity: 0.7 }}>
              Los resultados expiran  <b>180 días DESPUES de la fecha de Resultado</b>.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
