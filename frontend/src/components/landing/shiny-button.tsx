"use client";

import { motion, type AnimationProps } from "framer-motion";
import { cn } from "@/lib/utils";

const animationProps = {
    initial: { "--x": "100%", scale: 0.8 },
    animate: { "--x": "-100%", scale: 1 },
    whileTap: { scale: 0.95 },
    transition: {
        repeat: Infinity,
        repeatType: "loop",
        repeatDelay: 1,
        type: "spring",
        stiffness: 20,
        damping: 15,
        mass: 2,
        scale: {
            type: "spring",
            stiffness: 200,
            damping: 5,
            mass: 0.5,
        },
    },
} as AnimationProps;

type ShinyButtonProps = {
    text: string;
    className?: string;
    onClick?: () => void;
}

const ShinyButton = ({
    text,
    className,
    onClick,
}: ShinyButtonProps) => {
    return (
        <motion.button
            {...animationProps}
            onClick={onClick}
            className={cn(
                "relative rounded-lg px-6 py-2 font-medium backdrop-blur-xl transition-[box-shadow] duration-300 ease-in-out hover:shadow-lg bg-[rgba(59,130,246,0.1)] dark:bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/10%)_0%,transparent_60%)] hover:shadow-blue-500/20 dark:hover:shadow-[0_0_20px_hsl(var(--primary)/10%)] border border-blue-500/20",
                className,
            )}
        >
            <span
                className="relative block h-full w-full text-sm uppercase tracking-wide font-semibold text-blue-700 dark:font-light dark:text-[rgb(255,255,255,90%)]"
                style={{
                    maskImage:
                        "linear-gradient(-75deg,rgba(255,255,255,1) calc(var(--x) + 20%),transparent calc(var(--x) + 30%),rgba(255,255,255,1) calc(var(--x) + 100%))",
                }}
            >
                {text}
            </span>
            <span
                style={{
                    mask: "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
                    maskComposite: "exclude",
                }}
                className="absolute inset-0 z-10 block rounded-[inherit] bg-[linear-gradient(-75deg,rgba(59,130,246,0.1)_calc(var(--x)+20%),rgba(59,130,246,0.5)_calc(var(--x)+25%),rgba(59,130,246,0.1)_calc(var(--x)+100%))] p-px"
            ></span>
        </motion.button>
    );
};

export default ShinyButton;
