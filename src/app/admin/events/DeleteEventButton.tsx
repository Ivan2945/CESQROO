"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEventAction } from "./actions";

export function DeleteEventButton({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const typed = window.prompt(
          `Esto eliminará permanentemente el evento "${eventName}" y TODAS sus inscripciones, resultados y órdenes de salida. Esta acción no se puede deshacer.\n\nEscriba el nombre del evento para confirmar:`
        );
        if (typed == null) return;
        if (typed.trim() !== eventName.trim()) {
          alert("El nombre no coincide. No se eliminó nada.");
          return;
        }
        start(async () => {
          const res = await deleteEventAction(eventId);
          if (res && !res.ok) alert(res.message || "No se pudo eliminar el evento.");
          router.refresh();
        });
      }}
      className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
