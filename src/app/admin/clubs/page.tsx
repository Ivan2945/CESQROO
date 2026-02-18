"use client";

import { requireAdmin } from "@/lib/auth/requireAdmin";
import { useActionState } from "react";
import { createClubAction } from "./actions";
import type { ActionResult } from "../actionTypes";

type Club = { id: string; name: string; slug: string | null };

export default function AdminClubsPage() {
  const [state, formAction] = useActionState<ActionResult<Club>, FormData>(
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
            Created: <b>{state.data.name}</b>
            {state.data.slug ? ` (${state.data.slug})` : ""}
          </p>
        ) : null}
      </form>
    </main>
  );
}

