import EditClient from "./EditClient";

export const dynamic = "force-dynamic";

export default async function PublicEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <EditClient slug={slug} />;
}
