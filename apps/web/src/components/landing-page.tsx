"use client";

import { useState } from "react";
import { Manrope, Poppins } from "next/font/google";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight, X, Settings, FolderOpen, Puzzle, CheckCircle, Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@kaizen/ui";
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

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

function InstallModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl max-w-4xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Puzzle className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Install Kaizen Extension</h2>
              <p className="text-sm text-muted-foreground">Follow these steps to get started</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Grid Layout */}
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Step 1 */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm mb-3">
                1
              </div>
              <h3 className="font-semibold mb-2 text-sm">Unzip the file</h3>
              <p className="text-xs text-muted-foreground">
                Extract <code className="px-1 py-0.5 bg-muted rounded text-[10px]">kaizen-extension.zip</code> to a folder.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm mb-3">
                2
              </div>
              <h3 className="font-semibold mb-2 text-sm">Open Extensions</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Go to <a href="chrome://extensions" target="_blank" rel="noopener noreferrer" className="px-1 py-0.5 bg-muted rounded text-[10px] text-blue-500 hover:text-blue-600 hover:underline">chrome://extensions</a>
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm mb-3">
                3
              </div>
              <h3 className="font-semibold mb-2 text-sm">Developer Mode</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Enable the toggle in the top-right corner.
              </p>
              <div className="flex items-center gap-1.5 p-2 bg-background rounded-lg text-xs">
                <Settings className="w-3 h-3 text-muted-foreground" />
                <span>Dev mode</span>
                <div className="ml-auto w-8 h-4 bg-blue-600 rounded-full relative">
                  <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" />
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm mb-3">
                4
              </div>
              <h3 className="font-semibold mb-2 text-sm">Load Unpacked</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Click the button and select the extracted folder.
              </p>
              <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-background rounded-lg text-xs">
                <FolderOpen className="w-3 h-3" />
                Load unpacked
              </div>
            </div>
          </div>

          {/* Success Note */}
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl mt-4">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-400">
              <span className="font-medium">You&apos;re all set!</span> The extension will appear in your toolbar. Click it to open the side panel!
            </p>
            <Button onClick={onClose} size="sm" className="ml-auto">
              Got it!
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [showInstallModal, setShowInstallModal] = useState(false);

  const handleDownloadExtension = () => {
    // Trigger download
    window.location.href = `${apiUrl}/extension/download`;
    // Show installation instructions modal
    setShowInstallModal(true);
  };

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
        <Hero onDownloadExtension={handleDownloadExtension} />

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
                Ready to{" "}
                <span className="text-gradient">Understand Your Focus</span>?
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-7 text-sm leading-relaxed">
                Stop doomscrolling. Start retaining what you read. Get gentle nudges when you drift&mdash;from AI that respects your privacy.
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
                <button
                  onClick={handleDownloadExtension}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download size={14} />
                  Download Extension
                </button>
              </div>
            </div>
          </div>
        </FadeIn>
      </main>

      <Footer />

      {/* Install Instructions Modal */}
      <InstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </div>
  );
}
