import { defineConfig } from "vite";

// Where the built site will be served from, as an absolute path with a
// trailing slash. Every asset URL in the bundle gets this prefix, so it has
// to match the deploy location exactly or the page loads and then 404s every
// script and texture.
//
// Default is the root Pages site (main). Branch previews are served from a
// subpath instead — see "Unapproved features and experiments ship as branch
// previews" in CLAUDE.md — so .github/workflows/preview.yml overrides this
// with /zombie-emily/preview/<branch>/.
//
// Irrelevant to `npm run dev`: Vite ignores base under the dev server root.
const base = process.env.PAGES_BASE ?? "/zombie-emily/";

export default defineConfig({
  root: ".",
  base,
  server: {
    port: 5173,
  },
});
