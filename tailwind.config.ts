import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#16244D",
        "navy-2": "#1E3A8A",
        orange: "#F97316",
        "orange-soft": "#FFF1E6",
        gold: "#FFC53D",
        line: "#E3E8F2",
        muted: "#68738C",
      },
      fontFamily: {
        sans: ["Montserrat", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
