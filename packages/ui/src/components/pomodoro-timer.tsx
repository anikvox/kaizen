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

    if (compact) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 border",
            isRunning
              ? "bg-pomodoro/10 border-pomodoro/30"
              : "bg-muted/50 border-border",
            className,
          )}
          {...props}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              isRunning && "bg-pomodoro",
              isPaused && "bg-yellow-500",
              isCooldown && "bg-cyan-500",
              !isActive && "bg-muted-foreground",
            )}
          />
          <span
            className={cn(
              "text-sm font-bold font-mono",
              isRunning && "text-pomodoro",
              isPaused && "text-yellow-500",
              !isActive && "text-foreground",
            )}
          >
            {status ? formatTime(status.elapsedSeconds) : "0:00"}
          </span>
          {(isRunning || isPaused) && onToggle && (
            <button
              onClick={onToggle}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded text-white transition-colors",
                isPaused
                  ? "bg-focus hover:bg-focus/90"
                  : "bg-muted-foreground hover:bg-muted-foreground/90",
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
