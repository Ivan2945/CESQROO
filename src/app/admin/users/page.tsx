"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/types/actions";

import { createUserAction, type CreatedUser } from "./actions";

export default function AdminUsersPage() {
  const [state, formAction] = useActionState<ActionResult<CreatedUser>, FormData>(
    createUserAction,
    null
  );

  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Admin • Create User</h1>

      <form action={formAction} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input name="email" type="email" required style={{ padding: 10 }} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Name</span>
          <input name="name" required style={{ padding: 10 }} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Role</span>
          <select name="role" required defaultValue="user" style={{ padding: 10 }}>
            <option value="user">User</option>
            <option value="club_admin">Club Admin</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Club ID (required for User / Club Admin)</span>
          <input name="club_id" placeholder="UUID of club" style={{ padding: 10 }} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password (optional)</span>
          <input
            name="password"
            type="text"
            placeholder="Leave blank to invite (recommended)"
            style={{ padding: 10 }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input name="send_invite" type="checkbox" defaultChecked />
          <span>Send invite email (recommended). If password is set, user is created immediately.</span>
        </label>

        <button type="submit" style={{ padding: 10 }}>
          Create user
        </button>

        {state?.message ? (
          <p style={{ margin: 0, color: state.ok ? "green" : "crimson" }}>{state.message}</p>
        ) : null}

        {state?.ok ? (
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Created</div>
            <div><b>Email:</b> {state.data.email}</div>
            <div><b>User ID:</b> {state.data.user_id}</div>
            <div><b>Name:</b> {state.data.name}</div>
            <div><b>Role:</b> {state.data.role}</div>
            <div><b>Club ID:</b> {state.data.club_id ?? "—"}</div>
            <div><b>Invited:</b> {state.data.invited ? "Yes" : "No"}</div>
          </div>
        ) : null}
      </form>
    </main>
  );
}

