"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function Faq() {
    return (
        <section id="faqs" className="w-full max-w-5xl mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold font-heading text-center mb-8 md:mb-12">
                Frequently Asked Questions
            </h1>
            <div className="w-full max-w-4xl mx-auto space-y-2">
                {faqs.map((faq, index) => (
                    <FaqItem key={index} question={faq.question} answer={faq.answer} />
                ))}
            </div>
        </section>
    );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border-b border-border transition-all duration-300">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-6 text-left hover:underline group"
            >
                <span className={cn(
                    "font-semibold text-base md:text-lg transition-colors",
                    isOpen ? "text-blue-500" : "text-foreground group-hover:text-blue-500"
                )}>{question}</span>
                <ChevronDown
                    size={18}
                    className={cn(
                        "text-muted-foreground transition-transform duration-300",
                        isOpen && "rotate-180 text-blue-500"
                    )}
                />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="pb-6 text-sm md:text-lg text-muted-foreground leading-relaxed">
                            {answer}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const faqs = [
    {
        question: "What is Kaizen?",
        answer:
            "Kaizen is a local-first browser extension that uses Gemini Nano (on-device AI) to build a semantic index of your browsing attention. It transforms your raw activity into actionable insights without ever sending data to the cloud.",
    },
    {
        question: "Is it really private?",
        answer:
            "Yes. All inference happens locally in your browser kernel. We have no backend that stores your browsing history or screenshots. Your data lives and dies on your silicon.",
    },
    {
        question: "Does it slow down my browser?",
        answer:
            "Kaizen uses a deterministic concurrency model that locks AI workloads to a priority queue. It monitors system resources to prevent thermal throttling and memory spikes, ensuring your primary browser experience remains fluid.",
    },
    {
        question: "Can I export my data?",
        answer:
            "Currently, we provide a dashboard to view your insights. We are working on full data portability support so you can own your cognitive history in open formats.",
    },
    {
        question: "Which OS are supported?",
        answer:
            "Kaizen works anywhere Chrome (or Chromium-based browsers) supports the Window AI API and Gemini Nano. This currently includes latest versions of Windows, macOS, and Linux with the appropriate flags enabled.",
    },
];
