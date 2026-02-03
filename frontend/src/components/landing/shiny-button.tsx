"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={cn(
                "relative rounded-lg px-6 py-2 font-medium backdrop-blur-xl transition-[box-shadow] duration-300 ease-in-out hover:shadow-lg bg-[rgba(59,130,246,0.1)] dark:bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/10%)_0%,transparent_60%)] hover:shadow-blue-500/20 dark:hover:shadow-[0_0_20px_hsl(var(--primary)/10%)] border border-blue-500/20 overflow-hidden group",
                className,
            )}
        >
            <span className="relative block h-full w-full text-sm uppercase tracking-wide font-semibold text-blue-700 dark:font-light dark:text-[rgb(255,255,255,90%)] z-10">
                {text}
            </span>
            {/* Animated shimmer overlay - wider to account for skew */}
            <span 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-white/50 to-transparent"
                style={{
                    animation: 'shimmer 3s ease-in-out infinite',
                    transform: 'translateX(-200%) skewX(-15deg)',
                    width: '200%',
                }}
            ></span>
            
            <style dangerouslySetInnerHTML={{
                __html: `
                    @keyframes shimmer {
                        0% {
                            transform: translateX(-200%) skewX(-15deg);
                        }
                        100% {
                            transform: translateX(200%) skewX(-15deg);
                        }
                    }
                `
            }} />
        </motion.button>
    );
};

export default ShinyButton;
