"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { cn } from "../lib/utils"

const STORAGE_KEY = "kaizen-theme"

export interface ThemeToggleProps {
  className?: string
  onChange?: (theme: "light" | "dark") => void
}

function ThemeToggle({ className, onChange }: ThemeToggleProps) {
  const [isDark, setIsDark] = React.useState(false)

  React.useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  const toggle = () => {
    const next = isDark ? "light" : "dark"
    if (next === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
    localStorage.setItem(STORAGE_KEY, next)
    setIsDark(!isDark)
    onChange?.(next)
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "w-10 h-10 p-0 rounded-full inline-flex items-center justify-center",
        "text-sm font-medium transition-colors",
        "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
        className
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}

export { ThemeToggle, STORAGE_KEY }
