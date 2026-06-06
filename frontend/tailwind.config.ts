import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Space Grotesk for headings / technical chrome, Inter for body.
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        // back-compat alias (was `font-sora`)
        sora: ["var(--font-display)", "sans-serif"],
      },
      colors: {
        trust: {
          DEFAULT: "hsl(160,84%,46%)",
          soft: "hsl(160,70%,72%)",
        },
      },
    },
  },
  plugins: [],
}

export default config
