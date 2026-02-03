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
            <div className="w-full max-w-4xl mx-auto space-y-2 no-underline">
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
        <div className="border-b border-border transition-all duration-300 no-underline">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-6 text-left group"
            >
                <span className={cn(
                    "font-semibold text-base md:text-lg transition-colors no-underline",
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
            "Kaizen is a privacy-first Chrome extension for personal growth and learning, designed for people who spend most of their time in the browser. Built by CS students who understand the challenges of focus and retention, Kaizen helps you stay on track without blocking content or enforcing rigid workflows.",
    },
    {
        question: "Is it really private?",
        answer:
            "Yes. Privacy is a core principle of Kaizen. We offer an option to run AI inference on a local LLM, so your data stays on your device and remains GDPR compliant. Your browsing data never leaves your machine unless you choose otherwise.",
    },
    {
        question: "What AI technology does Kaizen use?",
        answer:
            "Kaizen uses Gemini Flash for fast reasoning and intelligent insights. We've integrated Comet Opik for observability and evaluation, allowing us to continuously improve prompt quality and model behavior while maintaining your privacy.",
    },
    {
        question: "Can I export my data?",
        answer:
            "We provide a dashboard to view your insights and track your progress. As we continue development, we're working on additional data portability features to give you full control over your information.",
    },
    {
        question: "Which browsers are supported?",
        answer:
            "Kaizen is currently available as a Chrome extension and works on any Chromium-based browser including Chrome, Edge, Brave, and Arc. Support for other browsers may be added in the future.",
    },
];
