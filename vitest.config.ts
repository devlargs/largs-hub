import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Unit tests target pure logic only; stub the electron API surface so
      // importing main-process modules never touches the real binary.
      electron: path.resolve(__dirname, "test/mocks/electron.ts"),
      // Same alias the app build uses, so a test can import a src module that
      // reaches for shared types or layout constants.
      "@shared": path.resolve(__dirname, "electron/shared"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
