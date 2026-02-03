"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import {
    Shield,
    Target,
    Brain,
    Eye,
    Activity,
    Sparkles
} from "lucide-react";
import { motion } from "framer-motion";

export function FeaturesBento() {
    return (
        <BentoGrid className="max-w-5xl mx-auto md:auto-rows-[20rem]">
            {items.map((item, i) => (
                <BentoGridItem
                    key={i}
                    title={item.title}
                    description={item.description}
                    header={item.header}
                    className={cn("[&>p:text-lg]", item.className)}
                    icon={item.icon}
                />
            ))}
        </BentoGrid>
    );
}

const SkeletonOne = () => {
    const variants = {
        initial: { x: 0 },
        animate: {
            x: 10,
            rotate: 5,
            transition: { duration: 0.2 },
        },
    };
    const variantsSecond = {
        initial: { x: 0 },
        animate: {
            x: -10,
            rotate: -5,
            transition: { duration: 0.2 },
        },
    };

    return (
        <motion.div
            initial="initial"
            whileHover="animate"
            className="flex flex-1 w-full h-full min-h-[6rem] dark:bg-dot-white/[0.2] bg-dot-black/[0.2] flex-col space-y-2 p-4 mb-4"
        >
            <motion.div
                variants={variants}
                className="flex flex-row rounded-2xl border border-blue-200 dark:border-blue-800/50 p-3 items-center space-x-2 bg-blue-50 dark:bg-blue-950/30"
            >
                <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
                <div className="w-full bg-blue-100 dark:bg-blue-900/50 h-4 rounded-full" />
            </motion.div>
            <motion.div
                variants={variantsSecond}
                className="flex flex-row rounded-2xl border border-blue-200 dark:border-blue-800/50 p-3 items-center space-x-2 w-3/4 ml-auto bg-blue-50 dark:bg-blue-950/30"
            >
                <div className="w-full bg-blue-100 dark:bg-blue-900/50 h-4 rounded-full" />
                <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
            </motion.div>
            <motion.div
                variants={variants}
                className="flex flex-row rounded-2xl border border-blue-200 dark:border-blue-800/50 p-3 items-center space-x-2 bg-blue-50 dark:bg-blue-950/30"
            >
                <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
                <div className="w-full bg-blue-100 dark:bg-blue-900/50 h-4 rounded-full" />
            </motion.div>
        </motion.div>
    );
};

const SkeletonTwo = () => {
    const [widths, setWidths] = useState<string[]>([]);

    useEffect(() => {
        setWidths(new Array(6).fill(0).map(() => `${Math.random() * (100 - 40) + 40}%`));
    }, []);

    const variants = {
        initial: { width: 0 },
        animate: { width: "100%", transition: { duration: 0.2 } },
        hover: { width: ["0%", "100%"], transition: { duration: 2 } },
    };

    return (
        <motion.div
            initial="initial"
            animate="animate"
            whileHover="hover"
            className="flex flex-1 w-full h-full min-h-[6rem] dark:bg-dot-white/[0.2] bg-dot-black/[0.2] flex-col space-y-2 p-4 mb-4"
        >
            {widths.length > 0 ? (
                widths.map((w, i) => (
                    <motion.div
                        key={"skelenton-two" + i}
                        variants={variants}
                        style={{ maxWidth: w }}
                        className="flex flex-row rounded-full border border-emerald-200 dark:border-emerald-800/50 p-2 items-center space-x-2 bg-emerald-50 dark:bg-emerald-950/30 w-full h-4"
                    />
                ))
            ) : (
                new Array(6).fill(0).map((_, i) => (
                    <div key={i} className="rounded-full bg-neutral-100 dark:bg-black w-full h-4 opacity-0" />
                ))
            )}
        </motion.div>
    );
};

