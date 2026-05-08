import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
        serif: ['"Times New Roman"', "Times", "serif"],
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
export default config;
