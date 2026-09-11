import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  // Project page on GitHub Pages is served under /zombie-emily/, so all
  // asset URLs the built bundle emits need that prefix. Irrelevant for
  // `npm run dev` (Vite ignores base under the dev server root).
  base: "/zombie-emily/",
  server: {
    port: 5173,
  },
});
