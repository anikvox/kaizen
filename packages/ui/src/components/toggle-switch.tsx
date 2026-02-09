"use client";

import * as React from "react";
import { cn } from "../lib/utils";

interface ToggleSwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    showLabels?: boolean;
    size?: "sm" | "md" | "lg";
    className?: string;
}

const sizeConfig = {
    sm: {
        track: "w-9 h-5",
        thumb: "w-4 h-4",
        translate: "translate-x-4",
        label: "text-xs",
    },
    md: {
        track: "w-11 h-6",
        thumb: "w-5 h-5",
        translate: "translate-x-5",
        label: "text-sm",
    },
    lg: {
        track: "w-14 h-7",
        thumb: "w-6 h-6",
        translate: "translate-x-7",
        label: "text-sm",
    },
};

const ToggleSwitch = React.forwardRef<HTMLButtonElement, ToggleSwitchProps>(
    (
        {
            checked,
            onCheckedChange,
            disabled = false,
            showLabels = true,
            size = "md",
            className,
        },
        ref,
    ) => {
        const config = sizeConfig[size];

        return (
            <div className={cn("inline-flex items-center gap-2", className)}>
                {showLabels && (
                    <span
                        className={cn(
                            "font-medium transition-colors select-none",
                            config.label,
                            !checked
                                ? "text-foreground"
                                : "text-muted-foreground/50",
                        )}
                    >
                        OFF
                    </span>
                )}

                <button
                    ref={ref}
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => onCheckedChange(!checked)}
                    className={cn(
                        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
                        config.track,
                        checked
                            ? "bg-green-500"
                            : "bg-muted dark:bg-muted/50",
                    )}
                >
                    <span
                        className={cn(
                            "pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out",
                            config.thumb,
                            checked ? config.translate : "translate-x-0",
                        )}
                    />
                </button>

                {showLabels && (
                    <span
                        className={cn(
                            "font-medium transition-colors select-none",
                            config.label,
                            checked
                                ? "text-foreground"
                                : "text-muted-foreground/50",
                        )}
                    >
                        ON
                    </span>
                )}
            </div>
        );
    },
);

ToggleSwitch.displayName = "ToggleSwitch";

export { ToggleSwitch };
export type { ToggleSwitchProps };
