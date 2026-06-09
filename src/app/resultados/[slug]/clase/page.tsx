import LiveClassClient from "./LiveClassClient";

export const dynamic = "force-dynamic";

// Public, read-only live view of one class (height × day).
export default async function ClasePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ height?: string; day?: string }>;
}) {
  const { slug } = await params;
  const { height = "", day = "" } = await searchParams;
  return <LiveClassClient slug={slug} height={height} day={day} />;
}
