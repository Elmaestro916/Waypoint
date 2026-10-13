import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sign: ['"Barlow Condensed"', "Barlow", "system-ui", "sans-serif"], body: ["Barlow", "system-ui", "sans-serif"] },
      colors: {
        ink: { 950: "#0a0d14", 900: "#0f1420", 800: "#161d2d", 700: "#1f2940", 600: "#2b3856" },
        accent: { DEFAULT: "#ff9900", soft: "#ffb84d" },
        mint: "#34d399",
        paper: "#f6f7f9",
        road: { ink: "#14171f", mute: "#5b6272", line: "#d3d7df", wash: "#eceef2", yellow: "#ffd23f", blue: "#1f4fff", deep: "#0f2fb8" },
      },
    },
  },
  plugins: [],
};
export default config;
