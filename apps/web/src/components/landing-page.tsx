import { Manrope, Poppins } from "next/font/google";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Navbar from "./landing/navbar";
import { Hero } from "./landing/hero";
import { FeaturesWithHeading } from "./landing/features";
import { FeaturesBento } from "./landing/features-bento";
import Comparison from "./landing/comparison";
import Faq from "./landing/faq";
import Footer from "./landing/footer";
import { FadeIn } from "./landing/fade-in";
import "./landing/landing.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-landing-sans",
});

const poppins = Poppins({
  weight: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-landing-heading",
});

export function LandingPage() {
  return (
    <div
      className={`${manrope.variable} ${poppins.variable} landing-page relative min-h-screen bg-background text-foreground antialiased`}
    >
      {/* Background: subtle grid */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(to_right,#80808006_1px,transparent_1px),linear-gradient(to_bottom,#80808006_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Navbar */}
      <header className="sticky top-0 px-3 pt-3 lg:pt-4 w-full flex justify-center z-50">
        <Navbar />
      </header>

      {/* Content */}
      <main className="relative z-10 overflow-x-hidden">
        <Hero />

        <div className="flex flex-col items-center gap-24 md:gap-32 mt-24 md:mt-32">
          <div className="divider w-full max-w-sm mx-auto" />
          <FeaturesWithHeading />
          <div className="divider w-full max-w-sm mx-auto" />
          <FeaturesBento />
          <div className="divider w-full max-w-sm mx-auto" />
          <Comparison />
          <div className="divider w-full max-w-sm mx-auto" />
          <Faq />
        </div>

        {/* CTA */}
        <FadeIn className="w-full max-w-4xl mx-auto px-4 mt-32 mb-8">
          <div className="relative rounded-2xl overflow-hidden glass p-10 md:p-14 text-center">
            {/* Subtle blue tint */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.04] to-transparent dark:from-blue-500/[0.08] pointer-events-none" />

            <div className="relative">
              <h2 className="text-2xl md:text-3xl font-bold font-heading tracking-tight mb-3">
                Ready to Transform{" "}
                <span className="text-gradient">Your Learning?</span>
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-7 text-sm leading-relaxed">
                Join learners who use Kaizen to enhance knowledge retention and
                accelerate growth. Free to get started.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="btn-shimmer rounded-lg px-6 py-2.5 text-sm font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer">
                      Get Started Free
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Link href="/">
                    <button className="btn-shimmer rounded-lg px-6 py-2.5 text-sm font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all">
                      Open Dashboard
                    </button>
                  </Link>
                </SignedIn>
                <a
                  href="#faqs"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Have questions?
                  <ArrowRight size={13} />
                </a>
              </div>
            </div>
          </div>
        </FadeIn>
      </main>

      <Footer />
    </div>
  );
}
