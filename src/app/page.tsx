import { JamifyApp } from "@/components/jamify-app";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ authError?: string }>;
}) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  return <JamifyApp initialUser={user} authError={params.authError ?? null} />;
}
