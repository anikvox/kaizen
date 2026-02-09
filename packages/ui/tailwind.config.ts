import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [],
  theme: {
    extend: {
      colors: {
        // Kaizen Brand Colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Kaizen-specific semantic colors
        focus: {
          DEFAULT: "hsl(var(--focus))",
          foreground: "hsl(var(--focus-foreground))",
        },
        pomodoro: {
          DEFAULT: "hsl(var(--pomodoro))",
          foreground: "hsl(var(--pomodoro-foreground))",
        },
        pulse: {
          DEFAULT: "hsl(var(--pulse))",
          foreground: "hsl(var(--pulse-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Oxygen",
          "Ubuntu",
          "Cantarell",
          "Fira Sans",
          "Droid Sans",
          "Helvetica Neue",
          "sans-serif",
        ],
        grotesk: [
          "Space Grotesk",
          "Inter",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
      boxShadow: {
        smooth: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        premium:
          "0 10px 30px -10px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.03)",
        "premium-lg":
          "0 20px 40px -15px rgb(0 0 0 / 0.1), 0 8px 12px -6px rgb(0 0 0 / 0.05)",
        glass:
          "0 8px 32px 0 rgba(0, 0, 0, 0.04), 0 1px 1px 0 rgba(255, 255, 255, 0.1) inset",
      },
      backgroundImage: {
        "mesh-gradient":
          "radial-gradient(at 0% 0%, hsla(210, 100%, 98%, 1) 0, transparent 50%), radial-gradient(at 50% 0%, hsla(222, 47%, 95%, 1) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(160, 84%, 95%, 1) 0, transparent 50%)",
        "mesh-gradient-dark":
          "radial-gradient(at 0% 0%, hsla(222, 47%, 10%, 1) 0, transparent 50%), radial-gradient(at 50% 0%, hsla(222, 47%, 5%, 1) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(160, 84%, 5%, 1) 0, transparent 50%)",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        blink: {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        blink: "blink 1s infinite",
        "float": "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
