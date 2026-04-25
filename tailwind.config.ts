import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wa: {
          green: "#00a884",
          greenDark: "#008069",
          bg: "#efeae2",
          panel: "#f0f2f5",
          panelDark: "#d1d7db",
          bubbleOut: "#d9fdd3",
          bubbleIn: "#ffffff",
          text: "#111b21",
          textMuted: "#667781",
          sidebar: "#ffffff",
          chatBg: "#efeae2",
          border: "#e9edef",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
