import { EventDetail } from "@/app/admin/events/[id]/EventDetail";

export const dynamic = "force-dynamic";

export default async function AdmonEventoDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetail id={id} view="show" />;
}
