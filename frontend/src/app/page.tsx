"use client";

import React from "react";
import Navbar from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { FeaturesWithHeading } from "@/components/landing/features";
import { FeaturesBento } from "@/components/landing/features-bento";
import Comparison from "@/components/landing/comparison";
import Faq from "@/components/landing/faq";
import Footer from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-blue-600 selection:text-white font-sans overflow-x-hidden">
      {/* Background Grid Effect */}
      <div className="fixed inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <header className="sticky top-0 px-0 md:p-2 w-full flex justify-center items-center z-50">
        <Navbar />
      </header>

      <main className="relative flex flex-col min-h-screen w-full px-2 md:px-0">
        <Hero />

        <section className="flex flex-col items-center space-y-16 md:space-y-32 my-16 md:my-32">
          <FeaturesWithHeading />
          <FeaturesBento />
          <Comparison />
          <Faq />
        </section>
      </main>

      <Footer />
    </div>
  );
}
