"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";

export default function ThemeToggler() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

    useEffect(() => {
        setMounted(true);
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        setSystemTheme(mediaQuery.matches ? "dark" : "light");

        const handleChange = (e: MediaQueryListEvent) => {
            setSystemTheme(e.matches ? "dark" : "light");
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    const SWITCH = () => {
        switch (theme) {
            case "light":
                setTheme("dark");
                break;
            case "dark":
                setTheme("light");
                break;
            case "system":
                setTheme(systemTheme === "light" ? "dark" : "light");
                break;
            default:
                break;
        }
    };

    const TOGGLE_THEME = () => {
        // @ts-ignore
        if (!document.startViewTransition) {
            SWITCH();
            return;
        }

        // @ts-ignore
        document.startViewTransition(SWITCH);
    };

    if (!mounted) {
        return (
            <div className="w-8 h-8 rounded-lg border border-white/5 animate-pulse bg-white/5" />
        );
    }

    return (
        <button
            onClick={TOGGLE_THEME}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 shadow-sm hover:shadow-md"
        >
            <div className="relative w-4 h-4">
                <Sun
                    className={`absolute inset-0 text-amber-500 transition-all duration-200 ease-in-out ${
                        theme === "dark" ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
                    }`}
                    size={16}
                    style={{ transformOrigin: 'center' }}
                />
                <Moon
                    className={`absolute inset-0 text-blue-500 transition-all duration-200 ease-in-out ${
                        theme === "dark" ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0"
                    }`}
                    size={16}
                    style={{ transformOrigin: 'center' }}
                />
            </div>
            <span className="sr-only">Toggle theme</span>
        </button>
    );
}
