import type { Config } from "tailwindcss";
import baseConfig from "@kaizen/ui/tailwind.config";

const config: Config = {
  ...baseConfig,
  content: [
    "./**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
};

export default config;
