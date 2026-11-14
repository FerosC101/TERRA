import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for science and engine code (plain TypeScript, Node environment).
// UI component tests would need jsdom and React Testing Library; none exist yet.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
