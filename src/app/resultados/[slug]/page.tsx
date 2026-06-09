import LiveEventClient from "./LiveEventClient";

export const dynamic = "force-dynamic";

// Public, read-only live results landing for an event.
export default async function ResultadosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LiveEventClient slug={slug} />;
}
