import { auth } from "@clerk/nextjs/server";
import { LandingPage } from "@/components/landing-page";
import { Dashboard } from "@/components/dashboard";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId } = await auth();
  const params = await searchParams;

  if (!userId) {
    return <LandingPage />;
  }

  return <Dashboard initialTab={params.tab} />;
}
