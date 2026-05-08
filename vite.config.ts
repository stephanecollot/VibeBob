import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

const isomorphicGitEsm = fileURLToPath(
  new URL("./node_modules/isomorphic-git/index.js", import.meta.url),
);

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "isomorphic-git": isomorphicGitEsm,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5174 },
  },
  build: {
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      input: {
        offscreen: fileURLToPath(
          new URL("./src/offscreen/offscreen.html", import.meta.url),
        ),
      },
    },
  },
});
