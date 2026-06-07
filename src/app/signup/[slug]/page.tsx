import SignupClient from "./SignupClient";

export const dynamic = "force-dynamic";

export default async function PublicSignupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <SignupClient slug={slug} />;
}
