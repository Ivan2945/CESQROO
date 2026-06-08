"use client";

import { useActionState } from "react";
import { createClubAction } from "./actions";
import type { ActionResult } from "@/lib/types/actions";

type Club = {
  id: string;
  name: string;
  slug: string | null;
};

export default function AdminClubsForm() {
  const [state, formAction] = useActionState<ActionResult<Club>, FormData>(
    createClubAction,
    null
  );

  return (
    <form
      action={formAction}
      style={{
        display: "grid",
        gap: 8,
        maxWidth: 420,
        marginTop: 16,
      }}
    >
      <input name="name" placeholder="Nombre del Club" required />
      <input name="slug" placeholder="slug (optional)" />
      <button type="submit">Crear Club</button>

      {state?.message ? (
        <p style={{ margin: 0, color: state.ok ? "green" : "crimson" }}>
          {state.message}
        </p>
      ) : null}

      {state?.ok && state.data ? (
        <p style={{ margin: 0, opacity: 0.8 }}>
          Created: <b>{state.data.name}</b>
          {state.data.slug ? ` (${state.data.slug})` : ""}
        </p>
      ) : null}
    </form>
  );
}