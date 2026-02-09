"use client";

import { Download } from "lucide-react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import AnnouncementBar from "./announcement-bar";

interface HeroProps {
  onDownloadExtension?: () => void;
}

export function Hero({ onDownloadExtension }: HeroProps) {

  return (
    <section className="relative flex flex-col items-center w-full max-w-6xl mx-auto px-4 pt-14 md:pt-24 lg:pt-32">
      {/* Staggered CSS entrance */}
      <div className="hero-enter hero-enter-1">
        <AnnouncementBar />
      </div>

      <h1 className="hero-enter hero-enter-2 mt-6 font-bold text-4xl md:text-5xl lg:text-6xl text-center font-heading leading-[1.1] tracking-tight max-w-3xl">
        <span className="text-gradient">Focus</span> that Follows You
      </h1>

      <p className="hero-enter hero-enter-3 mt-5 text-base lg:text-lg text-muted-foreground text-center max-w-xl leading-relaxed">
        A browser extension that tracks where your attention actually goes and gently helps you stay on track&mdash;without blocking content or rigid workflows.
      </p>

      <p className="hero-enter hero-enter-3 mt-3 text-sm text-muted-foreground/80 text-center max-w-md">
        Built by CS students with ADHD who wanted a tool that understands attention patterns, not one that locks you out.
      </p>

      {/* CTAs */}
      <div className="hero-enter hero-enter-4 flex items-center gap-3 mt-8">
        <SignedIn>
          <Link href="/">
            <button className="btn-shimmer rounded-lg px-6 py-2.5 text-sm font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all">
              Go to Dashboard
            </button>
          </Link>
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn-shimmer rounded-lg px-6 py-2.5 text-sm font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer">
              Get Started Free
            </button>
          </SignInButton>
        </SignedOut>
        <button
          onClick={onDownloadExtension}
          className="hidden sm:flex items-center h-10 px-5 rounded-lg font-semibold gap-1.5 border border-border/60 bg-transparent text-foreground hover:border-blue-500/40 hover:bg-blue-500/10 transition-all"
        >
          <Download size={14} />
          Download Extension
        </button>
      </div>

      {/* Screenshots showcase */}
      <div className="hero-enter hero-enter-5 w-full max-w-5xl mx-auto mt-14 lg:mt-20">
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8">
          {/* Extension side panel */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-br from-blue-500/20 to-emerald-500/20 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
            <img
              src="/screenshots/extension-sidepanel.png"
              alt="Kaizen Extension Side Panel"
              className="relative w-[240px] md:w-[280px] rounded-2xl shadow-xl shadow-black/[0.08] dark:shadow-black/30 border border-border/40"
            />
          </div>

          {/* Focus nudge */}
          <div className="flex flex-col gap-4">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
              <img
                src="/screenshots/focus-nudge.png"
                alt="Focus Guardian Nudge"
                className="relative w-[320px] md:w-[380px] rounded-xl shadow-lg shadow-black/[0.06] dark:shadow-black/20 border border-border/40"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Gentle nudges when you drift — not walls that block you
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
