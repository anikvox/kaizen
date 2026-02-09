"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@kaizen/ui";
import { FadeIn } from "./fade-in";

export default function Faq() {
  return (
    <FadeIn className="w-full max-w-5xl mx-auto px-4">
      <div className="text-center mb-10">
        <h2 className="text-2xl md:text-3xl font-bold font-heading tracking-tight mb-3">
          Frequently Asked Questions
        </h2>
        <p className="max-w-lg mx-auto text-muted-foreground leading-relaxed text-sm">
          Everything you need to know about Kaizen.
        </p>
      </div>

      <div className="w-full max-w-3xl mx-auto rounded-2xl card-surface overflow-hidden !transform-none divide-y divide-border/30">
        {faqs.map((faq, i) => (
          <FaqItem key={i} question={faq.question} answer={faq.answer} />
        ))}
      </div>
    </FadeIn>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 px-6 text-left group"
      >
        <span
          className={cn(
            "font-semibold text-sm md:text-[15px] transition-colors pr-4",
            open
              ? "text-blue-600 dark:text-blue-400"
              : "text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400"
          )}
        >
          {question}
        </span>
        <ChevronDown
          size={15}
          className={cn(
            "text-muted-foreground flex-shrink-0 transition-transform duration-300",
            open && "rotate-180 text-blue-500"
          )}
        />
      </button>

      {/* CSS grid accordion — no animation library */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

const faqs = [
  {
    question: "What is Kaizen?",
    answer:
      "Kaizen is a focus and wellness companion that tracks your digital attention, sends intelligent nudges when you doomscroll or drift off-topic, and helps you retain what you learn through AI-powered quizzes and insights\u2014all without blocking content.",
  },
  {
    question: "How does the Focus Guardian work?",
    answer:
      "The Focus Guardian is an AI agent that monitors your browsing patterns. It detects doomscrolling, distraction, and focus drift, then sends gentle nudges to help you stay on track. It learns from your feedback to reduce false positives over time.",
  },
  {
    question: "Is my browsing data really private?",
    answer:
      "Yes. You can run AI inference locally on your device using a local LLM, keeping all data on-device. We\u2019re GDPR compliant, and you have full control to export or delete your data at any time.",
  },
  {
    question: "What kind of attention does Kaizen track?",
    answer:
      "Kaizen tracks text you read, images you view, audio you listen to, and YouTube videos you watch. This multimodal tracking helps understand what you\u2019re actually paying attention to, not just which websites you visit.",
  },
  {
    question: "What are Cognitive Health Reports?",
    answer:
      "These reports show metrics like focus duration, late-night usage, browsing fragmentation (rapid tab switching), and your media diet breakdown. They help you understand your digital habits over 7, 14, 30, or 90-day windows.",
  },
  {
    question: "Which browsers are supported?",
    answer:
      "Kaizen works on any Chromium-based browser including Chrome, Edge, Brave, Arc, and Opera.",
  },
];
