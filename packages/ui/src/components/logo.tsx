import * as React from "react";
import { cn } from "../lib/utils";

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
}

// Height values for each size
const heightMap = {
  sm: 20,
  md: 28,
  lg: 40,
  xl: 56,
};

// Original image aspect ratio: 2498 x 675 ≈ 3.7:1
const ASPECT_RATIO = 2498 / 675;

const Logo = React.forwardRef<HTMLImageElement, LogoProps>(
  ({ className, size = "md", showText = false, ...props }, ref) => {
    const height = heightMap[size];
    const width = Math.round(height * ASPECT_RATIO);

    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        <img
          ref={ref}
          src="/kaizen-logo.png"
          alt="Kaizen"
          width={width}
          height={height}
          style={{ width, height }}
          {...props}
        />
        {showText && (
          <span
            className={cn(
              "font-semibold tracking-tight",
              size === "sm" && "text-lg",
              size === "md" && "text-xl",
              size === "lg" && "text-2xl",
              size === "xl" && "text-3xl"
            )}
          >
            Kaizen
          </span>
        )}
      </div>
    );
  }
);
Logo.displayName = "Logo";

export { Logo };
