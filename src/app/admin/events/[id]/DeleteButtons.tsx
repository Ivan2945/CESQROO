"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSubmissionAction, deleteEntryAction, setEntryStatusAction, mergeDuplicateSubmissionsAction } from "./actions";

export function MergeDuplicatesButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Combinar inscripciones duplicadas? Cada club quedará con UNA sola inscripción; las participaciones se mueven, no se borran.")) return;
        start(async () => {
          const res = await mergeDuplicateSubmissionsAction(eventId);
          alert(res && res.message ? res.message : "Listo.");
          router.refresh();
        });
      }}
      className="rounded-md border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300"
    >
      {pending ? "Combinando…" : "Combinar duplicados"}
    </button>
  );
}

export function CancelEntryButton({ entryId, eventId, cancelled }: { entryId: string; eventId: string; cancelled: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setEntryStatusAction(entryId, eventId, cancelled ? "active" : "cancelled");
          if (res && !res.ok) alert(res.message);
          router.refresh();
        })
      }
      className={
        "text-xs font-semibold hover:underline disabled:opacity-50 " +
        (cancelled ? "text-emerald-600" : "text-amber-600")
      }
    >
      {pending ? "…" : cancelled ? "Restaurar" : "Cancelar"}
    </button>
  );
}

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
