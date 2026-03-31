/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: "#1e1e2e",
        "sidebar-hover": "#313244",
        "sidebar-active": "#45475a",
        surface: "#181825",
        accent: "#89b4fa",
      },
    },
  },
  plugins: [],
};
