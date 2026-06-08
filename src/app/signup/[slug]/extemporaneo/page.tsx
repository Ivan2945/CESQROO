import ExtempClient from "./ExtempClient";

export const dynamic = "force-dynamic";

export default async function ExtempPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ExtempClient slug={slug} />;
}