const SkeletonThree = () => {
    const variants = {
        initial: { backgroundPosition: "0 50%" },
        animate: { backgroundPosition: ["0, 50%", "100% 50%", "0 50%"] },
    };
    return (
        <motion.div
            initial="initial"
            animate="animate"
            variants={variants}
            transition={{
                duration: 5,
                repeat: Infinity,
                repeatType: "reverse",
            }}
            className="flex flex-1 w-full h-full min-h-[6rem] rounded-lg flex-col space-y-2"
            style={{
                background: "linear-gradient(-45deg, #ec4899, #8b5cf6, #3b82f6, #06b6d4)",
                backgroundSize: "400% 400%",
            }}
        >
            <motion.div className="h-full w-full rounded-lg"></motion.div>
        </motion.div>
    );
};

const SkeletonFour = () => {
    return (
        <motion.div
            initial="initial"
            animate="animate"
            whileHover="hover"
            className="flex flex-1 w-full h-full min-h-[6rem] dark:bg-dot-white/[0.2] bg-dot-black/[0.2] flex-row space-x-2 p-4"
        >
            <div className="flex-1 rounded-2xl bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-950/50 dark:to-blue-950/50 border border-purple-200 dark:border-purple-800/50 p-4 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6 text-white" />
                </div>
                <p className="text-xs text-center text-gray-700 dark:text-gray-300 font-medium">
                    AI-powered insights from your browsing
                </p>
            </div>
        </motion.div>
    );
};

const SkeletonFive = () => {
    const variants = {
        initial: { x: 0 },
        animate: {
            x: 10,
            rotate: 5,
            transition: { duration: 0.2 },
        },
    };
    const variantsSecond = {
        initial: { x: 0 },
        animate: {
            x: -10,
            rotate: -5,
            transition: { duration: 0.2 },
        },
    };

    return (
        <motion.div
            initial="initial"
            whileHover="animate"
            className="flex flex-1 w-full h-full min-h-[6rem] dark:bg-dot-white/[0.2] bg-dot-black/[0.2] flex-col space-y-2 p-4 mb-4"
        >
            <motion.div
                variants={variants}
                className="flex flex-row rounded-2xl border border-teal-200 dark:border-teal-800/50 p-3 items-start space-x-2 bg-teal-50 dark:bg-teal-950/30"
            >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex-shrink-0 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-white" />
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300">Track your focus patterns</p>
            </motion.div>
            <motion.div
                variants={variantsSecond}
                className="flex flex-row rounded-2xl border border-teal-200 dark:border-teal-800/50 p-3 items-center justify-end space-x-2 w-3/4 ml-auto bg-teal-50 dark:bg-teal-950/30"
            >
                <p className="text-xs text-gray-700 dark:text-gray-300">2.5 hours today</p>
                <div className="h-6 w-6 rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 flex-shrink-0" />
            </motion.div>
        </motion.div>
    );
};

const items = [
    {
        title: "Smart Focus Sessions",
        description: (
            <span className="text-sm">
                Track your attention patterns without disruption. Understand what helps you focus and what breaks your flow.
            </span>
        ),
        header: <SkeletonOne />,
        className: "md:col-span-1",
        icon: <Target className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "AI-Powered Insights",
        description: (
            <span className="text-sm">
                Gemini Flash analyzes your browsing to generate actionable summaries and learning insights.
            </span>
        ),
        header: <SkeletonTwo />,
        className: "md:col-span-1",
        icon: <Brain className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Knowledge Retention",
        description: (
            <span className="text-sm">
                Auto-generated quizzes from your browsing history. Active recall to help you remember what matters.
            </span>
        ),
        header: <SkeletonThree />,
        className: "md:col-span-1",
        icon: <Brain className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Privacy by Design",
        description: (
            <span className="text-sm">
                Optional local LLM inference keeps your data on-device. GDPR compliant with full control over your information.
            </span>
        ),
        header: <SkeletonFour />,
        className: "md:col-span-2",
        icon: <Shield className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Real-Time Tracking",
        description: (
            <span className="text-sm">
                Monitor your focus sessions as they happen. Get instant feedback on your productivity patterns.
            </span>
        ),
        header: <SkeletonFive />,
        className: "md:col-span-1",
        icon: <Eye className="h-4 w-4 text-neutral-500" />,
    },
];
