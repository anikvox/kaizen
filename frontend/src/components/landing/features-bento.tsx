"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import {
    Activity,
    Cpu,
    Settings2,
    Brain,
    Volume2,
    Box
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
            className="flex flex-1 w-full h-full min-h-[6rem] flex-col space-y-2 p-4"
        >
            <motion.div
                variants={variants}
                className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-white dark:bg-black"
            >
                <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
                <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-neutral-900" />
            </motion.div>
            <motion.div
                variants={variantsSecond}
                className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 w-3/4 ml-auto bg-white dark:bg-black"
            >
                <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-neutral-900" />
                <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
            </motion.div>
            <motion.div
                variants={variants}
                className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-white dark:bg-black"
            >
                <div className="h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400 flex-shrink-0" />
                <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-neutral-900" />
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
            className="flex flex-1 w-full h-full min-h-[6rem] flex-col space-y-2 p-4"
        >
            {widths.length > 0 ? (
                widths.map((w, i) => (
                    <motion.div
                        key={"skelenton-two" + i}
                        variants={variants}
                        style={{ maxWidth: w }}
                        className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-neutral-100 dark:bg-black w-full h-4"
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
                background: "linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)",
                backgroundSize: "400% 400%",
            }}
        >
            <motion.div className="h-full w-full rounded-lg"></motion.div>
        </motion.div>
    );
};

const items = [
    {
        title: "Deterministic Inference",
        description: (
            <span className="text-xs">
                AI workloads are orchestrated via a prioritized message queue to prevent contention.
            </span>
        ),
        header: <SkeletonOne />,
        className: "md:col-span-1",
        icon: <Cpu className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Latent Agency",
        description: (
            <span className="text-xs">
                Direct control over Top-K and Temperature. Tune the model's creative output.
            </span>
        ),
        header: <SkeletonTwo />,
        className: "md:col-span-1",
        icon: <Settings2 className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Knowledge Persistence",
        description: (
            <span className="text-xs">
                Active recall as a service. Auto-generated quizzes derived from your history.
            </span>
        ),
        header: <SkeletonThree />,
        className: "md:col-span-1",
        icon: <Brain className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Sonic Perception",
        description: (
            <span className="text-xs">
                Sustained audio attention monitoring. Distill signals from noise at the edge.
            </span>
        ),
        header: <SkeletonOne />,
        className: "md:col-span-2",
        icon: <Volume2 className="h-4 w-4 text-neutral-500" />,
    },
    {
        title: "Edge Cognition",
        description: (
            <span className="text-xs">
                Native image understanding and autonomous captioning via WebAI.
            </span>
        ),
        header: <SkeletonTwo />,
        className: "md:col-span-1",
        icon: <Box className="h-4 w-4 text-neutral-500" />,
    },
];
