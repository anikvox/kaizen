import { auth } from "@clerk/nextjs/server";
import { LandingPage } from "@/components/landing-page";
import { Dashboard } from "@/components/dashboard";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    return <LandingPage />;
  }

  return <Dashboard />;
}
