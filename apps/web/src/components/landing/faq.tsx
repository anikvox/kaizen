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
      "Kaizen is a privacy-first Chrome extension for personal growth and learning. Built by CS students who understand the challenges of focus and retention, it helps you stay on track without blocking content or enforcing rigid workflows.",
  },
  {
    question: "Is my browsing data really private?",
    answer:
      "Yes. Privacy is a core principle. We offer local LLM inference so your data stays on your device and remains GDPR compliant. Your browsing data never leaves your machine unless you choose otherwise.",
  },
  {
    question: "What AI technology does Kaizen use?",
    answer:
      "Kaizen uses Gemini Flash for fast reasoning and insights. We\u2019ve integrated Comet Opik for observability and evaluation, allowing continuous improvement of prompt quality while maintaining your privacy.",
  },
  {
    question: "Can I export my data?",
    answer:
      "We provide a full dashboard to view insights and track progress. We\u2019re also working on additional data portability features to give you complete control over your information.",
  },
  {
    question: "Which browsers are supported?",
    answer:
      "Kaizen is available as a Chrome extension and works on any Chromium-based browser including Chrome, Edge, Brave, and Arc.",
  },
];
