import { EventDetail } from "./EventDetail";

export const dynamic = "force-dynamic";

export default async function AdminEventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetail id={id} view="club" />;
}
