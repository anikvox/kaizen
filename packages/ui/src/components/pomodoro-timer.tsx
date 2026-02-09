import * as React from "react";
import { cn } from "../lib/utils";

export interface PomodoroStatus {
  state: "idle" | "running" | "paused" | "cooldown";
  elapsedSeconds: number;
}

interface PomodoroTimerProps extends React.HTMLAttributes<HTMLDivElement> {
  status: PomodoroStatus | null;
  onToggle?: () => void;
  compact?: boolean;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const PomodoroTimer = React.forwardRef<HTMLDivElement, PomodoroTimerProps>(
  ({ className, status, onToggle, compact = false, ...props }, ref) => {
    const isRunning = status?.state === "running";
    const isPaused = status?.state === "paused";
    const isCooldown = status?.state === "cooldown";
    const isActive = isRunning || isPaused || isCooldown;

    // Contextual icon per state
    const StateIcon = () => {
      if (isRunning) {
        // Pulsing dot for running
        return (
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pomodoro opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pomodoro" />
          </span>
        );
      }
      if (isPaused) {
        // Pause bars
        return (
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0 text-amber-500">
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </svg>
        );
      }
      if (isCooldown) {
        // Hourglass / timer
        return (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0 text-cyan-500">
            <path d="M4 2h8M4 14h8M5 2v3l3 3-3 3v3M11 2v3L8 8l3 3v3" />
          </svg>
        );
      }
      // Idle — coffee cup
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0 text-muted-foreground">
          <path d="M2 6h9v5a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6Z" />
          <path d="M11 7h1.5a1.5 1.5 0 0 1 0 3H11" />
          <path d="M4 2c.4-.6 1-.6 1.4 0M6.3 2c.4-.6 1-.6 1.4 0M8.6 2c.4-.6 1-.6 1.4 0" />
        </svg>
      );
    };

    if (compact) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1.5 border transition-all duration-300",
            isRunning && "border-pomodoro/40 shadow-[0_0_12px_rgba(239,68,68,0.15)]",
            isPaused && "border-amber-400/40",
            isCooldown && "border-cyan-400/40",
            !isActive && "border-border",
            className,
          )}
          style={{ backdropFilter: "blur(12px) saturate(1.5)", WebkitBackdropFilter: "blur(12px) saturate(1.5)" }}
          {...props}
        >
          <StateIcon />
          <span
            className={cn(
              "text-sm font-bold font-mono tabular-nums tracking-tight",
              isRunning && "text-pomodoro",
              isPaused && "text-amber-500",
              isCooldown && "text-cyan-500",
              !isActive && "text-foreground",
            )}
          >
            {status ? formatTime(status.elapsedSeconds) : "0:00"}
          </span>
          {(isRunning || isPaused) && onToggle && (
            <button
              onClick={onToggle}
              className={cn(
                "px-2 py-0.5 text-[10px] font-semibold rounded-full transition-all",
                isPaused
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                  : "bg-foreground/10 hover:bg-foreground/20 text-foreground/70",
              )}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg p-4 border",
          isRunning
            ? "bg-pomodoro/10 border-pomodoro/30"
            : "bg-muted/50 border-border",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-2.5 h-2.5 rounded-full",
                isRunning && "bg-pomodoro",
                isPaused && "bg-yellow-500",
                isCooldown && "bg-cyan-500",
                !isActive && "bg-muted-foreground",
              )}
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pomodoro Timer
            </span>
            {status && status.state !== "idle" && (
              <span className="text-xs text-muted-foreground capitalize">
                ({status.state})
              </span>
            )}
          </div>

          {(isRunning || isPaused) && onToggle && (
            <button
              onClick={onToggle}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded text-white transition-colors",
                isPaused
                  ? "bg-focus hover:bg-focus/90"
                  : "bg-muted-foreground hover:bg-muted-foreground/90",
              )}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}
        </div>

        <p
          className={cn(
            "text-3xl font-bold font-mono",
            isRunning && "text-pomodoro",
            isPaused && "text-yellow-500",
            !isActive && "text-foreground",
          )}
        >
          {status ? formatTime(status.elapsedSeconds) : "0:00"}
        </p>
      </div>
    );
  },
);
PomodoroTimer.displayName = "PomodoroTimer";

export { PomodoroTimer, formatTime };
