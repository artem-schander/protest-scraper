import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@test": path.resolve(__dirname, "./test"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    hookTimeout: 30000,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*"
    ],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: [
        // Infrastructure files (entry points, setup)
        "src/server.ts",
        "src/db/connection.ts",

        // External services (hard to mock)
        "src/services/email.ts",

        // CLI scripts (not part of core logic)
        "src/scripts/**",

        // Import scripts (operational, not core business logic)
        "src/scraper/import-to-db.ts",

        // Type definitions only
        "src/types/**",

        // Test files
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/test/**",

        // Config files
        "**/*.config.ts",
        "**/*.config.js",

        // Build output
        "dist/**",
        "**/node_modules/**",
      ],
    },
  },
});
