import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Unit tests target pure logic only; stub the electron API surface so
      // importing main-process modules never touches the real binary.
      electron: path.resolve(__dirname, "test/mocks/electron.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
