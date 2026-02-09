"use client";

import { useState } from "react";
import { Play, Download } from "lucide-react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import AnnouncementBar from "./announcement-bar";

/** Set a YouTube video ID to enable the embed. Leave empty for placeholder. */
const YOUTUBE_VIDEO_ID = "";

interface HeroProps {
  onDownloadExtension?: () => void;
}

export function Hero({ onDownloadExtension }: HeroProps) {
  const [showVideo, setShowVideo] = useState(false);

  return (
    <section className="relative flex flex-col items-center w-full max-w-6xl mx-auto px-4 pt-14 md:pt-24 lg:pt-32">
      {/* Staggered CSS entrance */}
      <div className="hero-enter hero-enter-1">
        <AnnouncementBar />
      </div>

      <h1 className="hero-enter hero-enter-2 mt-6 font-bold text-4xl md:text-5xl lg:text-6xl text-center font-heading leading-[1.1] tracking-tight max-w-3xl">
        Your Browser,{" "}
        <span className="text-gradient">Supercharged</span>
        <br />
        with AI
      </h1>

      <p className="hero-enter hero-enter-3 mt-5 text-base lg:text-lg text-muted-foreground text-center max-w-xl leading-relaxed">
        <strong className="font-semibold font-heading text-gradient">
          Kaizen
        </strong>{" "}
        turns browsing into learning. Focus tracking, smart summaries, and
        adaptive quizzes&mdash;all private by default.
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

      {/* Video embed */}
      <div className="hero-enter hero-enter-5 relative w-full max-w-4xl mx-auto aspect-video rounded-2xl overflow-hidden mt-14 lg:mt-20 shadow-xl shadow-black/[0.06] dark:shadow-black/20 border border-border/40">
        {showVideo && YOUTUBE_VIDEO_ID ? (
          <iframe
            src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            title="Kaizen Demo"
          />
        ) : (
          <button
            onClick={() => YOUTUBE_VIDEO_ID && setShowVideo(true)}
            className="w-full h-full flex flex-col items-center justify-center relative group"
          >
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/30" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808006_1px,transparent_1px),linear-gradient(to_bottom,#80808006_1px,transparent_1px)] bg-[size:32px_32px]" />

            {/* Play button */}
            <div className="relative z-10 flex flex-col items-center gap-4">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25 group-hover:scale-105 transition-transform play-pulse">
                <Play size={24} className="text-white fill-white ml-0.5" />
              </div>
              <span className="text-xs font-medium text-muted-foreground font-mono uppercase tracking-[0.15em]">
                {YOUTUBE_VIDEO_ID ? "Watch Demo" : "Demo Coming Soon"}
              </span>
            </div>

            {/* Corner brackets */}
            <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-blue-500/15 rounded-tl" />
            <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-blue-500/15 rounded-tr" />
            <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-blue-500/15 rounded-bl" />
            <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-blue-500/15 rounded-br" />
          </button>
        )}
      </div>
    </section>
  );
}
