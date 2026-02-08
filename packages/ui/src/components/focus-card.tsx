import * as React from "react";
import { cn } from "../lib/utils";

export interface Focus {
  id: string;
  item: string;
  startedAt: string;
  keywords: string[];
}

interface FocusCardProps extends React.HTMLAttributes<HTMLDivElement> {
  focuses: Focus[];
}

const FocusCard = React.forwardRef<HTMLDivElement, FocusCardProps>(
  ({ className, focuses, ...props }, ref) => {
    const isActive = focuses.length > 0;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg p-4 border",
          isActive ? "bg-focus/5 border-focus/20" : "bg-muted/50 border-border",
          className,
        )}
        {...props}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className={cn(
              "w-2.5 h-2.5 rounded-full",
              isActive ? "bg-focus" : "bg-muted-foreground",
            )}
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active Focuses {isActive && `(${focuses.length})`}
          </span>
        </div>

        {isActive ? (
          <div className="flex flex-col gap-3">
            {focuses.map((focus) => (
              <div
                key={focus.id}
                className="p-2 bg-background rounded border-l-2 border-focus"
              >
                <p className="text-base font-semibold text-secondary">
                  {focus.item}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Since {new Date(focus.startedAt).toLocaleTimeString()}
                  {focus.keywords.length > 1 && (
                    <span> &bull; {focus.keywords.slice(0, 3).join(", ")}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No active focus detected
          </p>
        )}
      </div>
    );
  },
);
FocusCard.displayName = "FocusCard";

export { FocusCard };
