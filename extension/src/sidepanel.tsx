import { useLiveQuery } from "~hooks/useLiveQuery"
import {
  Award,
  BarChart3,
  Coffee,
  Compass,
  Flame,
  // HelpCircle,
  LayoutDashboard,
  Lightbulb,
  Pause,
  Play,
  Target,
  Timer,
  Trophy
} from "lucide-react"
import React, { useCallback, useEffect, useMemo, useState } from "react"

import { Storage } from "@plasmohq/storage"

import db, { type Focus, type PomodoroState } from "~db"
import { INTENT_QUEUE_NOTIFY } from "~default-settings"

import { parseFocus, type FocusWithParsedData } from "./sidepanel-api/focus"
import { getPomodoroState, togglePomodoro } from "./sidepanel-api/pomodoro"
import { getWinsData } from "./sidepanel-api/wins"
import { IntentsTab } from "./sidepanel-components/IntentsTab"
import { TreeAnimationSection } from "./sidepanel-components/TreeAnimationSection"
import type { WinItem } from "./sidepanel-types/wins"

import "./sidepanel.css"

import type { Intent } from "~background/messages/intent"

import { Chat } from "./sidepanel-chat"

type TabType = "focus" | "insights" | "explore" | "intents"

const generateChatId = () =>
  `chat-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

const storage = new Storage()

const Popup = () => {
  console.log("Popup component rendering")

  const [activeTab, setActiveTab] = useState<TabType>("focus")
  const [focusData, setFocusData] = useState<FocusWithParsedData | null>(null)
  const [currentChatId, setCurrentChatId] = useState<string>(generateChatId())

  const focusDataDex = useLiveQuery(() => {
    return db.table<Focus>("focus").toArray()
  }, [])

  useEffect(() => {
    if (!focusDataDex || focusDataDex.length === 0) {
      setFocusData(null)
      return
    }

    let interval: number | null = null

    const currentFocus = [...focusDataDex].sort(
      (a, b) => b.last_updated - a.last_updated
    )[0]

    console.log(currentFocus)

    // Check if the focus session is currently active
    const lastSession =
      currentFocus.time_spent[currentFocus.time_spent.length - 1]
    const isActive = lastSession && lastSession.end === null

    if (isActive) {
      // Only set focusData if there's an active session
      const parsedFocus = parseFocus(currentFocus)
      setFocusData(parsedFocus)
      updateTimeSpent(parsedFocus)

      // update the time spent every second
      interval = setInterval(() => {
        updateTimeSpent(parseFocus(currentFocus))
      }, 1000) as unknown as number
    } else {
      // No active session, clear focusData
      setFocusData(null)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [focusDataDex])

  const [wins, setWins] = useState<WinItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [pomodoroState, setPomodoroState] = useState<PomodoroState>({
    id: "current",
    isActive: false,
    remainingTime: 1500,
    state: "idle",
    startTime: null,
    totalPomodoros: 0,
    lastUpdated: Date.now()
  })

  // Watch for intent queue changes and switch to Learning tab
  useEffect(() => {
    storage.watch({
      [INTENT_QUEUE_NOTIFY]: async () => {
        // check if latest intent is a chat
        const _iq = await db
          .table<Intent>("intentQueue")
          .orderBy("timestamp")
          .reverse()
          .limit(1)
          .toArray()
        const iq = _iq?.filter((i) => i.processed === false)

        if (
          iq &&
          iq[0].type !== "CHAT" &&
          iq[0].name !== "chat-with-this-page"
        ) {
          setActiveTab("intents")
        } else if (
          iq &&
          iq[0].type === "CHAT" &&
          iq[0].name === "chat-with-this-page"
        ) {
          setActiveTab("focus")
        }
      }
    })
  }, [])
  const [formattedFocusTime, setFormattedFocusTime] = useState("00:00:00")

  const updateTimeSpent = (focusData: FocusWithParsedData) => {
    const totalTime = focusData.total_time
    const hours = Math.floor(totalTime / 3600000)
    const minutes = Math.floor((totalTime % 3600000) / 60000)
    const seconds = Math.floor((totalTime % 60000) / 1000)
    const strxx = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`

    setFormattedFocusTime(strxx)
  }

  console.log(`Yoo`)
  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const [winsData] = await Promise.all([getWinsData()])

        setWins(winsData)

        console.log("currentFocus", winsData)

        // Fetch pomodoro state separately with error handling
        try {
          const pomodoro = await getPomodoroState()
          if (pomodoro) {
            setPomodoroState(pomodoro)
          }
        } catch (pomodoroError) {
          console.error("Error fetching pomodoro state:", pomodoroError)
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        console.log(`Initial data Loaded...`)
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  // Poll pomodoro state every second
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const state = await getPomodoroState()
        if (state) {
          setPomodoroState(state)
        }
      } catch (error) {
        console.error("Error fetching pomodoro state:", error)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handlePomodoroToggle = useCallback(async () => {
    try {
      const newState = await togglePomodoro()
      if (newState) {
        setPomodoroState(newState)
      }
    } catch (error) {
      console.error("Error toggling pomodoro:", error)
    }
  }, [])

  const getWinIcon = useCallback((type: string) => {
    switch (type) {
      case "milestone":
        return <Trophy className="w-4 h-4 text-yellow-600" />
      case "streak":
        return <Flame className="w-4 h-4 text-orange-600" />
      case "achievement":
        return <Award className="w-4 h-4 text-blue-600" />
      default:
        return <Trophy className="w-4 h-4 text-gray-600" />
    }
  }, [])

  const formattedPomodoroTime = useMemo(() => {
    if (!pomodoroState) {
      return "25:00"
    }
    const minutes = Math.floor(pomodoroState.remainingTime / 60)
    const seconds = pomodoroState.remainingTime % 60
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }, [pomodoroState])

  const handleNewChatRequest = useCallback(() => {
    setCurrentChatId(generateChatId())
  }, [])

  const renderFocusTab = () => {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Chat
          chatId={currentChatId}
          isNewChat={true}
          onChatCreated={(id) => setCurrentChatId(id)}
          onNewChatRequested={handleNewChatRequest}
        />
      </div>
    )
  }

  const activitySummaries = useLiveQuery(() => {
    return db
      .table("activitySummary")
      .orderBy("timestamp")
      .reverse()
      .limit(5)
      .toArray()
  }, [])

  const renderInsightsTab = () => {
    return (
    <div className="flex-1 overflow-y-auto p-2 space-y-4">
      {/* Refresher Quiz Section */}
      <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-sm rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100/80 dark:bg-purple-900/40 backdrop-blur-sm rounded-lg border border-purple-200/50 dark:border-purple-800/50">
            <Award className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Refresher Quiz
          </h3>
        </div>
        {focusDataDex && focusDataDex.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              You've learnt a lot recently... let's take a refresher! 🧠
            </p>
            <button
              onClick={() => {
                chrome.tabs.create({ url: "/tabs/dashboard.html" })
              }}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-all shadow-md hover:shadow-lg">
              Start Refresher Quiz
            </button>
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-400 text-center py-2">
            <p className="mb-2">
              It will get active once you've enough focus 😔
            </p>
            <p className="text-xs italic">
              Complete some focus sessions to unlock the quiz
            </p>
          </div>
        )}
      </div>

      {/* Activity Summaries Section */}
      <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-sm rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100/80 dark:bg-blue-900/40 backdrop-blur-sm rounded-lg border border-blue-200/50 dark:border-blue-800/50">
            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Activity Summaries
          </h3>
        </div>
        {activitySummaries && activitySummaries.length > 0 ? (
          <div className="space-y-3">
            {activitySummaries.map((summary, index) => (
              <div
                key={index}
                className="bg-white/50 dark:bg-slate-600/40 backdrop-blur-sm p-4 rounded-lg border border-gray-300/50 dark:border-slate-500/50 shadow-md">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                  {summary.summary}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(summary.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-2">No activity summaries yet</p>
            <p className="text-xs italic">
              Start browsing to see AI-powered insights
            </p>
          </div>
        )}
      </div>

      {/* Focus History Section */}
      <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-sm rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-100/80 dark:bg-green-900/40 backdrop-blur-sm rounded-lg border border-green-200/50 dark:border-green-800/50">
            <Target className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Recent Focus Sessions
          </h3>
        </div>
        {focusDataDex && focusDataDex.length > 0 ? (
          <div className="space-y-2">
            {focusDataDex.slice(0, 5).map((focus) => {
              const parsed = parseFocus(focus)
              return (
                <div
                  key={focus.id}
                  className="bg-white/50 dark:bg-slate-600/40 backdrop-blur-sm p-3 rounded-lg border border-gray-300/50 dark:border-slate-500/50 shadow-md">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {focus.item}
                    </p>
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                      {Math.floor(parsed.total_time / 3600000)}h{" "}
                      {Math.floor((parsed.total_time % 3600000) / 60000)}m
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p className="mb-2">No focus sessions yet</p>
            <p className="text-xs italic">
              Start focusing to track your learning journey
            </p>
          </div>
        )}
      </div>
    </div>
    )
  }

  const renderExploreTab = () => {
    return (
    <div className="flex-1 overflow-y-auto p-2 space-y-4">
      {/* Wins Section */}
      <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-xs rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-yellow-100/80 dark:bg-yellow-900/40 backdrop-blur-sm rounded-lg border border-yellow-200/50 dark:border-yellow-800/50">
            <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Wins
          </h3>
        </div>
        {wins.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
            No wins yet. Keep focusing to unlock achievements!
          </div>
        ) : (
          <div className="space-y-3">
            {wins.map((win, index) => (
              <div
                key={win.id}
                className="flex items-center gap-3 bg-white/50 dark:bg-slate-600/40 backdrop-blur-sm px-4 py-3 rounded-lg border border-gray-300/50 dark:border-slate-500/50 hover:shadow-lg hover:border-gray-400/60 dark:hover:border-slate-400/60 transition-all"
                style={{ animationDelay: `${index * 100}ms` }}>
                {getWinIcon(win.type)}
                <div className="flex-1">
                  <p className="font-bold text-gray-900 dark:text-white text-sm">
                    {win.focusItem}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {win.text}
                  </p>
                </div>
                <span className="text-gray-500 dark:text-gray-400 font-mono text-xs">
                  {Math.floor(win.totalTimeSpent / 60000)}:
                  {((win.totalTimeSpent % 60000) / 1000)
                    .toString()
                    .padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Milestones Section */}
      <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-xs rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100/80 dark:bg-purple-900/40 backdrop-blur-sm rounded-lg border border-purple-200/50 dark:border-purple-800/50">
            <Award className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Milestones
          </h3>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <p className="mb-2">Coming soon: Track your learning milestones</p>
          <p className="text-xs italic">
            Celebrate your progress and achievements
          </p>
        </div>
      </div>
    </div>
    )
  }

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-white relative">
      {/* Emerald Glow Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `
        radial-gradient(125% 125% at 50% 90%, #ffffff 50%, #10b981 100%)
      `,
          backgroundSize: "100% 100%",
          filter: "hue-rotate(60deg)"
        }}
      />

      <div
        className="relative h-screen overflow-hidden flex flex-col"
        role="main"
        id="main-bg-x">
        {/* Tree Animation Background */}
        <div id="tour-tree">
          <TreeAnimationSection totalFocusTime={focusData?.total_time || 0} />
        </div>

        {/* Content Container with padding for card layout */}

        <div className="relative z-10 flex flex-col h-full bg-transparent">
          {/* Header - No Card */}
          <div className="shrink-0 px-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 mt-2" id="tour-logo">
                <img
                  src={chrome.runtime.getURL("assets/logo_NPxx.png")}
                  className="w-20 bg-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                {/* Help/Tour Button */}
                {/* <button
                  onClick={() => setIsTourOpen(true)}
                  className="cursor-pointer h-10 relative bg-white/60 hover:bg-white/80 backdrop-blur-md px-3 py-2 rounded-xl border border-gray-200/50 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95"
                  aria-label="Start Tour"
                  title="Take a tour">
                  <HelpCircle className="w-4 h-4 text-gray-600" />
                </button> */}
                
                {/* Dashboard Button */}
                <button
                  id="tour-dashboard"
                  onClick={() =>
                    chrome.tabs.create({ url: "/tabs/dashboard.html" })
                  }
                  className="cursor-pointer h-10 relative bg-gradient-to-br from-blue-500/90 to-purple-600/90 hover:from-blue-600 hover:to-purple-700 backdrop-blur-md px-3 py-2 rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
                  aria-label="Open Dashboard">
                  <div className="flex items-center gap-1.5">
                    <LayoutDashboard className="w-4 h-4 text-white" />
                  </div>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400 to-purple-500 opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-300 -z-10" />
                </button>

                {/* Pomodoro Timer */}
                <div className="relative group/pomodoro mr-3" id="tour-pomodoro">
                  <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-100/70 via-emerald-50/40 to-white/20 dark:from-emerald-900/50 dark:via-emerald-950/30 dark:to-slate-900/30 backdrop-blur-md px-4 py-2 rounded-xl border border-white/30 dark:border-slate-600/40 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                    {/* Progress indicator background - Subtle fill */}
                    <div
                      className={`absolute inset-0 rounded-xl transition-all duration-1000 ease-in-out ${
                        pomodoroState.isActive
                          ? pomodoroState.state === "focus"
                            ? "bg-gradient-to-r from-red-500/5 via-orange-500/5 to-transparent dark:from-red-600/10 dark:via-orange-600/10 dark:to-transparent"
                            : "bg-gradient-to-r from-green-500/5 via-teal-500/5 to-transparent dark:from-green-600/10 dark:via-teal-600/10 dark:to-transparent"
                          : "bg-transparent"
                      }`}
                      style={{
                        width: `${
                          pomodoroState.state === "focus"
                            ? ((1500 - pomodoroState.remainingTime) / 1500) *
                              100
                            : ((300 - pomodoroState.remainingTime) / 300) * 100
                        }%`,
                        mixBlendMode: "multiply",
                        backdropFilter: "blur(4px)"
                      }}
                    />

                    <div className="relative flex items-center gap-2">
                      {/* Timer display with state icon */}
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`transition-transform duration-300 ${
                            pomodoroState.isActive ? "animate-pulse" : ""
                          }`}>
                          {pomodoroState.state === "focus" ? (
                            <Timer className="w-4 h-4 text-red-600 dark:text-red-400" />
                          ) : (
                            <Coffee className="w-4 h-4 text-green-600 dark:text-green-400" />
                          )}
                        </div>
                        <span className="text-sm font-mono font-bold text-gray-800 dark:text-gray-100 tabular-nums">
                          {formattedPomodoroTime}
                        </span>
                      </div>

                      {/* Vertical divider */}
                      <div className="w-px h-5 bg-gray-300 dark:bg-slate-600" />

                      {/* Play/Pause button - Enhanced */}
                      <button
                        onClick={handlePomodoroToggle}
                        className={`group relative flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300 ${
                          pomodoroState.isActive
                            ? "bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 shadow-md"
                            : "bg-gradient-to-br from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 shadow-md"
                        } hover:scale-110 active:scale-95 hover:shadow-lg`}
                        aria-label={
                          pomodoroState.isActive
                            ? `Pause ${pomodoroState.state}`
                            : `Start ${pomodoroState.state}`
                        }>
                        {pomodoroState.isActive ? (
                          <Pause className="w-3.5 h-3.5 text-white fill-white" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-white fill-white" />
                        )}
                        {/* Button glow effect */}
                        <div className="absolute inset-0 rounded-lg bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </button>
                    </div>
                  </div>

                  {/* Pomodoro count indicator */}
                  {pomodoroState.totalPomodoros > 0 && (
                    <div className="absolute -top-1 -right-1 mr-3 bg-gradient-to-br from-purple-500 to-pink-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg border border-white/30">
                      {pomodoroState.totalPomodoros}
                    </div>
                  )}

                  {/* Hover Popover */}
                  <div className="absolute top-full right-0 mt-2 w-64 opacity-0 invisible group-hover/pomodoro:opacity-100 group-hover/pomodoro:visible transition-all duration-300 pointer-events-none z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 p-4 backdrop-blur-md">
                      {/* Arrow */}
                      <div className="absolute -top-2 right-6 w-4 h-4 bg-white dark:bg-slate-800 border-t border-l border-gray-200 dark:border-slate-700 transform rotate-45" />

                      <div className="relative space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-slate-700">
                          <Timer className="w-5 h-5 text-red-500" />
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                            Pomodoro Timer
                          </h3>
                        </div>

                        <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                          <div className="flex items-start gap-2">
                            <Timer className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-semibold">Focus:</span> 25
                              minutes of concentrated work
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Coffee className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-semibold">Break:</span> 5
                              minutes of rest
                            </div>
                          </div>
                        </div>

                        {pomodoroState.totalPomodoros > 0 && (
                          <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-600 dark:text-gray-400">
                                Completed Today:
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-purple-600 dark:text-purple-400">
                                  {pomodoroState.totalPomodoros}
                                </span>
                                <Trophy className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                            {pomodoroState.isActive
                              ? "Timer is running. Click pause to stop."
                              : "Click play to start a focus session."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Current Focus Display */}
            <div className="bg-white/30 dark:bg-slate-800/30 backdrop-blur-md rounded-xl p-3 border border-gray-300/50 dark:border-slate-600/50 shadow-xs" id="current-focus">
              {focusData ? (
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">
                      Current Focus
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {focusData.focus_item.replace(".", "")}
                    </p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">
                      Elapsed
                    </p>
                    <p className="font-mono font-bold text-sm text-gray-900 dark:text-gray-200">
                      {formattedFocusTime}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 text-center font-medium">
                    No active focus session
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 italic text-center mb-3">
                    Spend 7 minutes of focus time to learn something new 🌱
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-gray-300/50 dark:border-slate-600/50 my-2"></div>

              {/* Tree Nurturing Message */}
              <p
                className="text-green-900 text-center"
                style={{ fontSize: "10px" }}>
                🌱 Your tree thrives as your focus grows, keep nurturing it!
              </p>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="shrink-0 mx-4 pb-1 mt-4 mb-2" id="tour-tabs">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("focus")}
                className={`relative flex-1 py-2.5 rounded-[16px] text-xs font-semibold transition-all duration-300 ${
                  activeTab === "focus"
                    ? "bg-white/80 dark:bg-slate-700/80 backdrop-blur-xl text-gray-900 dark:text-white shadow-lg border border-white/40 dark:border-slate-600/40"
                    : "bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-white/20 dark:border-slate-600/20"
                }`}>
                <div className="flex flex-col items-center gap-1">
                  <Target className="w-5 h-5" />
                  <span className="text-[11px]">Focus</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("insights")}
                className={`relative flex-1 py-2.5 rounded-[16px] text-xs font-semibold transition-all duration-300 ${
                  activeTab === "insights"
                    ? "bg-white/80 dark:bg-slate-700/80 backdrop-blur-xl text-gray-900 dark:text-white shadow-lg border border-white/40 dark:border-slate-600/40"
                    : "bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-white/20 dark:border-slate-600/20"
                }`}>
                <div className="flex flex-col items-center gap-1">
                  <BarChart3 className="w-5 h-5" />
                  <span className="text-[11px]">Insights</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("intents")}
                className={`relative flex-1 py-2.5 rounded-[16px] text-xs font-semibold transition-all duration-300 ${
                  activeTab === "intents"
                    ? "bg-white/80 dark:bg-slate-700/80 backdrop-blur-xl text-gray-900 dark:text-white shadow-lg border border-white/40 dark:border-slate-600/40"
                    : "bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-white/20 dark:border-slate-600/20"
                }`}>
                <div className="flex flex-col items-center gap-1">
                  <Lightbulb className="w-5 h-5" />
                  <span className="text-[11px]">Learning</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("explore")}
                className={`relative flex-1 py-2.5 rounded-[16px] text-xs font-semibold transition-all duration-300 ${
                  activeTab === "explore"
                    ? "bg-white/80 dark:bg-slate-700/80 backdrop-blur-xl text-gray-900 dark:text-white shadow-lg border border-white/40 dark:border-slate-600/40"
                    : "bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-white/20 dark:border-slate-600/20"
                }`}>
                <div className="flex flex-col items-center gap-1">
                  <Compass className="w-5 h-5" />
                  <span className="text-[11px]">Explore</span>
                </div>
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {activeTab === "focus" && renderFocusTab()}
              {activeTab === "insights" && renderInsightsTab()}
              {activeTab === "intents" && <IntentsTab />}
              {activeTab === "explore" && renderExploreTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Error boundary wrapper
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Sidepanel Error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", background: "#1a1a1a", color: "white" }}>
          <h1>Something went wrong</h1>
          <pre style={{ color: "#ff6b6b", whiteSpace: "pre-wrap" }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ fontSize: "12px", marginTop: "10px", opacity: 0.7 }}>
            {this.state.error?.stack}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}

function SidepanelWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <Popup />
    </ErrorBoundary>
  )
}

export default SidepanelWithErrorBoundary
