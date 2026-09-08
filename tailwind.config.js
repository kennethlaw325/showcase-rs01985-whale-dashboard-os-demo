/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f4f1ea",
        panel: "#fffdf8",
        line: "#d9d5cb",
        ink: "#27363e",
        muted: "#627078",
        brand: "#91c8bf",
        navy: "#28424d"
      },
      fontFamily: {
        sans: ["Avenir Next", "PingFang TC", "Noto Sans TC", "sans-serif"]
      }
    }
  },
  plugins: []
};
