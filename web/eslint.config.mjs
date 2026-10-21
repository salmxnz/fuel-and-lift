import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["public/sw.js"],
    languageOptions: { globals: { self: "readonly", clients: "readonly", caches: "readonly" } },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
])
