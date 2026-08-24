import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Layout/type declarations shared with the main process. Pure modules
      // only — see electron/shared/layout.ts.
      "@shared": path.resolve(__dirname, "electron/shared"),
    },
  },
});
