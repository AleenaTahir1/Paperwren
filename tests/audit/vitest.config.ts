import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { alias: { "@": path.resolve("src") } },
	esbuild: { jsx: "automatic" },
	test: { environment: "jsdom", include: ["tests/audit/*.test.ts"] },
});
