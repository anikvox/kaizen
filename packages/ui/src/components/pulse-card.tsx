import * as React from "react";
import { cn } from "../lib/utils";

export interface Pulse {
  id: string;
  message: string;
  createdAt: string;
}

interface PulseCardProps extends React.HTMLAttributes<HTMLDivElement> {
  pulses: Pulse[];
}

const PulseCard = React.forwardRef<HTMLDivElement, PulseCardProps>(
  ({ className, pulses, ...props }, ref) => {
    if (pulses.length === 0) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg p-4 border bg-pulse/5 border-pulse/20",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Learning Pulses
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {pulses.map((pulse) => (
            <div
              key={pulse.id}
              className="px-3 py-2 bg-background rounded border-l-2 border-pulse text-sm text-muted-foreground"
            >
              {pulse.message}
            </div>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground/60 text-right mt-2">
          Updated{" "}
          {pulses[0] && new Date(pulses[0].createdAt).toLocaleTimeString()}
        </p>
      </div>
    );
  },
);
PulseCard.displayName = "PulseCard";

export { PulseCard };
