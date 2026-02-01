"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Header } from "./Header";
import { CompactFocusCard } from "./CompactFocusCard";
import { AttentionProgressGraph } from "./AttentionProgressGraph";
import { CompactPulseCard } from "./CompactPulseCard";
import { CompactQuizCard } from "./CompactQuizCard"
import { CompactStatsCard } from "./CompactStatsCard";
import { JourneyGraph } from "./JourneyGraph";
import { Settings } from "./Settings";
import { Chat } from "./Chat";
import { useFocusData, usePulseData, useQuizQuestions, useWinsData } from "../hooks";
import { useUser } from "@clerk/nextjs";

import "../dashboard.css";

type TabType = "dashboard" | "journey" | "settings" | "chat";

export function DashboardContent() {
    const { user } = useUser();
    const userName = user?.firstName || "Explorer";
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    const [activeTab, setActiveTab] = useState<TabType>("dashboard");

    const { currentFocus, focusHistory, isLoading: focusLoading } = useFocusData();
    const { wins, isLoading: winsLoading } = useWinsData();
    const {
        questions,
        unansweredQuestions,
        isLoading: quizLoading,
        markAsAnswered
    } = useQuizQuestions();
    const { pulses, isLoading: pulseLoading } = usePulseData();

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleThemeToggle = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    const renderDashboard = () => (
        <div className="h-full p-6 space-y-5 overflow-y-auto scrollbar-thin">
            <div className="max-w-[1600px] mx-auto grid grid-cols-12 gap-5">
                {/* Left Column - Focus & Activity */}
                <div className="col-span-12 lg:col-span-5 flex flex-col gap-5">
                    <CompactFocusCard
                        currentFocus={currentFocus}
                        focusHistory={focusHistory}
                        isLoading={focusLoading}
                    />
                    <AttentionProgressGraph
                        focusHistory={focusHistory}
                        isLoading={focusLoading}
                    />
                    <CompactPulseCard
                        pulses={pulses}
                        isLoading={pulseLoading}
                    />
                </div>

                {/* Right Column - Quiz & Stats */}
                <div className="col-span-12 lg:col-span-7 flex flex-col gap-5">
                    <CompactQuizCard
                        questions={questions}
                        unansweredQuestions={unansweredQuestions}
                        isLoading={quizLoading}
                        onAnswerSubmit={markAsAnswered}
                    />
                    <CompactStatsCard
                        focusHistory={focusHistory}
                        wins={wins}
                        isLoading={focusLoading || winsLoading}
                    />
                </div>
            </div>
        </div>
    );

    if (!mounted) {
        return null;
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300 overflow-hidden">
            <Header
                userName={userName}
                isDarkMode={theme === "dark"}
                onThemeToggle={handleThemeToggle}
                onSettingsClick={() => setActiveTab("settings")}
            />

            {/* Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
                <div className="max-w-[1600px] mx-auto px-6">
                    <nav className="flex gap-1">
                        {(["dashboard", "journey", "settings", "chat"] as TabType[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-4 font-medium text-sm transition-all relative capitalize ${activeTab === tab
                                    ? "text-blue-600 dark:text-blue-400"
                                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                                    }`}
                            >
                                {tab}
                                {activeTab === tab && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 shadow-[0_-2px_4px_rgba(59,130,246,0.5)]" />
                                )}
                            </button>
                        ))}
                    </nav>
                </div>
            </div>

            {/* Content Area */}
            <main className="flex-1 overflow-hidden relative">
                <div className={`h-full transition-all duration-300 ${activeTab === 'dashboard' ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'}`}>
                    {renderDashboard()}
                </div>

                <div className={`h-full p-6 overflow-y-auto transition-all duration-300 ${activeTab === 'journey' ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'}`}>
                    <div className="max-w-[1600px] mx-auto">
                        <JourneyGraph />
                    </div>
                </div>

                <div className={`h-full overflow-y-auto transition-all duration-300 ${activeTab === 'settings' ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'}`}>
                    <Settings />
                </div>

                <div className={`h-full bg-gradient-to-br from-gray-50 to-slate-100 dark:from-gray-950 dark:to-slate-900 transition-all duration-300 ${activeTab === 'chat' ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'}`}>
                    <Chat />
                </div>
            </main>
        </div>
    );
}
