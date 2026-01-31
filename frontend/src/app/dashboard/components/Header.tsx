"use client";

import { Moon, Settings, Sun, LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import { formatTime } from "../lib"
import { UserButton } from "@clerk/nextjs"

interface HeaderProps {
    userName: string | null
    onSettingsClick: () => void
    onThemeToggle: () => void
    isDarkMode: boolean
}

export function Header({
    userName,
    onSettingsClick,
    onThemeToggle,
    isDarkMode
}: HeaderProps) {
    const [currentTime, setCurrentTime] = useState(new Date())

    // Update time every second
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date())
        }, 1000)

        return () => clearInterval(interval)
    }, [])

    const displayName = userName || "Explorer"

    // Get time-based greeting
    const getGreeting = () => {
        const hour = currentTime.getHours()
        if (hour >= 5 && hour < 12) return { text: "Good morning", emoji: "☀️" }
        if (hour >= 12 && hour < 19) return { text: "Good afternoon", emoji: "🌤️" }
        if (hour >= 19 && hour < 20) return { text: "Good evening", emoji: "🌆" }
        return { text: "Good night", emoji: "🌙" }
    }

    const greeting = getGreeting()

    return (
        <header className="w-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 px-6 py-3 shrink-0 z-40 transition-colors duration-300">
            <div className="flex items-center justify-between max-w-[1800px] mx-auto">
                {/* Left: User Greeting */}
                <div className="flex items-center gap-2.5">
                    <div className="text-2xl">{greeting.emoji}</div>
                    <div>
                        <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                            {greeting.text}, {displayName}
                        </h1>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                            {currentTime.toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric"
                            })}
                        </p>
                    </div>
                </div>

                {/* Right: Time & Controls */}
                <div className="flex items-center gap-4">
                    {/* Current Time */}
                    <div className="text-right hidden sm:block">
                        <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                            {formatTime(currentTime)}
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onSettingsClick}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-gray-700 dark:text-gray-300"
                            aria-label="Settings">
                            <Settings className="w-4 h-4" />
                        </button>

                        <button
                            onClick={onThemeToggle}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                            aria-label={
                                isDarkMode ? "Switch to light mode" : "Switch to dark mode"
                            }>
                            {isDarkMode ? (
                                <Sun className="w-4 h-4 text-yellow-500" />
                            ) : (
                                <Moon className="w-4 h-4 text-indigo-600" />
                            )}
                        </button>

                        <div className="pl-1 border-l border-gray-200 dark:border-gray-800 ml-1">
                            <UserButton
                                appearance={{
                                    elements: {
                                        avatarBox: "w-8 h-8 rounded-lg"
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </header>
    )
}
