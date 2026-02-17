"use client";

import { useActionState } from "react";
import { createClubAction, type CreateClubState } from "./actions";

export default function AdminClubsPage() {
  const [state, formAction] = useActionState<CreateClubState | null, FormData>(
    createClubAction,
    null
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin • Clubs</h1>

      <form action={formAction} style={{ display: "grid", gap: 8, maxWidth: 420, marginTop: 16 }}>
        <input name="name" placeholder="Club name" required />
        <input name="slug" placeholder="slug (optional)" />
        <button type="submit">Create club</button>

        {state?.message ? (
          <p style={{ margin: 0, color: state.ok ? "green" : "crimson" }}>
            {state.message}
          </p>
        ) : null}

        {state?.ok ? (
          <p style={{ margin: 0, opacity: 0.8 }}>
            Created: <b>{state.club.name}</b>
            {state.club.slug ? ` (${state.club.slug})` : ""}
          </p>
        ) : null}
      </form>
    </main>
  );
}
