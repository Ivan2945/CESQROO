"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSubmissionAction, deleteEntryAction } from "./actions";

export function DeleteSubmissionButton({ submissionId, eventId, clubName }: { submissionId: string; eventId: string; clubName: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Eliminar toda la inscripción de "${clubName}"? Se borrarán todas sus participaciones.`)) return;
        start(async () => {
          const res = await deleteSubmissionAction(submissionId, eventId);
          if (res && !res.ok) alert(res.message);
          router.refresh();
        });
      }}
      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Eliminando…" : "Eliminar inscripción"}
    </button>
  );
}

export function DeleteEntryButton({ entryId, eventId }: { entryId: string; eventId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Eliminar esta participación?")) return;
        start(async () => {
          const res = await deleteEntryAction(entryId, eventId);
          if (res && !res.ok) alert(res.message);
          router.refresh();
        });
      }}
      className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "…" : "Eliminar"}
    </button>
  );
}
