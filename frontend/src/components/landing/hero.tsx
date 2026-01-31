"use client";

import AnnouncementBar from "./announcement-bar";
import { motion, Variants } from "framer-motion";
import ShinyButton from "./shiny-button";
import Link from "next/link";
import ButtonArrow from "@/components/ui/button-arrow";
import { Play } from "lucide-react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

const container: Variants = {
    hidden: {
        opacity: 0.8,
    },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.2,
        },
    },
};

const variant: any = {
    hidden: {
        opacity: 0,
        y: -10,
    },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.5,
            ease: "easeOut",
        },
    },
};

export function Hero() {
    return (
        <motion.div className="relative flex flex-col items-center w-full max-w-7xl mx-auto px-4">
            <motion.div
                variants={container}
                initial="hidden"
                animate="visible"
                className="pt-12 md:pt-20 lg:pt-28 flex flex-col justify-center items-center gap-y-2 lg:gap-y-4 z-30 mb-4"
            >
                <motion.div variants={variant}>
                    <AnnouncementBar />
                </motion.div>

                <motion.h1
                    variants={variant}
                    className="font-medium text-3xl lg:text-7xl max-w-4xl w-full text-center font-heading leading-tight md:leading-[1.1] tracking-tighter"
                >
                    Quantify Your
                    <br />
                    <motion.span
                        variants={variant}
                        className="theme-gradient font-heading"
                    >
                        Digital Cognition
                    </motion.span>
                </motion.h1>

                <motion.p
                    variants={variant}
                    className="text-sm lg:text-xl text-muted-foreground lg:px-0 px-6 lg:max-w-2xl text-center w-full mt-2"
                >
                    <span className="font-semibold font-heading theme-gradient">
                        Kaizen:
                    </span>{" "}
                    Semantic indexing of your focus. Powered by Gemini Nano. Private by design.
                </motion.p>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.75,
                    delay: 0.2,
                    type: "spring",
                    stiffness: 100,
                }}
                className="flex justify-center items-center gap-5 mt-4"
            >
                <SignedIn>
                    <Link href="/dashboard">
                        <ShinyButton text="Go to Dashboard" />
                    </Link>
                </SignedIn>
                <SignedOut>
                    <SignInButton mode="modal">
                        <div className="cursor-pointer">
                            <ShinyButton text="Get Started" />
                        </div>
                    </SignInButton>
                </SignedOut>
                <ButtonArrow variant="outline" className="hidden sm:flex h-10 px-6">View Source</ButtonArrow>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.75,
                    delay: 0.3,
                    type: "spring",
                    stiffness: 100,
                }}
                className="relative w-full aspect-video border border-border/50 rounded-xl max-w-5xl mx-auto mb-12 md:mb-0 mt-12 lg:mt-20 p-2 bg-secondary/20 backdrop-blur-3xl overflow-hidden [mask-image:linear-gradient(to_bottom,rgba(0,0,0,1),rgba(0,0,0,0.8))] dark:[mask-image:linear-gradient(to_bottom,rgba(0,0,0,1),rgba(0,0,0,0))]"
            >
                <div className="w-full h-full border border-border/50 rounded-lg overflow-hidden bg-background/50 flex items-center justify-center relative">
                    <div className="flex flex-col items-center gap-4 relative z-10">
                        <div className="w-20 aspect-square rounded-full border border-blue-500/20 bg-blue-500/10 flex justify-center items-center hover:scale-105 duration-200 transition-all ease-out cursor-pointer shadow-2xl">
                            <Play size={32} className="text-blue-500 fill-blue-500/20" />
                        </div>
                        <p className="text-blue-500/40 font-mono text-[10px] uppercase tracking-[0.3em] font-bold">System Architecture</p>
                    </div>
                    {/* Background grid for the preview - matched to page grid */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />
                </div>
            </motion.div>
        </motion.div>
    );
}
