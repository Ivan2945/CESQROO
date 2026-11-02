import type { CountSummary } from "@/lib/events/uniqueCounts";

const pill = "rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";

export function CountPills({ counts, size = "sm" }: { counts: CountSummary; size?: "sm" | "md" }) {
  const cls = size === "md" ? pill.replace("px-2.5 py-0.5 text-xs", "px-3 py-1 text-sm") : pill;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={cls}>{counts.participaciones} participación(es)</span>
      <span className={cls}>{counts.jinetes} jinete(s)</span>
      <span className={cls}>{counts.caballos} caballo(s)</span>
    </span>
  );
}
