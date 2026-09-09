"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSubmissionAction } from "./actions";

type Submission = {
  id: string;
  club_name: string;
  representative: string | null;
  coach: string | null;
  phone: string | null;
  email: string | null;
};

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const label = "block text-xs font-semibold text-slate-600 mb-1 dark:text-slate-300";

export function EditSubmissionButton({ submission, eventId }: { submission: Submission; eventId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();

  const [representative, setRepresentative] = useState(submission.representative ?? "");
  const [coach, setCoach] = useState(submission.coach ?? "");
  const [phone, setPhone] = useState(submission.phone ?? "");
  const [email, setEmail] = useState(submission.email ?? "");

  function reset() {
    setRepresentative(submission.representative ?? "");
    setCoach(submission.coach ?? "");
    setPhone(submission.phone ?? "");
    setEmail(submission.email ?? "");
    setErr("");
  }

  function save() {
    setErr("");
    start(async () => {
      const res = await updateSubmissionAction({ submissionId: submission.id, eventId, representative, coach, phone, email });
      if (res && !res.ok) { setErr(res.message); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => { reset(); setOpen(true); }} className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
        Editar contacto
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Editar contacto</h3>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{submission.club_name}</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={label}>Correo</label>
                <input type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contacto@club.com" />
                <p className="mt-1 text-[11px] text-slate-400">Agregar un correo permite a este club editar sus inscripciones por su cuenta.</p>
              </div>
              <div>
                <label className={label}>Representante</label>
                <input className={field} value={representative} onChange={(e) => setRepresentative(e.target.value)} />
              </div>
              <div>
                <label className={label}>Coach</label>
                <input className={field} value={coach} onChange={(e) => setCoach(e.target.value)} />
              </div>
              <div>
                <label className={label}>Teléfono</label>
                <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>

            {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancelar</button>
              <button type="button" disabled={pending} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
